import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { mintCredits, ensureTreasury } from "../lib/zecca/mint";
import { purchaseCredits } from "../lib/zecca/credits";
import { requestBonificoPurchase, confirmBonificoPurchase, saveShopBank } from "../lib/zecca/bank";
import { lastCustomerAddress, placeOrder, refreshOrderTracking } from "../lib/zecca/shop";
import { getForgeState } from "../lib/zecca/forge";
import {
  convertTreasuryAndWithdrawToWallet,
  executeGenerationPayouts,
  fulfillWalletCashoutFromShop,
  materializeCashoutFromProof,
  requestAndFulfillCashout,
  requestCustomerCashout,
  requestInternalCryptoWithdraw,
  resolveCashout,
  settleQueuedWalletCashouts,
} from "../lib/zecca/cashout";
import { saveSettings, DEFAULT_SETTINGS } from "../lib/zecca/settings";
import { assertWithdrawPolicy, WITHDRAW_BROADCASTING } from "../lib/zecca/withdraw-policy";
import { cashoutProofStatus, proofFromPaidCashout, signCashoutProof, verifyCashoutProof } from "../lib/cashout-proof";
import { explorerLinks, explorerUrl, parsePayoutReceipt } from "../lib/receipt";
import { classifyCashout, settlementPhase } from "../lib/zecca/settlement";
import { transmitAllSummary } from "../lib/zecca/transmit";
import { executeCryptoSettlement } from "../lib/settlement/pipeline";
import { executeLiquidityDisbursal, executeSepaDisbursal } from "../lib/settlement/gateways";
import { mintContractForAsset } from "../lib/zecca/token-mint";
import { buildPain001Document } from "../lib/zecca/pain001";
import { wiseApiConfig } from "../lib/zecca/wise-dispatch";
import { encodeErc20Transfer, nativeWeiFromUsdCents, tokenAmountFromUsdCents } from "../lib/evm-send";
import { isShopEvmConfigured, shopPayoutConfigError, shopWalletAddress } from "../lib/zecca/shop-payout";
import { shopBtcAddress } from "../lib/zecca/btc-payout";
import { getShopNetworkVault } from "../lib/zecca/shop-vault";
import { convertTreasuryToShopCash, convertTreasuryToShopFiat, shopCryptoBalances, shopFiatBalances } from "../lib/zecca/convert";
import { pocketBalance, treasuryBalance } from "../lib/zecca/ledger";
import { getReserveReport } from "../lib/zecca/reserves";
import { ensureHouseWalletCredits, grantHouseCredits, houseDisplayName, HOUSE_PAYOUT_ACCOUNTS, isHouseEmail } from "../lib/zecca/house";
import { isValidIban } from "../lib/iban";
import { CATALOG_SEED, catalogProductFields, SHOP_CATEGORIES } from "../lib/catalog";
import { attachCatalogSuppliers, SUPPLIER_SEED } from "../lib/suppliers";

const dbPath = path.join(process.cwd(), "prisma", "test.db");
const dbUrl = "file:./test.db";

