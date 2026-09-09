import type { PrismaClient, Role } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { isValidWalletAddress, normalizeWalletAddress, walletNetworkLabel } from "@/lib/wallet";
import { type ChainLookup, verifyCryptoReceipt } from "@/lib/chain-receipt";
import { officialReceiptHash, sepaEndToEndId } from "@/lib/official-receipt";
import { parsePayoutReceipt, type ReceiptKind } from "@/lib/receipt";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { creditsToEurCents, creditsToUsdCents, getSettings } from "@/lib/zecca/settings";

export type PayoutKind = "IBAN" | "WALLET";
export type CashoutCurrency = "EUR" | "USD";

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
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Indica i crediti da prelevare.", "INVALID_AMOUNT");
  }

  const payoutKind: PayoutKind = input.payoutKind === "WALLET" ? "WALLET" : "IBAN";
  const currency: CashoutCurrency = input.currency === "USD" ? "USD" : "EUR";
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
        "Indirizzo wallet non valido per la rete scelta. Controlla rete e indirizzo: Massimo invierà da un wallet suo, l’app non spedisce da sola.",
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
  const resolvedCurrency: CashoutCurrency = payoutKind === "WALLET" ? "USD" : currency;
  const fiatLabel =
    payoutKind === "WALLET"
      ? `${(usdCents / 100).toFixed(2)} USD in ${walletNetworkLabel(walletNetwork ?? "OTHER")}`
      : resolvedCurrency === "USD"
        ? `${(usdCents / 100).toFixed(2)} USD`
        : `${(eurCents / 100).toFixed(2)} EUR`;

  return db.$transaction(async (tx) => {
    const available = await pocketBalance("USER", input.userId, tx);
    if (available < credits) {
      throw new ZeccaError("Crediti insufficienti nel portafoglio.", "INSUFFICIENT_CREDITS");
    }

    const cashout = await tx.cashoutRequest.create({
      data: {
        userId: input.userId,
        credits,
        eurCents,
        usdCents,
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
        fiatCurrency: resolvedCurrency,
        note: `Richiesta di prelievo: ${credits} cr → ${fiatLabel} ${destinationNote}`,
      },
      tx,
    );

    return cashout;
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
  if (cashout.isTreasury) {
    throw new ZeccaError("Le fusioni di tesoreria si eseguono direttamente.", "INVALID");
  }
  if (!cashout.userId) {
    throw new ZeccaError("Prelievo senza titolare.", "INVALID");
  }

  const currency = cashout.currency === "USD" ? "USD" : "EUR";
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
              ? "Hash di rete registrato: Zecca non ha inviato la crypto"
              : "CRO bancario registrato: Zecca non ha disposto il bonifico"),
          receiptKind,
          receiptRef,
          receiptUrl,
          receiptHash: documentHash,
        },
      });
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
          fiatCurrency: currency,
          eurDirection: currency === "USD" ? null : "OUT",
          note: `Prelievo pagato: ${cashout.credits} cr → ${
            currency === "USD"
              ? `${(cashout.usdCents / 100).toFixed(2)} USD`
              : `${(cashout.eurCents / 100).toFixed(2)} EUR`
          } · ${receiptNote}`,
          metadata: { receiptKind, receiptRef, receiptUrl, receiptHash: documentHash },
        },
        tx,
      );
    } else {
      await tx.cashoutRequest.update({
        where: { id: cashout.id },
        data: {
          status: "REJECTED",
          resolvedAt: new Date(),
          adminNote: input.adminNote?.trim() || "Rifiutata",
        },
      });
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

    return tx.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
  });
}

export function houseBankReceiptRef(cashoutId: string, currency: string) {
  return sepaEndToEndId(cashoutId, currency);
}

/**
 * Casa: crypto si chiude solo con hash di rete già confermato.
 * IBAN resta aperto finché non c’è un CRO bancario vero: Zecca non dispone bonifici.
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
  const payoutKind = cashout.payoutKind === "WALLET" ? "WALLET" : "IBAN";
  const typed = (input.receipt ?? "").trim();
  if (payoutKind === "WALLET" && !typed) {
    throw new ZeccaError(
      "Incolla l’hash reale della transazione già inviata al wallet. Senza hash il prelievo crypto non parte.",
      "INVALID_RECEIPT",
    );
  }
  if (payoutKind === "IBAN" && !typed) {
    return cashout;
  }
  return resolveCashout({
    cashoutId: cashout.id,
    actorId: input.userId,
    action: "pay",
    receipt: typed,
    chainLookup: input.chainLookup,
    db,
  });
}
