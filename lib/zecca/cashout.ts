import type { PrismaClient, Role } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { isValidWalletAddress, normalizeWalletAddress, walletNetworkLabel } from "@/lib/wallet";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { creditsToEurCents, getSettings } from "@/lib/zecca/settings";

export type PayoutKind = "IBAN" | "WALLET";

export async function requestCustomerCashout(input: {
  userId: string;
  role: Role;
  credits: number;
  payoutKind?: PayoutKind;
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
        "IBAN non valido. Usa un IBAN italiano (27 caratteri). Zecca non dispone il bonifico: lo fa il zecchiere dalla sua banca.",
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
  const eurCents = creditsToEurCents(credits, settings.eurCentsPerCredit);

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
        usdCents: 0,
        currency: "EUR",
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
        fiatCurrency: "EUR",
        note: `Richiesta di prelievo: ${credits} cr → ${(eurCents / 100).toFixed(2)} EUR ${destinationNote}`,
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
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;

  return db.$transaction(async (tx) => {
    const cashout = await tx.cashoutRequest.findUnique({ where: { id: input.cashoutId } });
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

    if (input.action === "pay") {
      await tx.cashoutRequest.update({
        where: { id: cashout.id },
        data: {
          status: "PAID",
          resolvedAt: new Date(),
          adminNote: input.adminNote?.trim() || "Pagata",
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
          fiatCurrency: (cashout.currency === "USD" ? "USD" : "EUR") as "EUR" | "USD",
          eurDirection: cashout.currency === "USD" ? null : "OUT",
          note: `Prelievo pagato: ${cashout.credits} cr`,
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
