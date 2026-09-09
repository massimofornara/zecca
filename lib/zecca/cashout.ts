import type { PrismaClient, Role } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { isValidWalletAddress, normalizeWalletAddress, walletNetworkLabel } from "@/lib/wallet";
import { type ChainLookup, verifyCryptoReceipt } from "@/lib/chain-receipt";
import { officialReceiptHash, sepaEndToEndId, zeccaSettlementRef } from "@/lib/official-receipt";
import { parsePayoutReceipt, type ReceiptKind } from "@/lib/receipt";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { creditsToChfCents, creditsToEurCents, creditsToUsdCents, getSettings } from "@/lib/zecca/settings";
import { parseFiatCurrency, type FiatCurrency } from "@/lib/zecca/fiat";
import { cashoutProofStatus, type CashoutProof } from "@/lib/cashout-proof";
import { ensureHouseWalletCredits, isHouseEmail } from "@/lib/zecca/house";
import {
  isEvmPayoutNetwork,
  shopPayoutConfigError,
} from "@/lib/zecca/shop-payout";
import { executeCryptoSettlement, executeFiatSettlement } from "@/lib/settlement/pipeline";
import {
  convertTreasuryToShopCash,
  parseTreasuryCryptoAsset,
  shopCryptoBalances,
  TREASURY_CRYPTO_ASSETS,
  type TreasuryCryptoAsset,
} from "@/lib/zecca/convert";
import { mintCredits } from "@/lib/zecca/mint";
import { housePayoutForCurrency } from "@/lib/zecca/house-accounts";
import { assertWithdrawPolicy, isBroadcastLock, WITHDRAW_BROADCASTING } from "@/lib/zecca/withdraw-policy";

export type PayoutKind = "IBAN" | "WALLET";
export type CashoutCurrency = FiatCurrency;
export const QUEUED_RECEIPT_KIND = "QUEUED_FOR_SETTLEMENT";
export const PROVIDER_RECEIPT_KIND = "PROVIDER_REF";

export function isSettleableCashoutStatus(status: string | null | undefined) {
  return status === "PENDING" || status === "QUEUED";
}

