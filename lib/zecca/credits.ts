import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger } from "@/lib/zecca/ledger";
import { ensureTreasury } from "@/lib/zecca/mint";
import { creditsToEurCents, getSettings } from "@/lib/zecca/settings";

export async function purchaseCredits(input: {
  userId: string;
  credits: number;
  method: "demo" | "stripe" | "bonifico";
  stripeSessionId?: string | null;
  /** Importo già verificato (es. da Stripe). Se assente, si calcola dal tasso corrente. */
  eurCents?: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Scegli un numero di crediti da acquistare.", "INVALID_AMOUNT");
  }

  return db.$transaction(async (tx) => {
    const minter =
      (await tx.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id ??
      input.userId;
    await ensureTreasury({ needed: credits, actorId: minter, db: tx });

    const settings = await getSettings(db);
    const eurCents =
      input.eurCents != null && Number.isFinite(input.eurCents) && input.eurCents > 0
        ? Math.floor(input.eurCents)
        : creditsToEurCents(credits, settings.eurCentsPerCredit);

    const purchase = await tx.creditPurchase.create({
      data: {
        userId: input.userId,
        credits,
        eurCents,
        method: input.method,
        stripeSessionId: input.stripeSessionId ?? null,
        status: "completed",
      },
    });

    const entry = await appendLedger(
      {
        type: "PURCHASE_CREDITS",
        amountCredits: credits,
        fromPocket: "TREASURY",
        toPocket: "USER",
        toUserId: input.userId,
        actorId: input.userId,
        creditPurchaseId: purchase.id,
        eurCents,
        eurDirection: "IN",
        note: purchaseNote(input.method, credits),
      },
      tx,
    );

    return { purchase, entry, eurCents };
  });
}

function purchaseNote(method: string, credits: number) {
  if (method === "demo") return `Acquisto dimostrativo di ${credits} crediti`;
  if (method === "bonifico") return `Acquisto bonifico SEPA di ${credits} crediti`;
  return `Acquisto Stripe di ${credits} crediti`;
}

export async function completePendingPurchase(input: {
  purchaseId: string;
  actorId: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  return db.$transaction(async (tx) => {
    const purchase = await tx.creditPurchase.findUnique({ where: { id: input.purchaseId } });
    if (!purchase || purchase.method !== "bonifico") {
      throw new ZeccaError("Versamento non trovato.", "NOT_FOUND");
    }
    if (purchase.status !== "pending") {
      throw new ZeccaError("Questo bonifico è già stato chiuso.", "INVALID_AMOUNT");
    }

    const minter =
      (await tx.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id ??
      input.actorId;
    await ensureTreasury({ needed: purchase.credits, actorId: minter, db: tx });

    const updated = await tx.creditPurchase.update({
      where: { id: purchase.id },
      data: { status: "completed" },
    });

    const entry = await appendLedger(
      {
        type: "PURCHASE_CREDITS",
        amountCredits: purchase.credits,
        fromPocket: "TREASURY",
        toPocket: "USER",
        toUserId: purchase.userId,
        actorId: input.actorId,
        creditPurchaseId: purchase.id,
        eurCents: purchase.eurCents,
        eurDirection: "IN",
        note: `Bonifico ${purchase.reference ?? purchase.id.slice(-6).toUpperCase()} ricevuto: ${purchase.credits} crediti`,
      },
      tx,
    );

    return { purchase: updated, entry, eurCents: purchase.eurCents };
  });
}
