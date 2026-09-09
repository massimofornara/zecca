import type { PrismaClient, Role } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { isValidWalletAddress, normalizeWalletAddress, walletNetworkLabel } from "@/lib/wallet";
import { type ChainLookup, verifyCryptoReceipt } from "@/lib/chain-receipt";
import { officialReceiptHash, sepaEndToEndId } from "@/lib/official-receipt";
import { parsePayoutReceipt, type ReceiptKind } from "@/lib/receipt";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { creditsToChfCents, creditsToEurCents, creditsToUsdCents, getSettings } from "@/lib/zecca/settings";
import { parseFiatCurrency, type FiatCurrency } from "@/lib/zecca/fiat";
import { cashoutProofStatus, type CashoutProof } from "@/lib/cashout-proof";
import { ensureHouseWalletCredits, isHouseEmail } from "@/lib/zecca/house";
import { sendShopCryptoPayout } from "@/lib/zecca/shop-payout";
import {
  convertTreasuryToShopCash,
  parseTreasuryCryptoAsset,
  shopCryptoBalances,
} from "@/lib/zecca/convert";

export type PayoutKind = "IBAN" | "WALLET";
export type CashoutCurrency = FiatCurrency;

export async function requestCustomerCashout(input: {
  userId: string;
  role: Role;
  credits: number;
  payoutKind?: PayoutKind;
  currency?: string;
  iban?: string;
  ibanHolder?: string;
  walletAddress?: string;
  walletNetwork?: string;
  id?: string;
  createdAt?: Date | string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Indica i crediti da prelevare.", "INVALID_AMOUNT");
  }

  const payoutKind: PayoutKind = input.payoutKind === "WALLET" ? "WALLET" : "IBAN";
  const currency: CashoutCurrency = parseFiatCurrency(input.currency);
  let iban: string | null = null;
  let ibanHolder: string | null = null;
  let walletAddress: string | null = null;
  let walletNetwork: string | null = null;
  let destinationNote = "";

  if (payoutKind === "IBAN") {
    const holder = (input.ibanHolder ?? "").trim();
    if (holder.length < 2) {
      throw new ZeccaError("Indica l’intestatario del conto che riceverà il bonifico.", "INVALID_IBAN");
    }
    if (!isValidIban(input.iban ?? "")) {
      throw new ZeccaError(
        "IBAN non valido. Controlla le cifre. Zecca non dispone il bonifico: lo fai tu dalla banca verso questo IBAN.",
        "INVALID_IBAN",
      );
    }
    iban = normalizeIban(input.iban ?? "");
    ibanHolder = holder;
    destinationNote = `verso ${iban}`;
  } else {
    const network = (input.walletNetwork ?? "").trim().toUpperCase();
    const address = normalizeWalletAddress(input.walletAddress ?? "");
    if (!isValidWalletAddress(address, network)) {
      throw new ZeccaError(
        "Indirizzo wallet non valido per la rete scelta. Controlla rete e indirizzo: il negozio invia, il destinatario riceve senza firmare.",
        "INVALID_WALLET",
      );
    }
    walletAddress = address;
    walletNetwork = network;
    destinationNote = `verso ${walletNetworkLabel(network)} ${address}`;
  }

  const settings = await getSettings(db);
  const eurCents =
    payoutKind === "WALLET" || currency === "EUR"
      ? creditsToEurCents(credits, settings.eurCentsPerCredit)
      : 0;
  const usdCents =
    payoutKind === "WALLET" || currency === "USD"
      ? creditsToUsdCents(credits, settings.usdCentsPerCredit)
      : 0;
  const chfCents =
    payoutKind === "IBAN" && currency === "CHF"
      ? creditsToChfCents(credits, settings.chfCentsPerCredit)
      : 0;
  const resolvedCurrency: CashoutCurrency = payoutKind === "WALLET" ? "USD" : currency;
  const fiatLabel =
    payoutKind === "WALLET"
      ? `${(usdCents / 100).toFixed(2)} USD in ${walletNetworkLabel(walletNetwork ?? "OTHER")}`
      : resolvedCurrency === "USD"
        ? `${(usdCents / 100).toFixed(2)} USD`
        : resolvedCurrency === "CHF"
          ? `${(chfCents / 100).toFixed(2)} CHF`
          : `${(eurCents / 100).toFixed(2)} EUR`;

  return db.$transaction(async (tx) => {
    const available = await pocketBalance("USER", input.userId, tx);
    if (available < credits) {
      throw new ZeccaError("Crediti insufficienti nel portafoglio.", "INSUFFICIENT_CREDITS");
    }

    const cashout = await tx.cashoutRequest.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        ...(input.createdAt
          ? { createdAt: input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt) }
          : {}),
        userId: input.userId,
        credits,
        eurCents,
        usdCents,
        chfCents,
        currency: resolvedCurrency,
        status: "PENDING",
        isTreasury: false,
        payoutKind,
        iban,
        ibanHolder,
        walletAddress,
        walletNetwork,
      },
    });

    await appendLedger(
      {
        type: "CASHOUT_REQUEST",
        amountCredits: credits,
        fromPocket: "USER",
        toPocket: "ESCROW",
        fromUserId: input.userId,
        toUserId: input.userId,
        actorId: input.userId,
        cashoutId: cashout.id,
        eurCents,
        usdCents,
        chfCents,
        fiatCurrency: resolvedCurrency,
        note: `Richiesta di prelievo: ${credits} cr → ${fiatLabel} ${destinationNote}`,
      },
      tx,
    );

    return cashout;
  });
}

