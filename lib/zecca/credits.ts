import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger } from "@/lib/zecca/ledger";
import { ensureTreasury } from "@/lib/zecca/mint";
import { creditsToEurCents, getSettings } from "@/lib/zecca/settings";

export async function purchaseCredits(input: {
  userId: string;
  credits: number;
  method: "demo" | "stripe";
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
        note:
          input.method === "demo"
            ? `Acquisto dimostrativo di ${credits} crediti`
            : `Acquisto Stripe di ${credits} crediti`,
      },
      tx,
    );

    return { purchase, entry, eurCents };
  });
}
