import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger } from "@/lib/zecca/ledger";

export async function mintCredits(input: {
  amount: number;
  note?: string;
  actorId: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ZeccaError("Indica un importo da coniare maggiore di zero.", "INVALID_AMOUNT");
  }
  if (amount > 1_000_000) {
    throw new ZeccaError("Il lotto è troppo grande: massimo 1.000.000 di crediti.", "INVALID_AMOUNT");
  }

  return db.$transaction(async (tx) => {
    const entry = await appendLedger(
      {
        type: "MINT",
        amountCredits: amount,
        fromPocket: "VOID",
        toPocket: "TREASURY",
        actorId: input.actorId,
        note: input.note?.trim() || `Lotto coniato: ${amount} crediti`,
      },
      tx,
    );
    return entry;
  });
}
