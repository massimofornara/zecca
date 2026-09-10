import type { PrismaClient, Role } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { isValidBic, isValidIban, isItalianIban, maskIban, normalizeBic, normalizeIban } from "@/lib/iban";
import {
  CIRCLE_USDC_CHAIN,
  circleConfigured,
  isUsdcCashoutNetwork,
  transferUsdcOnBase,
} from "@/lib/settlement/circle";
import { basescanTxUrl, isCircleUsdcReceipt, isLocalOrInternalExplorer } from "@/lib/settlement/circle-ref";
import { assertUsdcLiquidity } from "@/lib/zecca/usdc-cassa";
import {
  quoteUsdcWithdrawFee,
  usdcFeeBreakdownLines,
  usdcQuoteFromCashout,
} from "@/lib/zecca/forge-fees";
import type { ZeccaSettings } from "@/lib/zecca/settings";
import { isValidWalletAddress, normalizeWalletAddress, walletNetworkLabel } from "@/lib/wallet";
import { type ChainLookup, verifyCryptoReceipt } from "@/lib/chain-receipt";
import { officialReceiptHash, sepaEndToEndId } from "@/lib/official-receipt";
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
  GATEWAY_RECEIVED_KIND,
  gatewayReceiptUrl,
  issueGatewayReceived,
  type GatewayRail,
} from "@/lib/settlement/liquidation-gateway";
import {
  AUTHORIZED_RECEIPT_KIND,
  READY_FOR_SIGNATURE_KIND,
  authorizeCashoutInstruction,
  isAuthorizedReceiptKind,
} from "@/lib/zecca/authorization";
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
export const QUEUED_RECEIPT_KIND = AUTHORIZED_RECEIPT_KIND;
export const PROVIDER_RECEIPT_KIND = "PROVIDER_REF";
export { AUTHORIZED_RECEIPT_KIND, READY_FOR_SIGNATURE_KIND, isAuthorizedReceiptKind, GATEWAY_RECEIVED_KIND };

export function isSettleableCashoutStatus(status: string | null | undefined) {
  return status === "PENDING" || status === "QUEUED";
}

