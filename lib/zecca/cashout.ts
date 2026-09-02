import type { PrismaClient, Role } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { getForgeState } from "@/lib/zecca/forge";
import { creditsToEurCents, getSettings } from "@/lib/zecca/settings";

export async function requestCustomerCashout(input: {
  userId: string;
  role: Role;
  credits: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Indica i crediti da fondere.", "INVALID_AMOUNT");
  }

  const forge = await getForgeState({ userId: input.userId, role: input.role, db });
  if (forge.forged <= 0) {
    throw new ZeccaError(
      "Oggi la forgia non ha ancora sbloccato crediti. Compra in bottega per scaldare il metallo.",
      "FORGE_COLD",
    );
  }
  if (credits > forge.forged) {
    throw new ZeccaError(
      `Puoi fondere al massimo ${forge.forged} cr forgiato oggi (${forge.percent}% del portafoglio).`,
      "OVER_FORGED",
    );
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
        status: "PENDING",
        isTreasury: false,
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
        note: `Richiesta di fusione: ${credits} cr → ${(eurCents / 100).toFixed(2)} EUR`,
      },
      tx,
    );

    return cashout;
  });
}

export async function requestTreasuryCashout(input: {
  actorId: string;
  credits: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Indica i crediti di tesoreria da fondere.", "INVALID_AMOUNT");
  }

  const settings = await getSettings(db);
  const eurCents = creditsToEurCents(credits, settings.eurCentsPerCredit);

  return db.$transaction(async (tx) => {
    const treasury = await pocketBalance("TREASURY", null, tx);
    if (treasury < credits) {
      throw new ZeccaError(
        `La tesoreria ha solo ${treasury} cr. Non puoi fondere ${credits} cr.`,
        "TREASURY_SHORT",
      );
    }

    const cashout = await tx.cashoutRequest.create({
      data: {
        userId: null,
        credits,
        eurCents,
        status: "PAID",
        isTreasury: true,
        resolvedAt: new Date(),
        adminNote: "Fusione tesoreria eseguita dal zecchiere",
      },
    });

    await appendLedger(
      {
        type: "TREASURY_CASHOUT",
        amountCredits: credits,
        fromPocket: "TREASURY",
        toPocket: "BURN",
        actorId: input.actorId,
        cashoutId: cashout.id,
        eurCents,
        eurDirection: "OUT",
        note: `Fusione tesoreria: ${credits} cr → ${(eurCents / 100).toFixed(2)} EUR`,
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
      throw new ZeccaError("Richiesta di fusione non trovata.", "NOT_FOUND");
    }
    if (cashout.status !== "PENDING") {
      throw new ZeccaError("Questa fusione è già stata chiusa.", "ALREADY_RESOLVED");
    }
    if (cashout.isTreasury) {
      throw new ZeccaError("Le fusioni di tesoreria si eseguono direttamente.", "INVALID");
    }
    if (!cashout.userId) {
      throw new ZeccaError("Fusione senza titolare.", "INVALID");
    }

    if (input.action === "pay") {
      await tx.cashoutRequest.update({
        where: { id: cashout.id },
        data: {
          status: "PAID",
          resolvedAt: new Date(),
          adminNote: input.adminNote?.trim() || "Pagata (demo)",
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
          eurDirection: "OUT",
          note: `Fusione pagata: ${cashout.credits} cr`,
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
          note: `Fusione rifiutata, crediti restituiti: ${cashout.credits} cr`,
        },
        tx,
      );
    }

    return tx.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
  });
}