/**
 * Su Vercel ogni lambda ha il suo SQLite. Se la riga non c’è su questa
 * istanza, la ricostruisce dal cookie/token firmato e poi si può chiudere.
 */
export async function materializeCashoutFromProof(input: {
  proof: CashoutProof;
  actorId: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const existing = await db.cashoutRequest.findUnique({ where: { id: input.proof.id } });
  if (existing) return existing;
  if (cashoutProofStatus(input.proof) !== "PENDING") {
    throw new ZeccaError("Richiesta di prelievo non trovata.", "NOT_FOUND");
  }

  if (input.proof.isTreasury) {
    return materializeTreasuryCryptoCashout({
      proof: input.proof,
      actorId: input.actorId,
      db,
    });
  }

  const owner = input.proof.userId
    ? await db.user.findUnique({ where: { id: input.proof.userId } })
    : null;
  const actor = await db.user.findUnique({ where: { id: input.actorId } });
  const userId = owner?.id ?? actor?.id;
  if (!userId) {
    throw new ZeccaError("Richiesta di prelievo non trovata.", "NOT_FOUND");
  }
  const target = owner ?? actor;
  if (target && (isHouseEmail(target.email) || target.role === "ADMIN")) {
    await ensureHouseWalletCredits({ userId, credits: input.proof.credits, db });
  }

  return requestCustomerCashout({
    id: input.proof.id,
    createdAt: input.proof.createdAt,
    userId,
    role: target?.role ?? "CUSTOMER",
    credits: input.proof.credits,
    payoutKind: input.proof.payoutKind === "WALLET" ? "WALLET" : "IBAN",
    currency: input.proof.currency,
    iban: input.proof.iban ?? undefined,
    ibanHolder: input.proof.ibanHolder ?? undefined,
    walletAddress: input.proof.walletAddress ?? undefined,
    walletNetwork: input.proof.walletNetwork ?? undefined,
    db,
  });
}

export async function resolveCashout(input: {
  cashoutId: string;
  actorId: string;
  action: "pay" | "reject";
  adminNote?: string;
  receipt?: string;
  chainLookup?: ChainLookup;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const cashout = await db.cashoutRequest.findUnique({ where: { id: input.cashoutId } });
  if (!cashout) {
    throw new ZeccaError("Richiesta di prelievo non trovata.", "NOT_FOUND");
  }
  if (cashout.status !== "PENDING") {
    throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
  }
  if (cashout.isTreasury && cashout.payoutKind !== "WALLET") {
    throw new ZeccaError(
      "Le fusioni di tesoreria fiat si eseguono dalla conversione in cassa.",
      "INVALID",
    );
  }
  if (!cashout.isTreasury && !cashout.userId) {
    throw new ZeccaError("Prelievo senza titolare.", "INVALID");
  }

  const currency = parseFiatCurrency(cashout.currency);
  let receiptKind: ReceiptKind | null = null;
  let receiptRef: string | null = null;
  let receiptUrl: string | null = null;

  if (input.action === "pay") {
    const parsed = parsePayoutReceipt({
      payoutKind: cashout.payoutKind,
      walletNetwork: cashout.walletNetwork,
      receipt: input.receipt ?? "",
    });
    if ("error" in parsed) {
      throw new ZeccaError(parsed.error, "INVALID_RECEIPT");
    }
    receiptKind = parsed.kind;
    receiptRef = parsed.ref;
    receiptUrl = parsed.url;
    if (receiptKind === "TX_HASH") {
      try {
        await verifyCryptoReceipt({
          network: cashout.walletNetwork ?? "ETH",
          hash: receiptRef,
          expectedAddress: cashout.walletAddress,
          lookup: input.chainLookup,
        });
      } catch (error) {
        throw new ZeccaError(
          error instanceof Error ? error.message : "Hash non verificato sulla rete.",
          "INVALID_RECEIPT",
        );
      }
      const reused = await db.cashoutRequest.findFirst({
        where: {
          receiptKind: "TX_HASH",
          receiptRef,
          NOT: { id: cashout.id },
        },
        select: { id: true },
      });
      if (reused) {
        throw new ZeccaError(
          "Questo hash è già stato usato come ricevuta di un altro prelievo.",
          "INVALID_RECEIPT",
        );
      }
    }
  }

  return db.$transaction(async (tx) => {
    const latest = await tx.cashoutRequest.findUnique({ where: { id: cashout.id } });
    if (!latest || latest.status !== "PENDING") {
      throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
    }

    if (input.action === "pay") {
      const resolvedAt = new Date();
      const destination =
        cashout.payoutKind === "WALLET"
          ? `${cashout.walletNetwork ?? ""} ${cashout.walletAddress ?? ""}`.trim()
          : `${cashout.ibanHolder ?? ""} ${cashout.iban ?? ""}`.trim();
      const documentHash = officialReceiptHash({
        cashoutId: cashout.id,
        credits: cashout.credits,
        currency,
        eurCents: cashout.eurCents,
        usdCents: cashout.usdCents,
        chfCents: cashout.chfCents,
        payoutKind: cashout.payoutKind,
        destination,
        receiptRef: receiptRef ?? "",
        resolvedAt: resolvedAt.toISOString(),
      });
      const receiptNote =
        receiptKind === "TX_HASH"
          ? `ricevuta hash rete ${receiptRef} · hash ricevuta ${documentHash}`
          : `ricevuta bonifico ${receiptRef} · hash ricevuta ${documentHash}`;

      await tx.cashoutRequest.update({
        where: { id: cashout.id },
        data: {
          status: "PAID",
          resolvedAt,
          adminNote:
            input.adminNote?.trim() ||
            (receiptKind === "TX_HASH"
              ? cashout.isTreasury
                ? "Prelievo dal wallet interno inviato dal negozio"
                : "Hash di rete registrato dopo l’invio dal wallet del negozio"
              : "CRO bancario registrato: Zecca non ha disposto il bonifico"),
          receiptKind,
          receiptRef,
          receiptUrl,
          receiptHash: documentHash,
        },
      });
      if (cashout.isTreasury) {
        const asset = cashout.walletNetwork ?? "CRYPTO";
        await appendLedger(
          {
            type: "TREASURY_CRYPTO_WITHDRAW",
            amountCredits: cashout.credits,
            fromPocket: "VOID",
            toPocket: "VOID",
            actorId: input.actorId,
            cashoutId: cashout.id,
            eurCents: 0,
            usdCents: cashout.usdCents,
            fiatCurrency: "USD",
            note: `Prelievo wallet interno ${asset}: ${cashout.credits} cr → ${(cashout.usdCents / 100).toFixed(2)} USD verso ${cashout.walletAddress} · ${receiptNote}`,
            metadata: {
              asset,
              receiptKind,
              receiptRef,
              receiptUrl,
              receiptHash: documentHash,
            },
          },
          tx,
        );
      } else {
        await appendLedger(
          {
            type: "CASHOUT_PAID",
            amountCredits: cashout.credits,
            fromPocket: "ESCROW",
            toPocket: "BURN",
            fromUserId: cashout.userId,
            actorId: input.actorId,
            cashoutId: cashout.id,
            eurCents: cashout.eurCents,
            usdCents: cashout.usdCents,
            chfCents: cashout.chfCents,
            fiatCurrency: currency,
            eurDirection: currency === "EUR" ? "OUT" : null,
            note: `Prelievo pagato: ${cashout.credits} cr → ${
              currency === "USD"
                ? `${(cashout.usdCents / 100).toFixed(2)} USD`
                : currency === "CHF"
                  ? `${(cashout.chfCents / 100).toFixed(2)} CHF`
                  : `${(cashout.eurCents / 100).toFixed(2)} EUR`
            } · ${receiptNote}`,
            metadata: { receiptKind, receiptRef, receiptUrl, receiptHash: documentHash },
          },
          tx,
        );
      }
    } else {
      await tx.cashoutRequest.update({
        where: { id: cashout.id },
        data: {
          status: "REJECTED",
          resolvedAt: new Date(),
          adminNote: input.adminNote?.trim() || "Rifiutata",
        },
      });
      if (!cashout.isTreasury) {
        await appendLedger(
          {
            type: "CASHOUT_REJECTED",
            amountCredits: cashout.credits,
            fromPocket: "ESCROW",
            toPocket: "USER",
            fromUserId: cashout.userId,
            toUserId: cashout.userId,
            actorId: input.actorId,
            cashoutId: cashout.id,
            note: `Prelievo rifiutato, crediti restituiti: ${cashout.credits} cr`,
          },
          tx,
        );
      }
    }

    return tx.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
  });
}

export function houseBankReceiptRef(cashoutId: string, currency: string) {
  return sepaEndToEndId(cashoutId, currency);
}

/**
 * Il negozio trasmette sulla rete dal proprio wallet e chiude il prelievo
 * con l’hash reale. Chi riceve (MetaMask, Trust Wallet, exchange) non firma.
 */
export async function fulfillWalletCashoutFromShop(input: {
  cashoutId: string;
  actorId: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const cashout = await db.cashoutRequest.findUnique({ where: { id: input.cashoutId } });
  if (!cashout) {
    throw new ZeccaError("Richiesta di prelievo non trovata.", "NOT_FOUND");
  }
  if (cashout.status === "PAID") return cashout;
  if (cashout.status !== "PENDING") {
    throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
  }
  if (cashout.payoutKind !== "WALLET" || !cashout.walletAddress || !cashout.walletNetwork) {
    throw new ZeccaError("Questo prelievo non è un invio crypto dal negozio.", "INVALID");
  }

  const sent = await sendShopCryptoPayout({
    walletAddress: cashout.walletAddress,
    walletNetwork: cashout.walletNetwork,
    usdCents: cashout.usdCents,
  });

  try {
    return await resolveCashout({
      cashoutId: cashout.id,
      actorId: input.actorId,
      action: "pay",
      receipt: sent.hash,
      adminNote: `Crediti convertiti in ${cashout.walletNetwork} e inviati dal negozio ${sent.shopAddress}`,
      chainLookup: async ({ hash }) => ({
        hash,
        recipients: [cashout.walletAddress as string],
      }),
      db,
    });
  } catch (error) {
    throw new ZeccaError(
      `Il negozio ha già trasmesso (hash ${sent.hash}). Incolla questo hash per chiudere il libro. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
      "SHOP_SENT_UNSETTLED",
      cashout.id,
    );
  }
}

/**
 * Casa: senza CRO la richiesta IBAN resta aperta.
 * Crypto: con shopSend il negozio converte i crediti nella crypto scelta,
 * trasmette e chiude con l’hash reale. I test restano PENDING (niente invio).
 */
export async function requestAndFulfillCashout(input: {
  userId: string;
  role: Role;
  credits: number;
  payoutKind?: PayoutKind;
  currency?: string;
  iban?: string;
  ibanHolder?: string;
  walletAddress?: string;
  walletNetwork?: string;
  receipt?: string;
  chainLookup?: ChainLookup;
  shopSend?: boolean;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const cashout = await requestCustomerCashout({
    userId: input.userId,
    role: input.role,
    credits: input.credits,
    payoutKind: input.payoutKind,
    currency: input.currency,
    iban: input.iban,
    ibanHolder: input.ibanHolder,
    walletAddress: input.walletAddress,
    walletNetwork: input.walletNetwork,
    db,
  });
  const typed = (input.receipt ?? "").trim();
  if (typed) {
    return resolveCashout({
      cashoutId: cashout.id,
      actorId: input.userId,
      action: "pay",
      receipt: typed,
      chainLookup: input.chainLookup,
      db,
    });
  }
  if (cashout.payoutKind === "WALLET" && input.shopSend) {
    try {
      return await fulfillWalletCashoutFromShop({
        cashoutId: cashout.id,
        actorId: input.userId,
        db,
      });
    } catch (error) {
      if (error instanceof ZeccaError) {
        throw new ZeccaError(error.message, error.code, cashout.id);
      }
      throw new ZeccaError(
        error instanceof Error ? error.message : "Invio dal negozio non riuscito.",
        "SHOP_SEND_FAILED",
        cashout.id,
      );
    }
  }
  return cashout;
}

async function materializeTreasuryCryptoCashout(input: {
  proof: CashoutProof;
  actorId: string;
  db: PrismaClient;
}) {
  const asset = parseTreasuryCryptoAsset(input.proof.walletNetwork);
  const address = normalizeWalletAddress(input.proof.walletAddress ?? "");
  if (!asset || !isValidWalletAddress(address, asset)) {
    throw new ZeccaError("Prelievo dal wallet interno non valido.", "INVALID_WALLET");
  }
  return input.db.cashoutRequest.create({
    data: {
      id: input.proof.id,
      createdAt: new Date(input.proof.createdAt),
      userId: input.actorId,
      credits: input.proof.credits,
      eurCents: input.proof.eurCents,
      usdCents: input.proof.usdCents,
      currency: "USD",
      status: "PENDING",
      isTreasury: true,
      payoutKind: "WALLET",
      walletAddress: address,
      walletNetwork: asset,
      adminNote: `Prelievo da wallet interno ${asset}`,
    },
  });
}

/**
 * Tesoreria: i crediti già convertiti nel wallet interno escono verso
 * MetaMask, Trust Wallet o un exchange. Il negozio crea l’hash sulla rete.
 */
export async function requestInternalCryptoWithdraw(input: {
  actorId: string;
  credits: number;
  asset: string;
  walletAddress: string;
  shopSend?: boolean;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Indica i crediti da prelevare dal wallet interno.", "INVALID_AMOUNT");
  }
  const asset = parseTreasuryCryptoAsset(input.asset);
  if (!asset) {
    throw new ZeccaError(
      "Scegli Bitcoin, Ethereum, USDT, USDC o BNB per il prelievo.",
      "INVALID_ASSET",
    );
  }
  const address = normalizeWalletAddress(input.walletAddress);
  if (!isValidWalletAddress(address, asset)) {
    throw new ZeccaError(
      `Indirizzo non valido per ${walletNetworkLabel(asset)}. MetaMask, Trust Wallet o l’exchange devono solo ricevere.`,
      "INVALID_WALLET",
    );
  }

  const settings = await getSettings(db);
  const usdCents = creditsToUsdCents(credits, settings.usdCentsPerCredit);

  const cashout = await db.$transaction(async (tx) => {
    const books = await shopCryptoBalances(tx);
    const remaining = books[asset].remainingCredits;
    if (remaining < credits) {
      throw new ZeccaError(
        `Il wallet interno ${asset} ha ${remaining.toLocaleString("it-IT")} cr. Non puoi prelevare ${credits.toLocaleString("it-IT")} cr.`,
        "INTERNAL_WALLET_SHORT",
      );
    }
    return tx.cashoutRequest.create({
      data: {
        userId: input.actorId,
        credits,
        eurCents: 0,
        usdCents,
        currency: "USD",
        status: "PENDING",
        isTreasury: true,
        payoutKind: "WALLET",
        walletAddress: address,
        walletNetwork: asset,
        adminNote: `Prelievo da wallet interno ${asset}`,
      },
    });
  });

  if (input.shopSend) {
    try {
      return await fulfillWalletCashoutFromShop({
        cashoutId: cashout.id,
        actorId: input.actorId,
        db,
      });
    } catch (error) {
      if (error instanceof ZeccaError) {
        throw new ZeccaError(error.message, error.code, cashout.id);
      }
      throw new ZeccaError(
        error instanceof Error ? error.message : "Invio dal negozio non riuscito.",
        "SHOP_SEND_FAILED",
        cashout.id,
      );
    }
  }
  return cashout;
}

/**
 * Tesoreria: i crediti diventano EUR, USD e/o crypto; la parte crypto va in
 * cassa di rete e, nello stesso passo, esce verso il wallet indicato nel form.
 */
export async function convertTreasuryAndWithdrawToWallet(input: {
  actorId: string;
  creditsEur?: number;
  creditsUsd?: number;
  creditsChf?: number;
  creditsCrypto?: number;
  cryptoAsset?: string;
  walletAddress?: string;
  shopSend?: boolean;
  db?: PrismaClient;
}) {
  const creditsCrypto = Math.max(0, Math.floor(Number(input.creditsCrypto ?? 0)));
  const address = normalizeWalletAddress(input.walletAddress ?? "");
  if (creditsCrypto > 0) {
    const asset = parseTreasuryCryptoAsset(input.cryptoAsset);
    if (!asset) {
      throw new ZeccaError(
        "Scegli Bitcoin, Ethereum, USDT, USDC o BNB per la cassa di rete.",
        "INVALID_ASSET",
      );
    }
    if (!isValidWalletAddress(address, asset)) {
      throw new ZeccaError(
        `Indirizzo non valido per ${walletNetworkLabel(asset)}. Indicalo nel form prima dell’invio.`,
        "INVALID_WALLET",
      );
    }
  }

  const converted = await convertTreasuryToShopCash({
    actorId: input.actorId,
    creditsEur: input.creditsEur,
    creditsUsd: input.creditsUsd,
    creditsChf: input.creditsChf,
    creditsCrypto,
    cryptoAsset: input.cryptoAsset,
    db: input.db,
  });

  if (converted.creditsCrypto <= 0 || !converted.cryptoAsset) {
    return { converted, cashout: null };
  }

  const cashout = await requestInternalCryptoWithdraw({
    actorId: input.actorId,
    credits: converted.creditsCrypto,
    asset: converted.cryptoAsset,
    walletAddress: address,
    shopSend: input.shopSend ?? true,
    db: input.db,
  });
  return { converted, cashout };
}
