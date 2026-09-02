import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger, treasuryBalance } from "@/lib/zecca/ledger";
import { creditsToEurCents, getSettings } from "@/lib/zecca/settings";

export async function purchaseCredits(input: {
  userId: string;
  credits: number;
  method: "demo" | "stripe";
  stripeSessionId?: string | null;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Scegli un numero di crediti da acquistare.", "INVALID_AMOUNT");
  }

  return db.$transaction(async (tx) => {
    const treasury = await treasuryBalance(tx);
    if (treasury < credits) {
      throw new ZeccaError(
        "La tesoreria è a corto di crediti. Il zecchiere deve coniare un nuovo lotto prima che tu possa acquistarli.",
        "TREASURY_SHORT",
      );
    }

    const settings = await getSettings(db);
    const eurCents = creditsToEurCents(credits, settings.eurCentsPerCredit);

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