async function main() {
  delete process.env.ZECCA_EVM_PRIVATE_KEY;
  if (existsSync(dbPath)) unlinkSync(dbPath);
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    const admin = await db.user.create({
      data: {
        email: "admin@test.local",
        name: "Massimo Test",
        passwordHash: await hash("passwordpassword", 10),
        role: "ADMIN",
      },
    });
    const customer = await db.user.create({
      data: {
        email: "cliente@test.local",
        name: "Chiara Test",
        passwordHash: await hash("passwordpassword", 10),
        role: "CUSTOMER",
      },
    });

    await db.setting.createMany({
      data: [
        { key: "eurCentsPerCredit", value: String(DEFAULT_SETTINGS.eurCentsPerCredit) },
        { key: "usdCentsPerCredit", value: String(DEFAULT_SETTINGS.usdCentsPerCredit) },
        { key: "chfCentsPerCredit", value: String(DEFAULT_SETTINGS.chfCentsPerCredit) },
        { key: "forgeTiers", value: JSON.stringify(DEFAULT_SETTINGS.forgeTiers) },
      ],
    });

    const supplier = await db.supplier.create({
      data: {
        slug: "saponificio-test",
        name: "Saponificio Test",
        company: "Saponificio Test",
        street: "Via Prove 1",
        city: "Taggia",
        postal: "18018",
        phone: "+390184000001",
        email: "test@fornitore.test",
      },
    });
    const product = await db.product.create({
      data: {
        slug: "sapone-test",
        name: "Sapone test",
        description: "Pezzo di prova",
        imageKey: "sapone",
        priceCredits: 50,
        stock: 10,
        active: true,
        supplierId: supplier.id,
      },
    });

    await mintCredits({ amount: 1000, note: "Lotto di prova", actorId: admin.id, db });
    assert.equal(await treasuryBalance(db), 1000);

    await purchaseCredits({ userId: customer.id, credits: 200, method: "demo", db });
    assert.equal(await treasuryBalance(db), 800);
    assert.equal(await pocketBalance("USER", customer.id, db), 200);

    await ensureTreasury({ needed: 9000, actorId: admin.id, db });
    assert.equal(await treasuryBalance(db), 9000);

    await mintCredits({ amount: 1_000_001, note: "Oltre il vecchio tetto", actorId: admin.id, db });
    assert.equal(await treasuryBalance(db), 1_009_001);

    await placeOrder({
      userId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        shipTo: "CUSTOMER",
        shipName: "Chiara Test",
        shipStreet: "Via Roma 12",
        shipCity: "Genova",
        shipPostal: "16121",
        shipPhone: "+390101234567",
      },
      db,
    });
    assert.equal(await pocketBalance("USER", customer.id, db), 132);
    const stock = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(stock.stock, 9);
    const paidOrder = await db.order.findFirstOrThrow({
      where: { userId: customer.id },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(paidOrder.shippingCredits, 18);
    assert.equal(paidOrder.carrier, "DHL_EXPRESS");
    assert.ok(paidOrder.trackingNumber);
    assert.ok(paidOrder.dhlTrackStatus);
    const dhlShipments = await db.shipment.findMany({ where: { orderId: paidOrder.id } });
    assert.equal(dhlShipments.length, 1);
    assert.equal(dhlShipments[0].supplierName, "Saponificio Test");
    assert.ok(dhlShipments[0].trackingNumber);
    assert.match(dhlShipments[0].dhlTrackDetail ?? "", /Massimo non tocca|Taggia|fornitore/i);

    const remembered = await lastCustomerAddress(customer.id, db);
    assert.equal(remembered?.shipCity, "Genova");
    assert.equal(remembered?.shipPostal, "16121");

    const refreshed = await refreshOrderTracking(paidOrder.id, db);
    assert.ok(refreshed.dhlTrackStatus);

    const forge = await getForgeState({ userId: customer.id, role: "CUSTOMER", db });
    assert.equal(forge.spentToday, 68);
    assert.equal(forge.percent, 20);
    assert.equal(forge.forged, 26);

    const handProduct = await db.product.create({
      data: {
        slug: "taccuino-test",
        name: "Taccuino test",
        description: "Consegna in sede",
        imageKey: "taccuino",
        priceCredits: 2,
        stock: 4,
        active: true,
        supplierId: supplier.id,
      },
    });
    await placeOrder({
      userId: customer.id,
      items: [{ productId: handProduct.id, quantity: 1 }],
      shipping: {
        shipTo: "MASSIMO",
        shipName: "Massimo Fornara",
        shipStreet: "Casa della Zecca, via del Frantoio 1",
        shipCity: "San Rocco al Forno",
        shipPostal: "18012",
      },
      db,
    });
    assert.equal(await pocketBalance("USER", customer.id, db), 130);
    const handOrder = await db.order.findFirstOrThrow({
      where: { userId: customer.id, carrier: "HAND" },
    });
    assert.equal(handOrder.shippingCredits, 0);
    assert.equal(handOrder.shipTo, "MASSIMO");
    const handShipments = await db.shipment.findMany({ where: { orderId: handOrder.id } });
    assert.equal(handShipments.length, 1);
    assert.equal(handShipments[0].supplierCity, "Taggia");
    const stillCustomerAddress = await lastCustomerAddress(customer.id, db);
    assert.equal(stillCustomerAddress?.shipCity, "Genova");

    const supplierSlugs = new Set<string>(SUPPLIER_SEED.map((supplier) => supplier.slug));
    const catalogSlugs = new Set<string>();
    assert.ok(CATALOG_SEED.length >= 36, "la vetrina deve avere decine di pezzi");
    assert.equal(SHOP_CATEGORIES.length, 6);
    for (const product of CATALOG_SEED) {
      assert.ok(supplierSlugs.has(product.supplierSlug), `${product.slug} senza fornitore`);
      assert.ok(!catalogSlugs.has(product.slug), `slug doppio ${product.slug}`);
      catalogSlugs.add(product.slug);
      assert.ok(product.priceCredits > 0);
      assert.ok(product.stock > 0);
    }

    const catalogSuppliers = await attachCatalogSuppliers(db);
    const shopSeeds = CATALOG_SEED.filter((product) =>
      ["sale-della-macchia", "inchiostro-di-noce", "tisana-del-crinale"].includes(product.slug),
    );
    const shopLines = [];
    for (const seed of shopSeeds) {
      const created = await db.product.upsert({
        where: { slug: seed.slug },
        create: {
          ...catalogProductFields(seed),
          active: true,
          supplierId: catalogSuppliers.get(seed.supplierSlug)?.id,
        },
        update: {
          ...catalogProductFields(seed),
          active: true,
          supplierId: catalogSuppliers.get(seed.supplierSlug)?.id,
        },
      });
      shopLines.push({ productId: created.id, quantity: 1 });
    }
    await purchaseCredits({ userId: customer.id, credits: 200, method: "demo", db });
    const shopOrder = await placeOrder({
      userId: customer.id,
      items: shopLines,
      shipping: {
        shipTo: "CUSTOMER",
        shipName: "Chiara Test",
        shipStreet: "Via Roma 12",
        shipCity: "Genova",
        shipPostal: "16121",
        shipPhone: "+390101234567",
      },
      db,
    });
    const shopShipments = await db.shipment.findMany({ where: { orderId: shopOrder.id } });
    assert.equal(shopShipments.length, 3);
    assert.ok(shopShipments.every((shipment) => shipment.trackingNumber));
    assert.ok(shopShipments.every((shipment) => shipment.supplierCity));
    const shopCities = new Set(shopShipments.map((shipment) => shipment.supplierCity));
    assert.ok(shopCities.has("Andora"));
    assert.ok(shopCities.has("Noli"));
    assert.ok(shopCities.has("Pigna"));

    const cashout = await requestCustomerCashout({
      userId: customer.id,
      role: "CUSTOMER",
      credits: 80,
      payoutKind: "IBAN",
      iban: "IT60X0542811101000000123456",
      ibanHolder: "Chiara Test",
      db,
    });
    assert.equal(await pocketBalance("USER", customer.id, db), 148);
    assert.equal(await pocketBalance("ESCROW", customer.id, db), 80);

    let badIban = false;
    try {
      await requestCustomerCashout({
        userId: customer.id,
        role: "CUSTOMER",
        credits: 1,
        iban: "IT00INVALID",
        ibanHolder: "Chiara Test",
        db,
      });
    } catch (error) {
      badIban = error instanceof Error && error.message.includes("IBAN non valido");
    }
    assert.equal(badIban, true, "IBAN invalido deve fallire");

    const pending = await db.cashoutRequest.findMany({ where: { status: "PENDING" } });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, cashout.id);
    assert.equal(pending[0].payoutKind, "IBAN");

    const walletOut = await requestCustomerCashout({
      userId: customer.id,
      role: "CUSTOMER",
      credits: 20,
      payoutKind: "WALLET",
      walletNetwork: "ETH",
      walletAddress: "0x4166ca49529dff2014c2e085143e88fd0d624cf5",
      db,
    });
    assert.equal(walletOut.payoutKind, "WALLET");
    assert.equal(await pocketBalance("USER", customer.id, db), 128);
    assert.equal(await pocketBalance("ESCROW", customer.id, db), 100);

    let badWallet = false;
    try {
      await requestCustomerCashout({
        userId: customer.id,
        role: "CUSTOMER",
        credits: 1,
        payoutKind: "WALLET",
        walletNetwork: "ETH",
        walletAddress: "not-an-address",
        db,
      });
    } catch (error) {
      badWallet = error instanceof Error && error.message.includes("wallet");
    }
    assert.equal(badWallet, true, "wallet invalido deve fallire");

    let missingReceipt = false;
    try {
      await resolveCashout({ cashoutId: cashout.id, actorId: admin.id, action: "pay", db });
    } catch (error) {
      missingReceipt = error instanceof Error && error.message.includes("CRO");
    }
    assert.equal(missingReceipt, true, "senza CRO il bonifico non si chiude");

    const fakeEthHash = `0x${"ab".repeat(32)}`;
    const realEthHash = "0x6d481a746b116d17d56c80561957cfb1652189a01e3ae32166e5e2bc67463309";
    let fakeHash = false;
    try {
      await resolveCashout({
        cashoutId: walletOut.id,
        actorId: admin.id,
        action: "pay",
        receipt: fakeEthHash,
        db,
      });
    } catch (error) {
      fakeHash = error instanceof Error && error.message.includes("non esiste");
    }
    assert.equal(fakeHash, true, "un hash inventato non chiude un prelievo crypto");

    await resolveCashout({
      cashoutId: cashout.id,
      actorId: admin.id,
      action: "pay",
      receipt: "CRO-UNICREDIT-2212",
      db,
    });
    await resolveCashout({
      cashoutId: walletOut.id,
      actorId: admin.id,
      action: "pay",
      receipt: realEthHash,
      db,
    });
    assert.equal(await pocketBalance("ESCROW", customer.id, db), 0);
    const paid = await db.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
    assert.equal(paid.status, "PAID");
    assert.equal(paid.receiptKind, "BANK_REF");
    assert.equal(paid.receiptRef, "CRO-UNICREDIT-2212");
    const paidWallet = await db.cashoutRequest.findUniqueOrThrow({ where: { id: walletOut.id } });
    assert.equal(paidWallet.receiptKind, "TX_HASH");
    assert.equal(paidWallet.receiptRef, realEthHash);
    assert.equal(paidWallet.receiptUrl, explorerUrl("ETH", realEthHash));
    const ethExplorers = explorerLinks("ETH", realEthHash).map((link) => link.url).join(" ");
    assert.equal(ethExplorers.includes("etherscan.io"), true);
    assert.equal(ethExplorers.includes("blockscout.com"), true);
    const bscExplorers = explorerLinks("BNB", realEthHash).map((link) => link.url).join(" ");
    assert.equal(bscExplorers.includes("bscscan.com"), true);
    assert.equal(explorerLinks("BTC", "ab".repeat(32)).some((link) => link.url.includes("mempool.space")), true);
    assert.equal(tokenAmountFromUsdCents(10_800_000, 6), BigInt(108_000) * BigInt(1_000_000));
    assert.equal(nativeWeiFromUsdCents(10_800_000, 3000, 18), BigInt(36) * BigInt("1000000000000000000"));
    assert.equal(
      encodeErc20Transfer("0x1541922525fCa35bc398070E96C599B48c935F38", BigInt(1)).startsWith("0xa9059cbb"),
      true,
    );

    const types = await db.ledgerEntry.groupBy({ by: ["type"], _count: true });
    const typeSet = new Set(types.map((t) => t.type));
    for (const needed of ["MINT", "PURCHASE_CREDITS", "SPEND_ON_ORDER", "CASHOUT_REQUEST", "CASHOUT_PAID"]) {
      assert.equal(typeSet.has(needed as never), true, `manca ${needed} nel libro`);
    }

    const reserve = await getReserveReport(db);
    assert.equal(reserve.stripeEurCents, 0);
    assert.equal(reserve.fullyReserved, false);
    assert.equal(reserve.reserveRatio, 0);

    const beforeConvert = await treasuryBalance(db);
    const converted = await convertTreasuryToShopFiat({
      actorId: admin.id,
      creditsEur: 3000,
      creditsUsd: 2000,
      db,
    });
    assert.equal(converted.creditsEur, 3000);
    assert.equal(converted.eurCents, 300000);
    assert.equal(converted.creditsUsd, 2000);
    assert.equal(converted.usdCents, 216000);
    assert.equal(await treasuryBalance(db), beforeConvert - 5000);
    const shop = await shopFiatBalances(db);
    assert.equal(shop.treasuryEurCents, 300000);
    assert.equal(shop.treasuryUsdCents, 216000);

    const convertRows = await db.ledgerEntry.findMany({
      where: { type: { in: ["TREASURY_CONVERT_TO_EUR", "TREASURY_CONVERT_TO_USD", "TREASURY_CONVERT_TO_CHF"] } },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(convertRows.length, 2);
    assert.equal(convertRows[0].type, "TREASURY_CONVERT_TO_EUR");
    assert.equal(convertRows[0].amountCredits, 3000);
    assert.equal(convertRows[0].eurCents, 300000);
    assert.equal(convertRows[1].type, "TREASURY_CONVERT_TO_USD");
    assert.equal(convertRows[1].amountCredits, 2000);
    assert.equal(convertRows[1].usdCents, 216000);

    const chfConverted = await convertTreasuryToShopCash({
      actorId: admin.id,
      creditsChf: 500,
      db,
    });
    assert.equal(chfConverted.creditsChf, 500);
    assert.equal(chfConverted.chfCents, 47000);
    assert.equal((await shopFiatBalances(db)).treasuryChfCents, 47000);

    const beforeCrypto = await treasuryBalance(db);
    const cryptoConverted = await convertTreasuryToShopCash({
      actorId: admin.id,
      creditsCrypto: 1000,
      cryptoAsset: "BTC",
      db,
    });
    assert.equal(cryptoConverted.creditsCrypto, 1000);
    assert.equal(cryptoConverted.cryptoAsset, "BTC");
    assert.equal(cryptoConverted.cryptoUsdCents, 108000);
    assert.equal(await treasuryBalance(db), beforeCrypto - 1000);
    const btcBook = await shopCryptoBalances(db);
    assert.equal(btcBook.BTC.credits, 1000);
    assert.equal(btcBook.BTC.remainingCredits, 1000);
    assert.equal(btcBook.BTC.usdCents, 108000);
    assert.equal(btcBook.ETH.remainingCredits, 0);

    const btcOut = await requestInternalCryptoWithdraw({
      actorId: admin.id,
      credits: 400,
      asset: "BTC",
      walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      shopSend: false,
      db,
    });
    assert.equal(btcOut.status, "PENDING");
    assert.equal(btcOut.isTreasury, true);
    assert.equal(btcOut.walletNetwork, "BTC");
    assert.equal(btcOut.usdCents, 43200);
    assert.equal((await shopCryptoBalances(db)).BTC.remainingCredits, 600);

    await assert.rejects(
      () =>
        requestInternalCryptoWithdraw({
          actorId: admin.id,
          credits: 601,
          asset: "BTC",
          walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
          shopSend: false,
          db,
        }),
      /wallet interno BTC ha 600/,
    );

    const ethConverted = await convertTreasuryToShopCash({
      actorId: admin.id,
      creditsCrypto: 200,
      cryptoAsset: "ETH",
      db,
    });
    assert.equal(ethConverted.cryptoUsdCents, 21600);
    const booksAfterEth = await shopCryptoBalances(db);
    assert.equal(booksAfterEth.ETH.remainingCredits, 200);
    assert.equal(booksAfterEth.BTC.remainingCredits, 600);

    const beforeUsdt = await treasuryBalance(db);
    await assert.rejects(
      () =>
        convertTreasuryAndWithdrawToWallet({
          actorId: admin.id,
          creditsCrypto: 50,
          cryptoAsset: "USDT",
          walletAddress: "not-a-wallet",
          shopSend: false,
          db,
        }),
      /Indirizzo non valido/,
    );
    assert.equal(await treasuryBalance(db), beforeUsdt);
    assert.equal((await shopCryptoBalances(db)).USDT.remainingCredits, 0);

    const usdtDest = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    const combined = await convertTreasuryAndWithdrawToWallet({
      actorId: admin.id,
      creditsCrypto: 150,
      cryptoAsset: "USDT",
      walletAddress: usdtDest,
      shopSend: false,
      db,
    });
    assert.equal(combined.converted.creditsEur, 0);
    assert.equal(combined.converted.creditsCrypto, 150);
    assert.equal(combined.converted.cryptoAsset, "USDT");
    assert.ok(combined.cashout);
    assert.equal(combined.cashout.status, "PENDING");
    assert.equal(combined.cashout.isTreasury, true);
    assert.equal(combined.cashout.walletNetwork, "USDT");
    assert.equal(combined.cashout.walletAddress, usdtDest);
    assert.equal(await treasuryBalance(db), beforeUsdt - 150);
    const booksAfterUsdt = await shopCryptoBalances(db);
    assert.equal(booksAfterUsdt.USDT.credits, 150);
    assert.equal(booksAfterUsdt.USDT.remainingCredits, 0);
    assert.equal(booksAfterUsdt.USDT.reservedCredits, 150);
    assert.equal(booksAfterUsdt.ETH.remainingCredits, 200);
    const usdtConvert = await db.ledgerEntry.findFirst({
      where: { type: "TREASURY_CONVERT_TO_CRYPTO", amountCredits: 150 },
    });
    assert.ok(usdtConvert);
    assert.match(usdtConvert.note ?? "", /USDT/);
    assert.match(usdtConvert.metadata ?? "", /"asset":"USDT"/);

    const rejected = await resolveCashout({
      cashoutId: btcOut.id,
      actorId: admin.id,
      action: "reject",
      db,
    });
    assert.equal(rejected.status, "REJECTED");
    assert.equal((await shopCryptoBalances(db)).BTC.remainingCredits, 1000);

    await assert.rejects(
      () =>
        assertWithdrawPolicy({
          address: "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
          network: "ETH",
          usdCents: 108,
          db,
        }),
      /Checksum EIP-55/,
    );
    await assertWithdrawPolicy({
      address: "0x742d35cc6634c0532925a3b844bc454e4438f44e",
      network: "ETH",
      usdCents: 108,
      db,
    });

    await saveSettings(
      {
        withdrawWhitelist: ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"],
        withdrawWhitelistEnforced: true,
      },
      admin.id,
      db,
    );
    await assert.rejects(
      () =>
        requestInternalCryptoWithdraw({
          actorId: admin.id,
          credits: 1,
          asset: "BTC",
          walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
          shopSend: false,
          db,
        }),
      /whitelist/,
    );
    const allowedOut = await requestInternalCryptoWithdraw({
      actorId: admin.id,
      credits: 1,
      asset: "BTC",
      walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      shopSend: false,
      db,
    });
    assert.equal(allowedOut.status, "PENDING");
    await resolveCashout({ cashoutId: allowedOut.id, actorId: admin.id, action: "reject", db });

    await saveSettings(
      { withdrawWhitelist: [], withdrawWhitelistEnforced: false, withdrawMaxCountPerHour: 1 },
      admin.id,
      db,
    );
    await assert.rejects(
      () =>
        requestInternalCryptoWithdraw({
          actorId: admin.id,
          credits: 1,
          asset: "BTC",
          walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
          shopSend: false,
          db,
        }),
      /Troppi prelievi crypto/,
    );

    await saveSettings({ withdrawMaxCountPerHour: DEFAULT_SETTINGS.withdrawMaxCountPerHour, withdrawMaxUsdCentsPerDay: 1 }, admin.id, db);
    await assert.rejects(
      () =>
        requestInternalCryptoWithdraw({
          actorId: admin.id,
          credits: 1,
          asset: "BTC",
          walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
          shopSend: false,
          db,
        }),
      /massimale giornaliero/,
    );

    await saveSettings(
      {
        withdrawMaxUsdCentsPerDay: DEFAULT_SETTINGS.withdrawMaxUsdCentsPerDay,
        withdrawMaxUsdCentsPerTx: 50,
      },
      admin.id,
      db,
    );
    await assert.rejects(
      () =>
        requestInternalCryptoWithdraw({
          actorId: admin.id,
          credits: 1,
          asset: "BTC",
          walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
          shopSend: false,
          db,
        }),
      /massimale per singola uscita/,
    );

    await saveSettings(
      {
        withdrawMaxUsdCentsPerTx: DEFAULT_SETTINGS.withdrawMaxUsdCentsPerTx,
        withdrawMaxUsdCentsPerDay: DEFAULT_SETTINGS.withdrawMaxUsdCentsPerDay,
        withdrawMaxCountPerHour: DEFAULT_SETTINGS.withdrawMaxCountPerHour,
        withdrawMinUsdCents: DEFAULT_SETTINGS.withdrawMinUsdCents,
        withdrawWhitelist: [],
        withdrawWhitelistEnforced: false,
      },
      admin.id,
      db,
    );

    const lockOut = await requestInternalCryptoWithdraw({
      actorId: admin.id,
      credits: 1,
      asset: "BTC",
      walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      shopSend: false,
      db,
    });
    await db.cashoutRequest.update({
      where: { id: lockOut.id },
      data: { receiptKind: WITHDRAW_BROADCASTING },
    });
    await assert.rejects(
      () => fulfillWalletCashoutFromShop({ cashoutId: lockOut.id, actorId: admin.id, db }),
      /già in corso/,
    );
    await db.cashoutRequest.update({
      where: { id: lockOut.id },
      data: { receiptKind: null },
    });
    await resolveCashout({ cashoutId: lockOut.id, actorId: admin.id, action: "reject", db });
    assert.equal((await shopCryptoBalances(db)).BTC.remainingCredits, 1000);

    const payer = await db.user.create({
      data: {
        email: "payer@test.local",
        name: "Payer Test",
        passwordHash: await hash("passwordpassword", 10),
        role: "CUSTOMER",
      },
    });
    await saveShopBank(
      { iban: "IT60X0542811101000000123456", holder: "NeoNoble Test", bankName: "Banca Test" },
      db,
    );
    const asked = await requestBonificoPurchase({ userId: payer.id, credits: 40, db });
    assert.equal(asked.purchase.status, "pending");
    assert.ok(asked.purchase.reference?.startsWith("ZECCA-"));
    assert.equal(await pocketBalance("USER", payer.id, db), 0);
    await confirmBonificoPurchase({ purchaseId: asked.purchase.id, actorId: admin.id, db });
    assert.equal(await pocketBalance("USER", payer.id, db), 40);
    const banked = await db.creditPurchase.findUniqueOrThrow({ where: { id: asked.purchase.id } });
    assert.equal(banked.status, "completed");
    const afterBank = await getReserveReport(db);
    assert.equal(afterBank.stripeEurCents, 4000);

    assert.equal(isHouseEmail("Massimo.Fornara.2212@gmail.com"), true);
    assert.equal(isHouseEmail("massimofornara2212@gmail.com"), true);
    assert.equal(isHouseEmail("massimo.fornara.2212+casa@gmail.com"), true);
    assert.equal(isHouseEmail("massimo.fornara.2212@googlemail.com"), true);
    assert.equal(isHouseEmail("massimo@zecca.local"), true);
    assert.equal(isHouseEmail("mfornara93@gmail.com"), true);
    assert.equal(isHouseEmail("m.fornara93@gmail.com"), true);
    assert.equal(isHouseEmail("chiara@zecca.local"), false);
    assert.equal(houseDisplayName("massimofornara2212@gmail.com"), "Massimo");
    assert.equal(houseDisplayName("massimo.fornara.2212@gmail.com"), "Massimo");
    assert.equal(houseDisplayName("massimo@zecca.local"), "Massimo");
    assert.equal(houseDisplayName("mfornara93@gmail.com"), "Maxi");
    for (const account of HOUSE_PAYOUT_ACCOUNTS) {
      assert.equal(isValidIban(account.iban), true, `${account.bank} IBAN deve essere valido`);
    }
    assert.equal(HOUSE_PAYOUT_ACCOUNTS[0].iban, "IT22B0200822800000103317304");
    assert.equal(HOUSE_PAYOUT_ACCOUNTS[1].iban, "BE06967614820722");
    assert.equal(HOUSE_PAYOUT_ACCOUNTS[1].holder, "NeoNoble Company");
    assert.equal(HOUSE_PAYOUT_ACCOUNTS[2].id, "wise-chf");
    assert.equal(HOUSE_PAYOUT_ACCOUNTS[2].preferredCurrency, "CHF");

    const houseA = await db.user.create({
      data: {
        email: "mfornara93@gmail.com",
        name: "Massimo Casa",
        passwordHash: await hash("passwordpassword", 10),
        role: "CUSTOMER",
      },
    });
    const houseB = await db.user.create({
      data: {
        email: "massimo.fornara.2212@gmail.com",
        name: "Massimo Gmail",
        passwordHash: await hash("passwordpassword", 10),
        role: "CUSTOMER",
      },
    });

    let strangerGrant = false;
    try {
      await grantHouseCredits({ userId: customer.id, credits: 10, db });
    } catch (error) {
      strangerGrant = error instanceof Error && error.message.includes("possono generare");
    }
    assert.equal(strangerGrant, true, "un cliente qualunque non genera crediti gratis");

    const granted = await grantHouseCredits({ userId: houseA.id, credits: 250, db });
    assert.equal(granted.credits, 250);
    assert.equal(granted.eurCents, 25000);
    assert.equal(granted.usdCents, 27000);
    assert.equal(await pocketBalance("USER", houseA.id, db), 250);
    const houseRole = await db.user.findUniqueOrThrow({ where: { id: houseA.id } });
    assert.equal(houseRole.role, "ADMIN");
    const grantRow = await db.ledgerEntry.findFirstOrThrow({
      where: { type: "HOUSE_GRANT", toUserId: houseA.id },
    });
    assert.equal(grantRow.fromPocket, "VOID");
    assert.equal(grantRow.toPocket, "USER");
    assert.equal(grantRow.type, "HOUSE_GRANT");

    const usdCashout = await requestCustomerCashout({
      userId: houseA.id,
      role: "ADMIN",
      credits: 100,
      currency: "USD",
      payoutKind: "IBAN",
      iban: HOUSE_PAYOUT_ACCOUNTS[1].iban,
      ibanHolder: HOUSE_PAYOUT_ACCOUNTS[1].holder,
      db,
    });
    assert.equal(usdCashout.currency, "USD");
    assert.equal(usdCashout.usdCents, 10800);
    assert.equal(usdCashout.eurCents, 0);
    assert.equal(usdCashout.iban, "BE06967614820722");
    assert.equal(usdCashout.ibanHolder, "NeoNoble Company");

    const eurCashout = await requestCustomerCashout({
      userId: houseA.id,
      role: "ADMIN",
      credits: 50,
      currency: "EUR",
      payoutKind: "IBAN",
      iban: HOUSE_PAYOUT_ACCOUNTS[0].iban,
      ibanHolder: HOUSE_PAYOUT_ACCOUNTS[0].holder,
      db,
    });
    assert.equal(eurCashout.iban, "IT22B0200822800000103317304");
    assert.equal(eurCashout.currency, "EUR");
    assert.equal(eurCashout.eurCents, 5000);
    assert.equal(await pocketBalance("USER", houseA.id, db), 100);

    const chfCashout = await requestCustomerCashout({
      userId: houseA.id,
      role: "ADMIN",
      credits: 40,
      currency: "CHF",
      payoutKind: "IBAN",
      iban: HOUSE_PAYOUT_ACCOUNTS[2].iban,
      ibanHolder: HOUSE_PAYOUT_ACCOUNTS[2].holder,
      db,
    });
    assert.equal(chfCashout.currency, "CHF");
    assert.equal(chfCashout.chfCents, 3760);
    assert.equal(chfCashout.eurCents, 0);
    assert.equal(chfCashout.usdCents, 0);
    assert.equal(chfCashout.iban, "BE06967614820722");
    assert.equal(await pocketBalance("USER", houseA.id, db), 60);

    await resolveCashout({
      cashoutId: chfCashout.id,
      actorId: houseA.id,
      action: "pay",
      receipt: "WISE-CHF-SIC-1",
      db,
    });
    assert.equal((await db.cashoutRequest.findUniqueOrThrow({ where: { id: chfCashout.id } })).status, "PAID");

    await resolveCashout({
      cashoutId: usdCashout.id,
      actorId: houseA.id,
      action: "pay",
      receipt: "SWIFT-WISE-NEONOBLE-1",
      db,
    });
    const paidUsd = await db.cashoutRequest.findUniqueOrThrow({ where: { id: usdCashout.id } });
    assert.equal(paidUsd.status, "PAID");
    assert.equal(paidUsd.currency, "USD");

    await grantHouseCredits({ userId: houseB.id, credits: 10, db });
    assert.equal(await pocketBalance("USER", houseB.id, db), 10);
    const usdtOut = await requestCustomerCashout({
      userId: houseB.id,
      role: "ADMIN",
      credits: 10,
      payoutKind: "WALLET",
      walletNetwork: "USDT",
      walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      db,
    });
    assert.equal(usdtOut.payoutKind, "WALLET");
    assert.equal(usdtOut.walletNetwork, "USDT");
    assert.equal(usdtOut.currency, "USD");
    assert.equal(usdtOut.usdCents, 1080);
    assert.equal(usdtOut.eurCents, 1000);
    assert.equal(await pocketBalance("USER", houseB.id, db), 0);
    const topped = await ensureHouseWalletCredits({ userId: houseB.id, credits: 25, db });
    assert.equal(topped, 25);
    assert.equal(await pocketBalance("USER", houseB.id, db), 25);
    const instantBank = await requestAndFulfillCashout({
      userId: houseB.id,
      role: "ADMIN",
      credits: 25,
      payoutKind: "IBAN",
      currency: "EUR",
      iban: HOUSE_PAYOUT_ACCOUNTS[0].iban,
      ibanHolder: HOUSE_PAYOUT_ACCOUNTS[0].holder,
      db,
    });
    assert.equal(instantBank.status, "PENDING");
    assert.equal(instantBank.receiptRef, null);
    assert.equal(await pocketBalance("USER", houseB.id, db), 0);
    let rejectedLedgerRef = false;
    try {
      await resolveCashout({
        cashoutId: instantBank.id,
        actorId: houseB.id,
        action: "pay",
        receipt: "ZECCA/EUR/20260909/FAKELEDG",
        db,
      });
    } catch {
      rejectedLedgerRef = true;
    }
    assert.equal(rejectedLedgerRef, true, "un codice ZECCA/ non chiude un bonifico");
    await resolveCashout({
      cashoutId: instantBank.id,
      actorId: houseB.id,
      action: "pay",
      receipt: "UNICREDIT-CRO-TEST-2212",
      db,
    });
    const paidBank = await db.cashoutRequest.findUniqueOrThrow({ where: { id: instantBank.id } });
    assert.equal(paidBank.status, "PAID");
    assert.equal(paidBank.receiptKind, "BANK_REF");
    assert.equal(paidBank.receiptRef, "UNICREDIT-CRO-TEST-2212");
    assert.equal(paidBank.receiptHash?.length, 64);
    const bankProof = proofFromPaidCashout({ ...paidBank, userName: "Maxi" });
    const bankToken = signCashoutProof(bankProof);
    assert.equal(verifyCashoutProof(bankToken)?.id, paidBank.id);
    assert.equal(verifyCashoutProof(`${bankToken}x`), null);
    assert.equal(verifyCashoutProof("not-a-token"), null);
    assert.equal(await pocketBalance("USER", houseB.id, db), 0);

    await ensureHouseWalletCredits({ userId: houseB.id, credits: 15, db });
    const otherLambda = await requestAndFulfillCashout({
      userId: houseB.id,
      role: "ADMIN",
      credits: 15,
      payoutKind: "IBAN",
      currency: "EUR",
      iban: HOUSE_PAYOUT_ACCOUNTS[0].iban,
      ibanHolder: HOUSE_PAYOUT_ACCOUNTS[0].holder,
      db,
    });
    const pendingProof = proofFromPaidCashout({
      ...otherLambda,
      userName: "Maxi",
      status: "PENDING",
    });
    assert.equal(cashoutProofStatus(pendingProof), "PENDING");
    await db.ledgerEntry.deleteMany({ where: { cashoutId: otherLambda.id } });
    await db.cashoutRequest.delete({ where: { id: otherLambda.id } });
    const restored = await materializeCashoutFromProof({
      proof: pendingProof,
      actorId: houseB.id,
      db,
    });
    assert.equal(restored.id, otherLambda.id);
    assert.equal(restored.status, "PENDING");
    const same = await materializeCashoutFromProof({
      proof: pendingProof,
      actorId: houseB.id,
      db,
    });
    assert.equal(same.id, restored.id);
    await resolveCashout({
      cashoutId: restored.id,
      actorId: houseB.id,
      action: "pay",
      receipt: "UNICREDIT-CRO-LAMBDA-2",
      db,
    });
    assert.equal((await db.cashoutRequest.findUniqueOrThrow({ where: { id: restored.id } })).status, "PAID");
    assert.equal(await pocketBalance("USER", houseB.id, db), 0);

    const aliasUser = await db.user.create({
      data: {
        email: "massimofornara2212@gmail.com",
        name: "Punto Gmail",
        passwordHash: await hash("passwordpassword", 10),
        role: "CUSTOMER",
      },
    });
    assert.equal(isHouseEmail(aliasUser.email), true);
    const bigGap = await ensureHouseWalletCredits({ userId: aliasUser.id, credits: 10_000, db });
    assert.equal(bigGap, 10_000);
    assert.equal(await pocketBalance("USER", aliasUser.id, db), 10_000);
    const bigOut = await requestAndFulfillCashout({
      userId: aliasUser.id,
      role: "ADMIN",
      credits: 10_000,
      payoutKind: "IBAN",
      currency: "EUR",
      iban: HOUSE_PAYOUT_ACCOUNTS[0].iban,
      ibanHolder: HOUSE_PAYOUT_ACCOUNTS[0].holder,
      db,
    });
    assert.equal(bigOut.credits, 10_000);
    assert.equal(bigOut.status, "PENDING");
    assert.equal(bigOut.eurCents, 1_000_000);
    assert.equal(await pocketBalance("USER", aliasUser.id, db), 0);
    await resolveCashout({
      cashoutId: bigOut.id,
      actorId: aliasUser.id,
      action: "pay",
      receipt: "UNICREDIT-CRO-10K-EUR",
      db,
    });
    assert.equal((await db.cashoutRequest.findUniqueOrThrow({ where: { id: bigOut.id } })).status, "PAID");
    assert.equal(await pocketBalance("USER", aliasUser.id, db), 0);

    await ensureHouseWalletCredits({ userId: aliasUser.id, credits: 8, db });
    process.env.AUTH_SECRET ??= "zecca-test-auth-secret-32chars-minimum";
    assert.equal(isShopEvmConfigured(), true);
    assert.match(shopWalletAddress() ?? "", /^0x[a-fA-F0-9]{40}$/);
    assert.match(shopBtcAddress() ?? "", /^bc1[a-z0-9]+$/);
    const derivedBtc = shopBtcAddress();
    process.env.ZECCA_BTC_PRIVATE_KEY = "11".repeat(32);
    const envBtc = shopBtcAddress();
    assert.match(envBtc ?? "", /^bc1[a-z0-9]+$/);
    assert.notEqual(envBtc, derivedBtc);
    delete process.env.ZECCA_BTC_PRIVATE_KEY;
    assert.equal(shopBtcAddress(), derivedBtc);
    const vault = await getShopNetworkVault();
    assert.equal(vault.assets.map((asset) => asset.id).join(","), "BTC,ETH,USDT,USDC,BNB");
    assert.equal(shopPayoutConfigError("ETH"), null);
    assert.equal(shopPayoutConfigError("BTC"), null);
    assert.match(shopPayoutConfigError("TRX") ?? "", /Tron/);

    await ensureHouseWalletCredits({ userId: aliasUser.id, credits: 16, db });
    const queuedBtc = await requestAndFulfillCashout({
      userId: aliasUser.id,
      role: "ADMIN",
      credits: 5,
      payoutKind: "WALLET",
      walletNetwork: "BTC",
      walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      shopSend: true,
      db,
    });
    assert.equal(queuedBtc.status, "QUEUED");
    assert.equal(queuedBtc.receiptKind, "QUEUED_FOR_SETTLEMENT");
    assert.match(queuedBtc.receiptRef ?? "", /^ZECCA\//);
    assert.equal(queuedBtc.receiptHash?.length, 64);
    assert.equal(await pocketBalance("USER", aliasUser.id, db), 11);
    assert.equal(await pocketBalance("ESCROW", aliasUser.id, db), 0);

    const queuedEth = await requestAndFulfillCashout({
      userId: aliasUser.id,
      role: "ADMIN",
      credits: 3,
      payoutKind: "WALLET",
      walletNetwork: "ETH",
      walletAddress: "0x4166ca49529dff2014c2e085143e88fd0d624cf5",
      shopSend: true,
      db,
    });
    assert.equal(queuedEth.status, "QUEUED");
    assert.equal(queuedEth.receiptKind, "QUEUED_FOR_SETTLEMENT");
    assert.equal(await pocketBalance("USER", aliasUser.id, db), 8);
    assert.equal(await pocketBalance("ESCROW", aliasUser.id, db), 0);

    const pendingCrypto = await requestAndFulfillCashout({
      userId: aliasUser.id,
      role: "ADMIN",
      credits: 8,
      payoutKind: "WALLET",
      walletNetwork: "ETH",
      walletAddress: "0x4166ca49529dff2014c2e085143e88fd0d624cf5",
      db,
    });
    assert.equal(pendingCrypto.status, "PENDING");
    assert.equal(pendingCrypto.receiptRef, null);
    await resolveCashout({
      cashoutId: pendingCrypto.id,
      actorId: aliasUser.id,
      action: "pay",
      receipt: `0x${"ab".repeat(32)}`,
      chainLookup: async ({ hash }) => ({
        hash,
        recipients: ["0x4166ca49529dff2014c2e085143e88fd0d624cf5"],
      }),
      db,
    });
    assert.equal((await db.cashoutRequest.findUniqueOrThrow({ where: { id: pendingCrypto.id } })).status, "PAID");

    await ensureHouseWalletCredits({ userId: aliasUser.id, credits: 20, db });
    const instantCrypto = await requestAndFulfillCashout({
      userId: aliasUser.id,
      role: "ADMIN",
      credits: 20,
      payoutKind: "WALLET",
      walletNetwork: "ETH",
      walletAddress: "0x4166ca49529dff2014c2e085143e88fd0d624cf5",
      receipt: `0x${"cd".repeat(32)}`,
      chainLookup: async ({ hash }) => ({
        hash,
        recipients: ["0x4166ca49529dff2014c2e085143e88fd0d624cf5"],
      }),
      db,
    });
    assert.equal(instantCrypto.status, "PAID");
    assert.equal(instantCrypto.receiptKind, "TX_HASH");
    assert.equal(instantCrypto.receiptRef, `0x${"cd".repeat(32)}`);
    assert.equal(instantCrypto.receiptHash?.length, 64);
    assert.equal(await pocketBalance("USER", aliasUser.id, db), 0);

    await mintCredits({ amount: 40, note: "Coda conversione BTC", actorId: admin.id, db });
    const queuedConvert = await convertTreasuryAndWithdrawToWallet({
      actorId: admin.id,
      creditsCrypto: 25,
      cryptoAsset: "BTC",
      walletAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      shopSend: true,
      db,
    });
    assert.ok(queuedConvert.cashout);
    assert.equal(queuedConvert.cashout.status, "QUEUED");
    assert.equal(queuedConvert.cashout.receiptKind, "QUEUED_FOR_SETTLEMENT");
    assert.match(queuedConvert.cashout.receiptRef ?? "", /^ZECCA\//);
    assert.equal(queuedConvert.cashout.receiptHash?.length, 64);
    const queuedConvertLedger = await db.ledgerEntry.findFirst({
      where: { cashoutId: queuedConvert.cashout.id, type: "TREASURY_CRYPTO_WITHDRAW" },
    });
    assert.ok(queuedConvertLedger);

    const retriedConvert = await fulfillWalletCashoutFromShop({
      cashoutId: queuedConvert.cashout.id,
      actorId: admin.id,
      db,
    });
    assert.equal(retriedConvert.status, "QUEUED");
    assert.equal(retriedConvert.receiptKind, "QUEUED_FOR_SETTLEMENT");
    const retriedAgain = await settleQueuedWalletCashouts({ actorId: admin.id, db, limit: 20 });
    const sameLine = retriedAgain.find((row) => row.id === queuedConvert.cashout.id);
    assert.ok(sameLine);
    assert.equal(sameLine.status, "QUEUED");
    assert.equal(sameLine.receiptKind, "QUEUED_FOR_SETTLEMENT");

    await saveSettings({ withdrawMaxCountPerHour: 100 }, admin.id, db);
    const generation = await executeGenerationPayouts({
      actorId: admin.id,
      role: "ADMIN",
      creditsFiat: 20,
      creditsCrypto: 5,
      creditsIban: 20,
      btcAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      evmAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      db,
    });
    assert.ok(generation.bundle.fiat);
    assert.equal(generation.bundle.fiat?.creditsEur, 20);
    assert.equal(generation.bundle.fiat?.creditsUsd, 20);
    assert.equal(generation.bundle.fiat?.creditsChf, 20);
    assert.equal(generation.bundle.cashouts.length, 5);
    assert.equal(generation.ibans.length, 3);
    assert.equal(generation.ibans.every((row) => row.status === "QUEUED"), true);
    assert.equal(generation.ibans.map((row) => row.currency).sort().join(","), "CHF,EUR,USD");
    assert.equal(
      generation.bundle.cashouts.every((row) => row.status === "QUEUED" || row.status === "PAID"),
      true,
    );
    const shopAfter = await shopFiatBalances(db);
    assert.ok(shopAfter.treasuryEurCents >= 20 * 100);
    assert.ok(shopAfter.treasuryUsdCents >= 20 * 108);
    assert.ok(shopAfter.treasuryChfCents >= 20 * 94);

    const bookIban = classifyCashout({
      id: generation.ibans[0].id,
      status: generation.ibans[0].status,
      payoutKind: generation.ibans[0].payoutKind,
      currency: generation.ibans[0].currency,
      eurCents: generation.ibans[0].eurCents,
      usdCents: generation.ibans[0].usdCents,
      chfCents: generation.ibans[0].chfCents,
      iban: generation.ibans[0].iban,
      ibanHolder: generation.ibans[0].ibanHolder,
      walletAddress: generation.ibans[0].walletAddress,
      walletNetwork: generation.ibans[0].walletNetwork,
      receiptKind: generation.ibans[0].receiptKind,
      receiptRef: generation.ibans[0].receiptRef,
    });
    assert.equal(bookIban.phase, "RICEVUTA_TESORERIA");
    assert.equal(bookIban.bankOrChainRef, null);
    assert.match(bookIban.bookRef ?? "", /^ZECCA\//);
    assert.equal(settlementPhase({ status: "PAID", receiptKind: "BANK_REF", receiptRef: "CRO99887766", payoutKind: "IBAN" }), "FONDI_TRASMESSI");
    assert.equal(settlementPhase({ status: "PAID", receiptKind: "BANK_REF", receiptRef: "ZECCA/EUR/20260909/FAKE", payoutKind: "IBAN" }), "RICEVUTA_TESORERIA");
    const zeccaAsCro = parsePayoutReceipt({
      payoutKind: "IBAN",
      receipt: generation.ibans[0].receiptRef ?? "ZECCA/EUR/x",
    });
    assert.equal("error" in zeccaAsCro, true);
    const xml = buildPain001Document({
      debtor: { name: "Ordinante SPA", iban: "IT60X0542811101000000123456" },
      credits: [
        {
          endToEndId: "ZECCA/EUR/20260909/CMTUG0C9",
          amountCents: 5000,
          currency: "EUR",
          creditorName: "Massimo Fornara",
          creditorIban: "IT22B0200822800000103317304",
          remittance: "Zecca fusione CMTUG0C9",
        },
      ],
    });
    assert.match(xml, /pain\.001\.001\.03/);
    assert.match(xml, /IT22B0200822800000103317304/);
    assert.match(xml, /50\.00/);
    assert.equal(wiseApiConfig(), null);
    assert.equal(mintContractForAsset("USDT"), null);
    const deferred = await executeCryptoSettlement({
      rail: "WALLET",
      asset: "ETH",
      destination: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      usdCents: 1080,
      idempotencyKey: "test-eth",
    });
    assert.equal(deferred.status, "DEFERRED");
    process.env.ZECCA_LIQUIDITY_URL = "https://lp.test";
    process.env.ZECCA_LIQUIDITY_TOKEN = "lp-secret";
    const lpHash = `0x${"ab".repeat(32)}`;
    const lp = await executeLiquidityDisbursal(
      {
        rail: "WALLET",
        asset: "ETH",
        destination: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        usdCents: 1080,
        idempotencyKey: "test-lp",
      },
      (async () =>
        new Response(JSON.stringify({ tx_hash: lpHash }), { status: 200 })) as unknown as typeof fetch,
    );
    assert.equal(lp.status, "EXECUTED");
    if (lp.status === "EXECUTED") assert.equal(lp.ref, lpHash);
    process.env.ZECCA_SEPA_GATEWAY_URL = "https://baas.test";
    process.env.ZECCA_SEPA_GATEWAY_TOKEN = "sepa-secret";
    const sepa = await executeSepaDisbursal(
      {
        rail: "IBAN",
        currency: "EUR",
        iban: "IT22B0200822800000103317304",
        holder: "Massimo Fornara",
        amountCents: 5000,
        idempotencyKey: "test-sepa",
        reference: "ZECCA/EUR/x",
      },
      (async () =>
        new Response(JSON.stringify({ trn: "CRO778899001" }), { status: 200 })) as unknown as typeof fetch,
    );
    assert.equal(sepa.status, "EXECUTED");
    if (sepa.status === "EXECUTED") assert.equal(sepa.ref, "CRO778899001");
    delete process.env.ZECCA_LIQUIDITY_URL;
    delete process.env.ZECCA_LIQUIDITY_TOKEN;
    delete process.env.ZECCA_SEPA_GATEWAY_URL;
    delete process.env.ZECCA_SEPA_GATEWAY_TOKEN;
    assert.match(
      transmitAllSummary({
        attempts: [
          {
            id: "x",
            rail: "WALLET",
            asset: "BTC",
            amountLabel: "1 USD",
            destination: "bc1",
            transmitted: false,
            proof: null,
            reason: "vault",
          },
        ],
        onChainPaid: 0,
        stillQueued: 1,
        vaultEmpty: ["BTC"],
        mintConfigured: false,
      }),
      /0 fondi trasmessi/,
    );

    console.log("Flusso Zecca: conio → crediti → bottega DHL + ritiro in sede → prelievo IBAN/wallet. OK.");
    console.log("Conversione tesoreria 3000 cr→EUR, 2000 cr→USD e 500 cr→CHF in cassa negozio. OK.");
    console.log("Conversione tesoreria 1000 cr→BTC e 200 cr→ETH in cassa virtuale. OK.");
    console.log("Policy prelievo: checksum EIP-55, whitelist, rate limit, massimali, lock broadcast. OK.");
    console.log("Conversione 150 cr→USDT e prelievo verso wallet del form. OK.");
    console.log("Prelievi da generazione: EUR/USD/CHF in cassa + BTC/ETH/USDT/USDC/BNB + IBAN. OK.");
    console.log("Pipeline settlement: mint/liquidity/SEPA mock EXECUTED, deferred senza provider. OK.");
    console.log("Bonifico SEPA in ingresso senza Stripe/webhook. OK.");
    console.log("Casa Fornara: generazione senza pagamento + prelievo IBAN EUR/USD/CHF. OK.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
