import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { mintCredits, ensureTreasury } from "../lib/zecca/mint";
import { purchaseCredits } from "../lib/zecca/credits";
import { placeOrder } from "../lib/zecca/shop";
import { getForgeState } from "../lib/zecca/forge";
import { requestCustomerCashout, resolveCashout } from "../lib/zecca/cashout";
import { convertTreasuryToShopFiat, shopFiatBalances } from "../lib/zecca/convert";
import { pocketBalance, treasuryBalance } from "../lib/zecca/ledger";
import { getReserveReport } from "../lib/zecca/reserves";
import { DEFAULT_SETTINGS } from "../lib/zecca/settings";

const dbPath = path.join(process.cwd(), "prisma", "test.db");
const dbUrl = "file:./test.db";

async function main() {
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
        { key: "forgeTiers", value: JSON.stringify(DEFAULT_SETTINGS.forgeTiers) },
      ],
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
      },
      db,
    });
    assert.equal(await pocketBalance("USER", customer.id, db), 150);
    const stock = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(stock.stock, 9);

    const forge = await getForgeState({ userId: customer.id, role: "CUSTOMER", db });
    assert.equal(forge.spentToday, 50);
    assert.equal(forge.percent, 20);
    assert.equal(forge.forged, 30);

    const cashout = await requestCustomerCashout({
      userId: customer.id,
      role: "CUSTOMER",
      credits: 80,
      payoutKind: "IBAN",
      iban: "IT60X0542811101000000123456",
      ibanHolder: "Chiara Test",
      db,
    });
    assert.equal(await pocketBalance("USER", customer.id, db), 70);
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
      walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      db,
    });
    assert.equal(walletOut.payoutKind, "WALLET");
    assert.equal(await pocketBalance("USER", customer.id, db), 50);
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

    await resolveCashout({ cashoutId: cashout.id, actorId: admin.id, action: "pay", db });
    await resolveCashout({ cashoutId: walletOut.id, actorId: admin.id, action: "pay", db });
    assert.equal(await pocketBalance("ESCROW", customer.id, db), 0);
    const paid = await db.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
    assert.equal(paid.status, "PAID");

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
      where: { type: { in: ["TREASURY_CONVERT_TO_EUR", "TREASURY_CONVERT_TO_USD"] } },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(convertRows.length, 2);
    assert.equal(convertRows[0].type, "TREASURY_CONVERT_TO_EUR");
    assert.equal(convertRows[0].amountCredits, 3000);
    assert.equal(convertRows[0].eurCents, 300000);
    assert.equal(convertRows[1].type, "TREASURY_CONVERT_TO_USD");
    assert.equal(convertRows[1].amountCredits, 2000);
    assert.equal(convertRows[1].usdCents, 216000);

    console.log("Flusso Zecca: conio → crediti → bottega → prelievo IBAN/wallet. OK.");
    console.log("Conversione tesoreria 3000 cr→EUR e 2000 cr→USD in cassa negozio. OK.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