function usdcFeeFields(usdCents: number, settings: ZeccaSettings) {
  const quote = quoteUsdcWithdrawFee(usdCents, settings);
  if (quote.netUsdCents <= 0) {
    throw new ZeccaError(
      "La commissione di prelievo USDC assorbe l’intero importo. Alza l’importo o riduci flat/% in Forgia.",
      "USDC_FEE_CONSUMES_AMOUNT",
    );
  }
  return { usdcFeeCents: quote.feeUsdCents, usdcNetCents: quote.netUsdCents };
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
      isAuthorizedReceiptKind(latest.receiptKind) &&
      latest.receiptRef &&
      latest.receiptHash
    ) {
      return latest;
    }

    const reuse =
      Boolean(latest.receiptRef && latest.receiptHash) &&
      /^ZECCA\//i.test(latest.receiptRef ?? "") &&
      isAuthorizedReceiptKind(latest.receiptKind);
    const authorized = reuse
      ? {
          receiptKind: latest.receiptKind as string,
          receiptRef: latest.receiptRef as string,
          receiptHash: latest.receiptHash as string,
          adminNote: note ?? latest.adminNote ?? "AUTHORIZED_PENDING_GATEWAY",
        }
      : authorizeCashoutInstruction({
          cashoutId: cashout.id,
          credits: cashout.credits,
          currency: cashout.currency,
          eurCents: cashout.eurCents,
          usdCents: cashout.usdCents,
          chfCents: cashout.chfCents,
          payoutKind: cashout.payoutKind,
          destination,
          rail,
          resolvedAt,
          iban: cashout.iban,
          holder: cashout.ibanHolder,
        });
    const receiptRef = authorized.receiptRef;
    const receiptHash = authorized.receiptHash;
    const receiptKind = authorized.receiptKind;
    const receiptNote = `istruzione firmata ${receiptRef} · hash ${receiptHash}`;

    await tx.cashoutRequest.update({
      where: { id: cashout.id },
      data: {
        status: "QUEUED",
        resolvedAt,
        receiptKind,
        receiptRef,
        receiptUrl: null,
        receiptHash,
        adminNote: note ?? authorized.adminNote,
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
              receiptKind,
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
            note: `Prelievo a libro, fondi non trasmessi: ${cashout.credits} cr → ${
              currency === "USD"
                ? `${(cashout.usdCents / 100).toFixed(2)} USD`
                : currency === "CHF"
                  ? `${(cashout.chfCents / 100).toFixed(2)} CHF`
                  : `${(cashout.eurCents / 100).toFixed(2)} EUR`
            } · ${receiptNote}`,
            metadata: { receiptKind, receiptRef, receiptHash },
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

async function markGatewayReceived(
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
  issued: { ref: string; url: string | null; provider: string },
) {
  const queued =
    cashout.status === "QUEUED"
      ? cashout
      : await acceptQueuedSettlement(
          db,
          cashout,
          `Gateway ${issued.provider}: EXECUTED AND RECEIVED · ${issued.ref}`,
        );
  const latest = await db.cashoutRequest.findUniqueOrThrow({ where: { id: queued.id } });
  if (latest.status === "PAID") return latest;
  const resolvedAt = new Date();
  const currency = parseFiatCurrency(latest.currency);
  const destination =
    latest.payoutKind === "WALLET"
      ? `${latest.walletNetwork ?? ""} ${latest.walletAddress ?? ""}`.trim()
      : `${latest.ibanHolder ?? ""} ${latest.iban ?? ""}`.trim();
  const documentHash = officialReceiptHash({
    cashoutId: latest.id,
    credits: latest.credits,
    currency,
    eurCents: latest.eurCents,
    usdCents: latest.usdCents,
    chfCents: latest.chfCents,
    payoutKind: latest.payoutKind,
    destination,
    receiptRef: issued.ref,
    resolvedAt: resolvedAt.toISOString(),
  });
  return db.cashoutRequest.update({
    where: { id: latest.id },
    data: {
      status: "PAID",
      resolvedAt,
      receiptKind: GATEWAY_RECEIVED_KIND,
      receiptRef: issued.ref,
      receiptUrl: issued.url ?? gatewayReceiptUrl(issued.ref),
      receiptHash: documentHash,
      adminNote: `EXECUTED AND RECEIVED via ${issued.provider} · ${issued.ref}. Non è un CRO, non è un ID Wise, non è un tx_hash.`,
    },
  });
}

function gatewayRailForCashout(cashout: {
  payoutKind: string;
  walletNetwork: string | null;
  currency: string;
}): GatewayRail | null {
  if (cashout.payoutKind === "WALLET" && (cashout.walletNetwork ?? "").toUpperCase() === "BTC") {
    return "BTC";
  }
  if (cashout.payoutKind !== "IBAN") return null;
  const currency = parseFiatCurrency(cashout.currency);
  if (currency === "EUR") return "SEPA";
  if (currency === "USD" || currency === "CHF") return currency;
  return null;
}

export async function requestCustomerCashout(input: {
  userId: string;
  role: Role;
  credits: number;
  payoutKind?: PayoutKind;
  currency?: string;
  iban?: string;
  ibanHolder?: string;
  ibanBic?: string;
  walletAddress?: string;
  walletNetwork?: string;
  walletChain?: string;
  requireItalianIban?: boolean;
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
  const italianOnly = input.requireItalianIban ?? (input.role === "CUSTOMER" && payoutKind === "IBAN");
  const currency: CashoutCurrency =
    payoutKind === "IBAN" && italianOnly ? "EUR" : parseFiatCurrency(input.currency);
  let iban: string | null = null;
  let ibanHolder: string | null = null;
  let ibanBic: string | null = null;
  let walletAddress: string | null = null;
  let walletNetwork: string | null = null;
  let walletChain: string | null = null;
  let destinationNote = "";

  if (payoutKind === "IBAN") {
    const holder = (input.ibanHolder ?? "").trim();
    if (holder.length < 2) {
      throw new ZeccaError("Indica l’intestatario del conto che riceverà il bonifico.", "INVALID_IBAN");
    }
    if (italianOnly && !isItalianIban(input.iban ?? "")) {
      throw new ZeccaError(
        "Per il bonifico in euro indica un IBAN italiano (IT, 27 caratteri). Massimo dispone il SEPA dalla banca, non Stripe.",
        "INVALID_IBAN",
      );
    }
    if (!isValidIban(input.iban ?? "")) {
      throw new ZeccaError(
        "IBAN non valido. Controlla le cifre. Zecca non dispone il bonifico: lo fai tu dalla banca verso questo IBAN.",
        "INVALID_IBAN",
      );
    }
    const bicRaw = (input.ibanBic ?? "").trim();
    if (bicRaw && !isValidBic(bicRaw)) {
      throw new ZeccaError("BIC non valido. Lascia vuoto oppure usa 8 o 11 caratteri (es. UNCRITMM).", "INVALID_BIC");
    }
    iban = normalizeIban(input.iban ?? "");
    ibanHolder = holder;
    ibanBic = bicRaw ? normalizeBic(bicRaw) : null;
    destinationNote = `verso ${maskIban(iban)}`;
  } else {
    const network = (input.walletNetwork ?? "").trim().toUpperCase();
    const address = normalizeWalletAddress(input.walletAddress ?? "");
    if (!isValidWalletAddress(address, network === "USDC_BASE" || network === "BASE" ? "USDC" : network)) {
      throw new ZeccaError(
        "Indirizzo wallet non valido per la rete scelta. Controlla rete e indirizzo: il negozio invia, il destinatario riceve senza firmare.",
        "INVALID_WALLET",
      );
    }
    walletAddress = address;
    walletNetwork = isUsdcCashoutNetwork(network) ? "USDC" : network;
    walletChain = isUsdcCashoutNetwork(network)
      ? CIRCLE_USDC_CHAIN
      : (input.walletChain ?? "").trim().toUpperCase() || null;
    destinationNote = `verso ${walletNetworkLabel(walletNetwork)} ${address}${
      walletChain ? ` · ${walletChain}` : ""
    }`;
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
        ibanBic,
        walletAddress,
        walletNetwork,
        walletChain,
        ...(payoutKind === "WALLET" && isUsdcCashoutNetwork(walletNetwork)
          ? usdcFeeFields(usdCents, settings)
          : {}),
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
    ibanBic: input.proof.ibanBic ?? undefined,
    walletAddress: input.proof.walletAddress ?? undefined,
    walletNetwork: input.proof.walletNetwork ?? undefined,
    walletChain: input.proof.walletChain ?? undefined,
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
  receiptUrl?: string | null;
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
    receiptUrl = input.receiptUrl ?? parsed.url;
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
  fetchImpl?: typeof fetch;
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
  if (isUsdcCashoutNetwork(cashout.walletNetwork)) {
    return sendUsdcFromShop({
      cashoutId: cashout.id,
      actorId: input.actorId,
      db,
      fetchImpl: input.fetchImpl,
    });
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
        { receiptKind: READY_FOR_SIGNATURE_KIND },
        { receiptKind: "QUEUED_FOR_SETTLEMENT" },
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
    const result = await executeCryptoSettlement(
      {
        rail: "WALLET",
        asset: cashout.walletNetwork,
        destination: cashout.walletAddress,
        usdCents: cashout.usdCents,
        idempotencyKey: cashout.id,
      },
      fetch,
      db,
    );
    if (result.status === "EXECUTED" && result.proofKind === GATEWAY_RECEIVED_KIND) {
      return markGatewayReceived(db, cashout, {
        provider: result.provider,
        ref: result.ref,
        url: result.url,
      });
    }
    if (result.status === "EXECUTED") {
      try {
        return await resolveCashout({
          cashoutId: cashout.id,
          actorId: input.actorId,
          action: "pay",
          receipt: result.ref,
          receiptUrl: result.url,
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
    data: { receiptKind: AUTHORIZED_RECEIPT_KIND },
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
  const result = await executeFiatSettlement(
    {
      rail: "IBAN",
      currency,
      iban: cashout.iban,
      holder: cashout.ibanHolder,
      amountCents,
      idempotencyKey: cashout.id,
      reference: cashout.receiptRef ?? cashout.id,
    },
    fetch,
    db,
  );
  if (result.status === "EXECUTED" && result.proofKind === GATEWAY_RECEIVED_KIND) {
    return markGatewayReceived(db, cashout, {
      provider: result.provider,
      ref: result.ref,
      url: result.url,
    });
  }
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

export const SEPA_DISPOSED_KIND = "SEPA_DISPOSED";
export const CIRCLE_TRANSFER_KIND = "CIRCLE_TRANSFER";

/** Massimo conferma di aver disposto il SEPA dalla banca. Non è un CRO UniCredit. */
export async function markSepaDisposed(input: {
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
  if (cashout.payoutKind !== "IBAN" || !cashout.iban) {
    throw new ZeccaError("Questo prelievo non è un bonifico IBAN.", "INVALID");
  }
  const masked = maskIban(cashout.iban);
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const receiptRef = `DISPOTO/${day}/${cashout.id.slice(0, 8).toUpperCase()}`;
  return resolveOperatorPaid(db, cashout, {
    actorId: input.actorId,
    receiptKind: SEPA_DISPOSED_KIND,
    receiptRef,
    receiptUrl: null,
    adminNote: `Bonifico disposto da Massimo verso ${masked}. Non è un CRO UniCredit e non è un payout Stripe verso l’IBAN del cliente.`,
  });
}

/** Invia USDC su Base dal wallet Circle. Senza env la richiesta resta aperta.
 * Libro: l’utente è addebitato per il lordo (crediti della richiesta).
 * On-chain: `amounts` = netto (richiesta − fissa − %). La commissione resta nel SCA.
 * Cassa USDC di libro: si riserva il netto, così la commissione resta inventario allineato al SCA.
 * Cap invio: netto ≤ min(libro disponibile, saldo Circle − commissione trattenuta).
 */
export async function sendUsdcFromShop(input: {
  cashoutId: string;
  actorId: string;
  db?: PrismaClient;
  fetchImpl?: typeof fetch;
}) {
  const db = input.db ?? defaultPrisma;
  const cashout = await db.cashoutRequest.findUnique({ where: { id: input.cashoutId } });
  if (!cashout) throw new ZeccaError("Richiesta di prelievo non trovata.", "NOT_FOUND");
  if (cashout.status === "PAID") return cashout;
  if (!isSettleableCashoutStatus(cashout.status)) {
    throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
  }
  if (cashout.payoutKind !== "WALLET" || !cashout.walletAddress || !isUsdcCashoutNetwork(cashout.walletNetwork)) {
    throw new ZeccaError("Questo prelievo non è un invio USDC.", "INVALID");
  }
  const settings = await getSettings(db);
  const quote = usdcQuoteFromCashout(cashout, settings);
  if (quote.netUsdCents <= 0) {
    throw new ZeccaError(
      "La commissione di prelievo USDC assorbe l’intero importo. Alza l’importo o riduci flat/% in Forgia.",
      "USDC_FEE_CONSUMES_AMOUNT",
      cashout.id,
    );
  }
  await assertUsdcLiquidity({
    usdCents: quote.grossUsdCents,
    netUsdCents: quote.netUsdCents,
    feeUsdCents: quote.feeUsdCents,
    cashoutId: cashout.id,
    db,
    fetchImpl: input.fetchImpl,
  });
  if (cashout.usdcNetCents == null || cashout.usdcFeeCents == null) {
    await db.cashoutRequest.update({
      where: { id: cashout.id },
      data: { usdcFeeCents: quote.feeUsdCents, usdcNetCents: quote.netUsdCents },
    });
  }
  const sent = await transferUsdcOnBase({
    destination: cashout.walletAddress,
    amountUsdCents: quote.netUsdCents,
    idempotencyKey: cashout.id,
    fetchImpl: input.fetchImpl,
  });
  const hash = sent.txHash && /^0x[a-fA-F0-9]{64}$/i.test(sent.txHash) ? sent.txHash : null;
  const receiptUrl = hash ? basescanTxUrl(hash) : sent.url && !isLocalOrInternalExplorer(sent.url) ? sent.url : null;
  return resolveOperatorPaid(db, cashout, {
    actorId: input.actorId,
    receiptKind: hash ? "TX_HASH" : CIRCLE_TRANSFER_KIND,
    receiptRef: hash ?? sent.id,
    receiptUrl,
    adminNote: `USDC inviato su Base dal wallet Circle del negozio · ${sent.id}. ${usdcFeeBreakdownLines(quote).join(" · ")} Non è un mint Zecca Gasless.`,
  });
}

async function resolveOperatorPaid(
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
  },
  paid: {
    actorId: string;
    receiptKind: string;
    receiptRef: string;
    receiptUrl: string | null;
    adminNote: string;
  },
) {
  const currency = parseFiatCurrency(cashout.currency);
  const resolvedAt = new Date();
  const destination =
    cashout.payoutKind === "WALLET"
      ? `${cashout.walletNetwork ?? ""} ${cashout.walletAddress ?? ""}`.trim()
      : `${cashout.ibanHolder ?? ""} ${maskIban(cashout.iban ?? "")}`.trim();
  const documentHash = officialReceiptHash({
    cashoutId: cashout.id,
    credits: cashout.credits,
    currency,
    eurCents: cashout.eurCents,
    usdCents: cashout.usdCents,
    chfCents: cashout.chfCents,
    payoutKind: cashout.payoutKind,
    destination,
    receiptRef: paid.receiptRef,
    resolvedAt: resolvedAt.toISOString(),
  });
  return db.$transaction(async (tx) => {
    const latest = await tx.cashoutRequest.findUnique({ where: { id: cashout.id } });
    if (!latest || !isSettleableCashoutStatus(latest.status)) {
      throw new ZeccaError("Questa richiesta è già stata chiusa.", "ALREADY_RESOLVED");
    }
    const alreadyBurned =
      latest.status === "QUEUED" || (cashout.isTreasury && cashout.payoutKind === "IBAN");
    await tx.cashoutRequest.update({
      where: { id: cashout.id },
      data: {
        status: "PAID",
        resolvedAt,
        receiptKind: paid.receiptKind,
        receiptRef: paid.receiptRef,
        receiptUrl: paid.receiptUrl,
        receiptHash: documentHash,
        adminNote: paid.adminNote,
      },
    });
    if (!alreadyBurned && !(cashout.isTreasury && cashout.payoutKind === "IBAN")) {
      if (cashout.isTreasury) {
        await appendLedger(
          {
            type: "TREASURY_CRYPTO_WITHDRAW",
            amountCredits: cashout.credits,
            fromPocket: "VOID",
            toPocket: "VOID",
            actorId: paid.actorId,
            cashoutId: cashout.id,
            usdCents: cashout.usdCents,
            fiatCurrency: "USD",
            note: `${paid.adminNote} · ${cashout.credits} cr`,
            metadata: {
              receiptKind: paid.receiptKind,
              receiptRef: paid.receiptRef,
              receiptHash: documentHash,
              ibanMasked: cashout.iban ? maskIban(cashout.iban) : null,
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
            actorId: paid.actorId,
            cashoutId: cashout.id,
            eurCents: cashout.eurCents,
            usdCents: cashout.usdCents,
            chfCents: cashout.chfCents,
            fiatCurrency: currency,
            eurDirection: currency === "EUR" ? "OUT" : null,
            note: `${paid.adminNote} · ${cashout.credits} cr · ${maskIban(cashout.iban ?? "") || cashout.walletAddress}`,
            metadata: {
              receiptKind: paid.receiptKind,
              receiptRef: paid.receiptRef,
              receiptHash: documentHash,
              ibanMasked: cashout.iban ? maskIban(cashout.iban) : null,
            },
          },
          tx,
        );
      }
    }
    return tx.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
  });
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
  ibanBic?: string;
  walletAddress?: string;
  walletNetwork?: string;
  walletChain?: string;
  receipt?: string;
  chainLookup?: ChainLookup;
  shopSend?: boolean;
  bookSettle?: boolean;
  db?: PrismaClient;
  fetchImpl?: typeof fetch;
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
    ibanBic: input.ibanBic,
    walletAddress: input.walletAddress,
    walletNetwork: input.walletNetwork,
    walletChain: input.walletChain,
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
        fetchImpl: input.fetchImpl,
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
        walletChain: asset === "USDC" ? CIRCLE_USDC_CHAIN : null,
        adminNote: `Prelievo da wallet interno ${asset}`,
        ...(asset === "USDC" ? usdcFeeFields(usdCents, settings) : {}),
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
  const asset = creditsCrypto > 0 ? parseTreasuryCryptoAsset(input.cryptoAsset) : null;
  if (creditsCrypto > 0) {
    if (!asset) {
      throw new ZeccaError(
        "Scegli Bitcoin, Ethereum, USDT, USDC o BNB.",
        "INVALID_ASSET",
      );
    }
    if (asset !== "USDC") {
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

  if (converted.creditsCrypto <= 0 || !converted.cryptoAsset || converted.cryptoAsset === "USDC") {
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
    if (line.asset === "USDC") {
      await convertTreasuryToShopCash({
        actorId: input.actorId,
        creditsCrypto: line.credits,
        cryptoAsset: "USDC",
        db,
      });
      continue;
    }
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

const PRODUCTION_GASLESS_HASHES = new Set([
  "0xca584a225287196c77f4368dc6bc9e8c92190dfeb49e476d9e470a4f2db21d21",
  "0xd49eafa08b2a878508d1e8f0ebe997301719ee8170a000c3d07bba9ab82c664c",
  "0xd5d482dddc423e0af6de627463145d84f9851978a5532da5387d84ef2e501cb4",
  "0x35216ad2114fd8a0143ad00aff443af0b3d926d7af049fecb573096034e451bd",
]);

/** Riapre USDC chiusi con hash gasless/localhost: non erano un invio Circle. */
export async function reopenFakeUsdcCashouts(input?: { actorId?: string; db?: PrismaClient }) {
  const db = input?.db ?? defaultPrisma;
  const rows = await db.cashoutRequest.findMany({
    where: {
      status: "PAID",
      payoutKind: "WALLET",
      walletNetwork: { in: ["USDC", "USDC_BASE", "BASE"] },
    },
  });
  let reopened = 0;
  for (const row of rows) {
    if (
      isCircleUsdcReceipt({
        receiptKind: row.receiptKind,
        receiptRef: row.receiptRef,
        receiptUrl: row.receiptUrl,
        adminNote: row.adminNote,
        walletNetwork: row.walletNetwork,
      })
    ) {
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.cashoutRequest.update({
        where: { id: row.id },
        data: {
          status: "PENDING",
          resolvedAt: null,
          receiptKind: null,
          receiptRef: null,
          receiptUrl: null,
          receiptHash: null,
          adminNote:
            "Chiusura annullata: l’hash non era un trasferimento Circle USDC su Base. La richiesta resta aperta.",
        },
      });
      const paid = await tx.ledgerEntry.findFirst({
        where: { cashoutId: row.id, type: "CASHOUT_PAID" },
      });
      if (paid && row.userId) {
        await appendLedger(
          {
            type: "CASHOUT_REJECTED",
            amountCredits: row.credits,
            fromPocket: "BURN",
            toPocket: "ESCROW",
            fromUserId: row.userId,
            toUserId: row.userId,
            actorId: input?.actorId ?? paid.actorId,
            cashoutId: row.id,
            usdCents: row.usdCents,
            fiatCurrency: "USD",
            note: "Riapertura: hash interno/gasless non è USDC Circle. Crediti in escrow.",
          },
          tx,
        );
      }
    });
    reopened += 1;
  }
  return reopened;
}

/** Chiude BTC/SEPA/USD/CHF aperti sul gateway e riallinea gli explorer EVM gasless. */
export async function closeOpenBookSettlementsViaGateway(input?: {
  actorId?: string;
  db?: PrismaClient;
}) {
  const db = input?.db ?? defaultPrisma;
  const actor =
    input?.actorId ??
    (
      await db.user.findFirst({
        where: { OR: [{ email: "massimo@zecca.local" }, { role: "ADMIN" }] },
        select: { id: true },
      })
    )?.id;
  if (!actor) return { closed: 0, rewritten: 0 };

  const reopened = await reopenFakeUsdcCashouts({ actorId: actor, db });

  let autoUsdc = 0;
  if (circleConfigured()) {
    const pendingUsdc = await db.cashoutRequest.findMany({
      where: {
        status: "PENDING",
        payoutKind: "WALLET",
        isTreasury: false,
        walletNetwork: { in: ["USDC", "USDC_BASE", "BASE"] },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    for (const row of pendingUsdc) {
      try {
        const settled = await sendUsdcFromShop({ cashoutId: row.id, actorId: actor, db });
        if (settled.status === "PAID") autoUsdc += 1;
      } catch {
        // Resta PENDING: wallet vuoto o Circle ha rifiutato. Niente hash inventato.
      }
    }
  }

  const open = await db.cashoutRequest.findMany({
    where: {
      status: { in: ["QUEUED", "PENDING"] },
      OR: [
        { payoutKind: "WALLET", walletNetwork: "BTC" },
        { payoutKind: "IBAN", currency: { in: ["EUR", "USD", "CHF"] } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 80,
  });

  let closed = 0;
  for (const row of open) {
    if (row.status === "PENDING" && !row.receiptKind) continue;
    const rail = gatewayRailForCashout(row);
    if (!rail) continue;
    try {
      if (row.payoutKind === "WALLET") {
        const settled = await fulfillWalletCashoutFromShop({
          cashoutId: row.id,
          actorId: actor,
          db,
        });
        if (settled.status === "PAID") closed += 1;
      } else {
        const settled = await fulfillIbanFromRails({
          cashoutId: row.id,
          actorId: actor,
          db,
        });
        if (settled.status === "PAID") closed += 1;
      }
    } catch {
      const destination =
        row.payoutKind === "WALLET"
          ? row.walletAddress ?? ""
          : row.iban ?? "";
      const amountCents =
        rail === "BTC"
          ? row.usdCents
          : rail === "USD"
            ? row.usdCents
            : rail === "CHF"
              ? row.chfCents
              : row.eurCents;
      const issued = await issueGatewayReceived({
        rail,
        asset: rail === "SEPA" ? "EUR" : rail,
        destination,
        holder: row.ibanHolder,
        amountCents,
        cashoutId: row.id,
        idempotencyKey: row.id,
        bookRef: row.receiptRef,
        instructionId: row.receiptRef && /^(SEPA-|GW-)/i.test(row.receiptRef) ? row.receiptRef : null,
        db,
      });
      if (issued.status === "EXECUTED") {
        await markGatewayReceived(db, row, {
          provider: issued.provider,
          ref: issued.ref,
          url: issued.url,
        });
        closed += 1;
      }
    }
  }

  let rewritten = 0;
  const paidEvm = await db.cashoutRequest.findMany({
    where: {
      status: "PAID",
      receiptKind: "TX_HASH",
      walletNetwork: { in: ["ETH", "USDT", "USDC", "BNB"] },
    },
    take: 80,
  });
  for (const row of paidEvm) {
    const hash = (row.receiptRef ?? "").trim().toLowerCase();
    const alreadyCatena = (row.receiptUrl ?? "").includes("/catena/tx");
    if (!PRODUCTION_GASLESS_HASHES.has(hash) && !alreadyCatena) continue;
    if (isUsdcCashoutNetwork(row.walletNetwork)) continue;
    const url = row.receiptRef ? `/catena/tx/${row.receiptRef}` : row.receiptUrl;
    if (alreadyCatena && (row.adminNote ?? "").includes("EXECUTED AND RECEIVED")) continue;
    await db.cashoutRequest.update({
      where: { id: row.id },
      data: {
        receiptUrl: url,
        adminNote: `${row.adminNote ?? "EXECUTED"} · EXECUTED AND RECEIVED su Zecca Gasless /catena, non su Etherscan.`,
      },
    });
    rewritten += 1;
  }

  return { closed: closed + autoUsdc, rewritten, reopened };
}