async function acceptQueuedSettlement(
  db: PrismaClient,
  cashout: {
    id: string;
    userId: string | null;
    credits: number;
    currency: string;
    eurCents: number;
    usdCents: number;
    chfCents: number;
    payoutKind: string;
    iban: string | null;
    ibanHolder: string | null;
    walletAddress: string | null;
    walletNetwork: string | null;
    isTreasury: boolean;
    status: string;
    receiptKind: string | null;
    receiptRef: string | null;
    receiptHash: string | null;
  },
  note?: string,
) {
  const resolvedAt = new Date();
  const rail = cashout.payoutKind === "WALLET" ? (cashout.walletNetwork ?? "CRYPTO") : cashout.currency;
  const destination =
    cashout.payoutKind === "WALLET"
      ? `${cashout.walletNetwork ?? ""} ${cashout.walletAddress ?? ""}`.trim()
      : `${cashout.ibanHolder ?? ""} ${cashout.iban ?? ""}`.trim();
  const currency = parseFiatCurrency(cashout.currency);

  return db.$transaction(async (tx) => {
    const latest = await tx.cashoutRequest.findUnique({ where: { id: cashout.id } });
    if (!latest || !isSettleableCashoutStatus(latest.status)) {
      throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
    }
    if (
      latest.status === "QUEUED" &&
      latest.receiptKind === QUEUED_RECEIPT_KIND &&
      latest.receiptRef &&
      latest.receiptHash
    ) {
      return latest;
    }

    const reuse =
      Boolean(latest.receiptRef && latest.receiptHash) &&
      /^ZECCA\//i.test(latest.receiptRef ?? "");
    const receiptRef = reuse
      ? (latest.receiptRef as string)
      : zeccaSettlementRef(cashout.id, rail, resolvedAt);
    const receiptHash = reuse
      ? (latest.receiptHash as string)
      : officialReceiptHash({
          cashoutId: cashout.id,
          credits: cashout.credits,
          currency: cashout.currency,
          eurCents: cashout.eurCents,
          usdCents: cashout.usdCents,
          chfCents: cashout.chfCents,
          payoutKind: cashout.payoutKind,
          destination,
          receiptRef,
          resolvedAt: resolvedAt.toISOString(),
        });
    const receiptNote = `ricevuta Zecca ${receiptRef} · hash ricevuta ${receiptHash}`;

    await tx.cashoutRequest.update({
      where: { id: cashout.id },
      data: {
        status: "QUEUED",
        resolvedAt,
        receiptKind: QUEUED_RECEIPT_KIND,
        receiptRef,
        receiptUrl: null,
        receiptHash,
        adminNote: note ?? "Accettato: in coda di liquidazione. Ricevuta interna Zecca emessa.",
      },
    });

    const alreadyBurned = await tx.ledgerEntry.findFirst({
      where: {
        cashoutId: cashout.id,
        type: { in: ["CASHOUT_PAID", "TREASURY_CRYPTO_WITHDRAW"] },
      },
      select: { id: true },
    });
    if (!alreadyBurned && !(cashout.isTreasury && cashout.payoutKind === "IBAN")) {
      if (cashout.isTreasury) {
        const asset = cashout.walletNetwork ?? "CRYPTO";
        await appendLedger(
          {
            type: "TREASURY_CRYPTO_WITHDRAW",
            amountCredits: cashout.credits,
            fromPocket: "VOID",
            toPocket: "VOID",
            actorId: cashout.userId,
            cashoutId: cashout.id,
            eurCents: 0,
            usdCents: cashout.usdCents,
            fiatCurrency: "USD",
            note: `Prelievo a libro, fondi non trasmessi: ${cashout.credits} cr → ${(cashout.usdCents / 100).toFixed(2)} USD in ${asset} verso ${cashout.walletAddress} · ${receiptNote}`,
            metadata: {
              asset,
              receiptKind: QUEUED_RECEIPT_KIND,
              receiptRef,
              receiptHash,
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
            actorId: cashout.userId,
            cashoutId: cashout.id,
            eurCents: cashout.eurCents,
            usdCents: cashout.usdCents,
            chfCents: cashout.chfCents,
            fiatCurrency: currency,
            eurDirection: currency === "EUR" ? "OUT" : null,
            note: `Prelievo accettato, in coda di liquidazione: ${cashout.credits} cr → ${
              currency === "USD"
                ? `${(cashout.usdCents / 100).toFixed(2)} USD`
                : currency === "CHF"
                  ? `${(cashout.chfCents / 100).toFixed(2)} CHF`
                  : `${(cashout.eurCents / 100).toFixed(2)} EUR`
            } · ${receiptNote}`,
            metadata: { receiptKind: QUEUED_RECEIPT_KIND, receiptRef, receiptHash },
          },
          tx,
        );
      }
    }

    return tx.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
  });
}

async function markProviderDispatch(
  db: PrismaClient,
  cashout: {
    id: string;
    userId: string | null;
    credits: number;
    currency: string;
    eurCents: number;
    usdCents: number;
    chfCents: number;
    payoutKind: string;
    iban: string | null;
    ibanHolder: string | null;
    walletAddress: string | null;
    walletNetwork: string | null;
    isTreasury: boolean;
    status: string;
    receiptKind: string | null;
    receiptRef: string | null;
    receiptHash: string | null;
  },
  dispatch: { provider: string; ref: string; url: string | null },
) {
  const queued = await acceptQueuedSettlement(
    db,
    cashout,
    `Inviato al provider ${dispatch.provider}. In attesa di tx_hash o TRN. Rif. ${dispatch.ref}`,
  );
  return db.cashoutRequest.update({
    where: { id: queued.id },
    data: {
      receiptKind: PROVIDER_RECEIPT_KIND,
      receiptRef: dispatch.ref,
      receiptUrl: dispatch.url,
      adminNote: `Provider ${dispatch.provider} · ${dispatch.ref}`,
    },
  });
}

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
  if (payoutKind === "WALLET" && walletAddress && walletNetwork) {
    await assertWithdrawPolicy({
      address: walletAddress,
      network: walletNetwork,
      usdCents,
      db,
    });
  }
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
  const proofStatus = cashoutProofStatus(input.proof);
  if (proofStatus === "PAID" || proofStatus === "REJECTED") {
    throw new ZeccaError("Richiesta di prelievo non trovata.", "NOT_FOUND");
  }

  if (input.proof.isTreasury) {
    const created = await materializeTreasuryCryptoCashout({
      proof: input.proof,
      actorId: input.actorId,
      db,
    });
    if (proofStatus === "QUEUED" && created.status !== "QUEUED") {
      return acceptQueuedSettlement(db, created, "Ricostruito in coda di liquidazione.");
    }
    return created;
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

  const created = await requestCustomerCashout({
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
  if (proofStatus === "QUEUED" && created.status !== "QUEUED") {
    return acceptQueuedSettlement(db, created, "Ricostruito in coda di liquidazione.");
  }
  return created;
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
  if (!isSettleableCashoutStatus(cashout.status)) {
    throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
  }
  if (cashout.isTreasury && cashout.payoutKind !== "WALLET" && input.action !== "pay") {
    throw new ZeccaError(
      "Le fusioni di tesoreria fiat si chiudono con TRN bancario, non con un rifiuto.",
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
    if (!latest || !isSettleableCashoutStatus(latest.status)) {
      throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
    }

    if (input.action === "reject" && latest.status === "QUEUED") {
      throw new ZeccaError(
        "Questo prelievo è già accettato. I crediti sono bruciati e la ricevuta Zecca è sul libro.",
        "ALREADY_RESOLVED",
      );
    }

    if (input.action === "pay") {
      const alreadyBurned =
        latest.status === "QUEUED" || (cashout.isTreasury && cashout.payoutKind === "IBAN");
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
      if (alreadyBurned) {
        return tx.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
      }
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
 * Payout diretto: brucia/blocca i crediti, tenta mint EVM se configurato,
 * altrimenti accetta in coda di liquidazione con ricevuta Zecca.
 * Nessuna interrogazione Mempool, nessun rifiuto a saldo cassa zero.
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
  if (!isSettleableCashoutStatus(cashout.status)) {
    throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
  }
  if (cashout.payoutKind !== "WALLET" || !cashout.walletAddress || !cashout.walletNetwork) {
    throw new ZeccaError("Questo prelievo non è un invio crypto dal negozio.", "INVALID");
  }
  const blocked = shopPayoutConfigError(cashout.walletNetwork);
  if (blocked) {
    throw new ZeccaError(blocked, "UNSUPPORTED_ASSET", cashout.id);
  }
  if (isBroadcastLock(cashout.receiptKind)) {
    throw new ZeccaError(
      "Invio già in corso su questa richiesta. Attendi l’esito di rete.",
      "BROADCAST_IN_PROGRESS",
      cashout.id,
    );
  }

  await assertWithdrawPolicy({
    address: cashout.walletAddress,
    network: cashout.walletNetwork,
    usdCents: cashout.usdCents,
    db,
    excludeCashoutId: cashout.id,
  });

  const claimed = await db.cashoutRequest.updateMany({
    where: {
      id: cashout.id,
      status: { in: ["PENDING", "QUEUED"] },
      OR: [
        { receiptKind: null },
        { receiptKind: QUEUED_RECEIPT_KIND },
        { receiptKind: PROVIDER_RECEIPT_KIND },
      ],
    },
    data: { receiptKind: WITHDRAW_BROADCASTING },
  });
  if (claimed.count === 0) {
    const latest = await db.cashoutRequest.findUnique({ where: { id: cashout.id } });
    if (latest?.status === "PAID") return latest;
    if (latest?.status === "QUEUED") return latest;
    throw new ZeccaError(
      "Invio già in corso su questa richiesta. Attendi l’esito di rete.",
      "BROADCAST_IN_PROGRESS",
      cashout.id,
    );
  }

  try {
    const result = await executeCryptoSettlement({
      rail: "WALLET",
      asset: cashout.walletNetwork,
      destination: cashout.walletAddress,
      usdCents: cashout.usdCents,
      idempotencyKey: cashout.id,
    });
    if (result.status === "EXECUTED") {
      try {
        return await resolveCashout({
          cashoutId: cashout.id,
          actorId: input.actorId,
          action: "pay",
          receipt: result.ref,
          adminNote: isEvmPayoutNetwork(cashout.walletNetwork)
            ? `EXECUTED via ${result.provider} sul wallet ${cashout.walletAddress}`
            : `EXECUTED Bitcoin via ${result.provider} verso ${cashout.walletAddress}`,
          chainLookup: async ({ hash }) => ({
            hash,
            recipients: [cashout.walletAddress as string],
          }),
          db,
        });
      } catch (error) {
        throw new ZeccaError(
          `Invio già trasmesso (hash ${result.ref}). ${error instanceof Error ? error.message : ""}`.trim(),
          "SHOP_SENT_UNSETTLED",
          cashout.id,
        );
      }
    }
    if (result.status === "DISPATCHED") {
      return markProviderDispatch(db, cashout, {
        provider: result.provider,
        ref: result.ref,
        url: result.url,
      });
    }
    return await acceptQueuedSettlement(db, cashout);
  } finally {
    const latest = await db.cashoutRequest.findUnique({ where: { id: cashout.id } });
    if (latest?.status === "QUEUED" && isBroadcastLock(latest.receiptKind)) {
      await acceptQueuedSettlement(db, latest);
    }
  }
}

/** Ritenta le uscite in coda: mint EVM se il contratto risponde, altrimenti resta in coda. */
export async function settleQueuedWalletCashouts(input: {
  actorId: string;
  db?: PrismaClient;
  limit?: number;
}) {
  const db = input.db ?? defaultPrisma;
  await db.cashoutRequest.updateMany({
    where: {
      status: "QUEUED",
      payoutKind: "WALLET",
      receiptKind: WITHDRAW_BROADCASTING,
    },
    data: { receiptKind: QUEUED_RECEIPT_KIND },
  });
  const rows = await db.cashoutRequest.findMany({
    where: { status: "QUEUED", payoutKind: "WALLET" },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(input.limit ?? 20, 50)),
  });
  const settled = [];
  for (const row of rows) {
    settled.push(
      await fulfillWalletCashoutFromShop({
        cashoutId: row.id,
        actorId: input.actorId,
        db,
      }),
    );
  }
  return settled;
}

export async function fulfillIbanFromRails(input: {
  cashoutId: string;
  actorId: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const cashout = await db.cashoutRequest.findUnique({ where: { id: input.cashoutId } });
  if (!cashout) throw new ZeccaError("Richiesta di prelievo non trovata.", "NOT_FOUND");
  if (cashout.status === "PAID") return cashout;
  if (!isSettleableCashoutStatus(cashout.status)) {
    throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
  }
  if (cashout.payoutKind !== "IBAN" || !cashout.iban || !cashout.ibanHolder) {
    throw new ZeccaError("Questo prelievo non è un bonifico IBAN.", "INVALID");
  }
  const currency = parseFiatCurrency(cashout.currency);
  const amountCents =
    currency === "USD" ? cashout.usdCents : currency === "CHF" ? cashout.chfCents : cashout.eurCents;
  const result = await executeFiatSettlement({
    rail: "IBAN",
    currency,
    iban: cashout.iban,
    holder: cashout.ibanHolder,
    amountCents,
    idempotencyKey: cashout.id,
    reference: cashout.receiptRef ?? cashout.id,
  });
  if (result.status === "EXECUTED") {
    return resolveCashout({
      cashoutId: cashout.id,
      actorId: input.actorId,
      action: "pay",
      receipt: result.ref,
      adminNote: `EXECUTED via ${result.provider}`,
      db,
    });
  }
  if (result.status === "DISPATCHED") {
    return markProviderDispatch(db, cashout, {
      provider: result.provider,
      ref: result.ref,
      url: result.url,
    });
  }
  if (cashout.status === "QUEUED") return cashout;
  return acceptQueuedSettlement(db, cashout);
}

/**
 * Casa: senza CRO la richiesta IBAN resta aperta.
 * Crypto: con shopSend i crediti si bruciano e la richiesta viene accettata
 * (mint EVM se possibile, altrimenti coda di liquidazione con ricevuta Zecca).
 * I test con shopSend:false restano PENDING (niente mint/coda).
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
  bookSettle?: boolean;
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
  if (cashout.payoutKind === "IBAN" && input.bookSettle) {
    const queued = await acceptQueuedSettlement(
      db,
      cashout,
      "Accettato sul libro verso l’IBAN indicato. Ricevuta Zecca emessa.",
    );
    return fulfillIbanFromRails({
      cashoutId: queued.id,
      actorId: input.userId,
      db,
    });
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
  await assertWithdrawPolicy({
    address,
    network: asset,
    usdCents,
    db,
  });

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
 * Tesoreria: i crediti diventano EUR, USD e/o crypto; la parte crypto brucia
 * i crediti e paga direttamente il wallet indicato (mint EVM o coda Bitcoin).
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
  const db = input.db ?? defaultPrisma;
  const creditsCrypto = Math.max(0, Math.floor(Number(input.creditsCrypto ?? 0)));
  const address = normalizeWalletAddress(input.walletAddress ?? "");
  if (creditsCrypto > 0) {
    const asset = parseTreasuryCryptoAsset(input.cryptoAsset);
    if (!asset) {
      throw new ZeccaError(
        "Scegli Bitcoin, Ethereum, USDT, USDC o BNB.",
        "INVALID_ASSET",
      );
    }
    if (!isValidWalletAddress(address, asset)) {
      throw new ZeccaError(
        `Indirizzo non valido per ${walletNetworkLabel(asset)}. Indicalo nel form prima dell’invio.`,
        "INVALID_WALLET",
      );
    }
    const settings = await getSettings(db);
    const usdCents = creditsToUsdCents(creditsCrypto, settings.usdCentsPerCredit);
    await assertWithdrawPolicy({
      address,
      network: asset,
      usdCents,
      db,
    });
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

export type CryptoPayoutLine = {
  asset: TreasuryCryptoAsset;
  credits: number;
  address: string;
};

async function dispatchTreasuryFiatToHouse(input: {
  actorId: string;
  credits: number;
  currency: CashoutCurrency;
  amountCents: number;
  db: PrismaClient;
}) {
  const account = housePayoutForCurrency(input.currency);
  const cashout = await input.db.cashoutRequest.create({
    data: {
      userId: input.actorId,
      credits: input.credits,
      eurCents: input.currency === "EUR" ? input.amountCents : 0,
      usdCents: input.currency === "USD" ? input.amountCents : 0,
      chfCents: input.currency === "CHF" ? input.amountCents : 0,
      currency: input.currency,
      status: "PENDING",
      isTreasury: true,
      payoutKind: "IBAN",
      iban: account.iban,
      ibanHolder: account.holder,
      adminNote: `Accredito tesoreria ${input.currency} verso ${account.bank}`,
    },
  });
  return fulfillIbanFromRails({
    cashoutId: cashout.id,
    actorId: input.actorId,
    db: input.db,
  });
}

export async function convertTreasuryBundle(input: {
  actorId: string;
  creditsEur?: number;
  creditsUsd?: number;
  creditsChf?: number;
  cryptos?: CryptoPayoutLine[];
  shopSend?: boolean;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const creditsEur = Math.max(0, Math.floor(Number(input.creditsEur ?? 0)));
  const creditsUsd = Math.max(0, Math.floor(Number(input.creditsUsd ?? 0)));
  const creditsChf = Math.max(0, Math.floor(Number(input.creditsChf ?? 0)));
  const cryptos = (input.cryptos ?? []).filter((line) => line.credits > 0);

  const fiat =
    creditsEur > 0 || creditsUsd > 0 || creditsChf > 0
      ? await convertTreasuryToShopCash({
          actorId: input.actorId,
          creditsEur,
          creditsUsd,
          creditsChf,
          db,
        })
      : null;

  const fiatCashouts = [];
  if (fiat?.creditsEur) {
    fiatCashouts.push(
      await dispatchTreasuryFiatToHouse({
        actorId: input.actorId,
        credits: fiat.creditsEur,
        currency: "EUR",
        amountCents: fiat.eurCents,
        db,
      }),
    );
  }
  if (fiat?.creditsUsd) {
    fiatCashouts.push(
      await dispatchTreasuryFiatToHouse({
        actorId: input.actorId,
        credits: fiat.creditsUsd,
        currency: "USD",
        amountCents: fiat.usdCents,
        db,
      }),
    );
  }
  if (fiat?.creditsChf) {
    fiatCashouts.push(
      await dispatchTreasuryFiatToHouse({
        actorId: input.actorId,
        credits: fiat.creditsChf,
        currency: "CHF",
        amountCents: fiat.chfCents,
        db,
      }),
    );
  }

  const cashouts = [];
  for (const line of cryptos) {
    const { cashout } = await convertTreasuryAndWithdrawToWallet({
      actorId: input.actorId,
      creditsCrypto: line.credits,
      cryptoAsset: line.asset,
      walletAddress: line.address,
      shopSend: input.shopSend ?? true,
      db,
    });
    if (cashout) cashouts.push(cashout);
  }

  return { fiat, cashouts, fiatCashouts };
}

export async function executeGenerationPayouts(input: {
  actorId: string;
  role: Role;
  creditsFiat?: number;
  creditsCrypto?: number;
  creditsIban?: number;
  btcAddress?: string;
  evmAddress?: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const creditsFiat = Math.max(0, Math.floor(Number(input.creditsFiat ?? 50)));
  const creditsCrypto = Math.max(0, Math.floor(Number(input.creditsCrypto ?? 10)));
  const creditsIban = Math.max(0, Math.floor(Number(input.creditsIban ?? 50)));
  const btcAddress = normalizeWalletAddress(input.btcAddress ?? "");
  const evmAddress = normalizeWalletAddress(input.evmAddress ?? "");

  const cryptos: CryptoPayoutLine[] = [];
  if (creditsCrypto > 0 && btcAddress) {
    if (!isValidWalletAddress(btcAddress, "BTC")) {
      throw new ZeccaError("Indirizzo Bitcoin di destinazione non valido.", "INVALID_WALLET");
    }
    cryptos.push({ asset: "BTC", credits: creditsCrypto, address: btcAddress });
  }
  if (creditsCrypto > 0 && evmAddress) {
    if (!isValidWalletAddress(evmAddress, "ETH")) {
      throw new ZeccaError("Indirizzo EVM di destinazione non valido.", "INVALID_WALLET");
    }
    for (const asset of TREASURY_CRYPTO_ASSETS) {
      if (asset === "BTC") continue;
      cryptos.push({ asset, credits: creditsCrypto, address: evmAddress });
    }
  }

  const treasuryNeed = creditsFiat * 3 + cryptos.reduce((sum, line) => sum + line.credits, 0);
  const treasury = await pocketBalance("TREASURY", null, db);
  if (treasury < treasuryNeed) {
    await mintCredits({
      amount: treasuryNeed - treasury + 100,
      note: "Conio per prelievi da generazione crediti",
      actorId: input.actorId,
      db,
    });
  }

  const bundle = await convertTreasuryBundle({
    actorId: input.actorId,
    creditsEur: creditsFiat,
    creditsUsd: creditsFiat,
    creditsChf: creditsFiat,
    cryptos,
    shopSend: true,
    db,
  });

  const ibans = [...bundle.fiatCashouts];
  if (creditsIban > 0 && ibans.length === 0) {
    await ensureHouseWalletCredits({
      userId: input.actorId,
      credits: creditsIban * 3,
      db,
    });
    for (const currency of ["EUR", "USD", "CHF"] as const) {
      const account = housePayoutForCurrency(currency);
      ibans.push(
        await requestAndFulfillCashout({
          userId: input.actorId,
          role: input.role,
          credits: creditsIban,
          payoutKind: "IBAN",
          currency,
          iban: account.iban,
          ibanHolder: account.holder,
          bookSettle: true,
          db,
        }),
      );
    }
  }

  return { bundle, ibans };
}
