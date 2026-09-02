import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { LEDGER_INT_MAX, parsePositiveCredits } from "@/lib/zecca/amount";
import { appendLedger, treasuryBalance } from "@/lib/zecca/ledger";

type Db = PrismaClient | Prisma.TransactionClient;

export async function mintCredits(input: {
  amount: number;
  note?: string;
  actorId: string;
  db?: Db;
}) {
  const amount = parsePositiveCredits(input.amount);
  if (amount == null) {
    throw new ZeccaError("Indica un importo da coniare maggiore di zero.", "INVALID_AMOUNT");
  }
  if (amount > LEDGER_INT_MAX) {
    throw new ZeccaError(
      `Un colpo di conio può arrivare a ${LEDGER_INT_MAX.toLocaleString("it-IT")} cr (capacità del registro).`,
      "INVALID_AMOUNT",
    );
  }

  const run = async (tx: Db) =>
    appendLedger(
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

  if (input.db) return run(input.db);
  return defaultPrisma.$transaction(async (tx) => run(tx));
}

/** Se la tesoreria non copre il bisogno, la zecca batte il metallo mancante. */
export async function ensureTreasury(input: {
  needed: number;
  actorId: string;
  db?: Db;
}) {
  const db = input.db ?? defaultPrisma;
  const needed = Math.floor(input.needed);
  if (!Number.isFinite(needed) || needed <= 0) return 0;
  const have = await treasuryBalance(db);
  if (have >= needed) return 0;
  const gap = needed - have;
  await mintCredits({
    amount: gap,
    note: "Conio continuo: la zecca batte i crediti mancanti",
    actorId: input.actorId,
    db,
  });
  return gap;
}
