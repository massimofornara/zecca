import type { LedgerType, Pocket, Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export type LedgerWrite = {
  type: LedgerType;
  amountCredits: number;
  fromPocket: Pocket;
  toPocket: Pocket;
  fromUserId?: string | null;
  toUserId?: string | null;
  actorId?: string | null;
  orderId?: string | null;
  cashoutId?: string | null;
  creditPurchaseId?: string | null;
  eurCents?: number;
  usdCents?: number;
  fiatCurrency?: "EUR" | "USD" | null;
  eurDirection?: "IN" | "OUT" | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function appendLedger(
  entry: LedgerWrite,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
) {
  if (entry.amountCredits < 0) {
    throw new Error("Il libro mastro accetta solo importi positivi");
  }
  return db.ledgerEntry.create({
    data: {
      type: entry.type,
      amountCredits: entry.amountCredits,
      fromPocket: entry.fromPocket,
      toPocket: entry.toPocket,
      fromUserId: entry.fromUserId ?? null,
      toUserId: entry.toUserId ?? null,
      actorId: entry.actorId ?? null,
      orderId: entry.orderId ?? null,
      cashoutId: entry.cashoutId ?? null,
      creditPurchaseId: entry.creditPurchaseId ?? null,
      eurCents: entry.eurCents ?? 0,
      usdCents: entry.usdCents ?? 0,
      fiatCurrency: entry.fiatCurrency ?? null,
      eurDirection: entry.eurDirection ?? null,
      note: entry.note ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
  });
}

export async function pocketBalance(
  pocket: Pocket,
  userId: string | null = null,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<number> {
  const incomingWhere =
    pocket === "USER" || pocket === "ESCROW"
      ? { toPocket: pocket, toUserId: userId }
      : { toPocket: pocket };
  const outgoingWhere =
    pocket === "USER" || pocket === "ESCROW"
      ? { fromPocket: pocket, fromUserId: userId }
      : { fromPocket: pocket };

  const [incoming, outgoing] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: incomingWhere,
      _sum: { amountCredits: true },
    }),
    db.ledgerEntry.aggregate({
      where: outgoingWhere,
      _sum: { amountCredits: true },
    }),
  ]);

  return (incoming._sum.amountCredits ?? 0) - (outgoing._sum.amountCredits ?? 0);
}

export async function userWallet(
  userId: string,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
) {
  const [available, escrow] = await Promise.all([
    pocketBalance("USER", userId, db),
    pocketBalance("ESCROW", userId, db),
  ]);
  return { available, escrow, total: available + escrow };
}

export async function treasuryBalance(
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
) {
  return pocketBalance("TREASURY", null, db);
}

export async function totals(db: PrismaClient = defaultPrisma) {
  const [minted, burned, treasury, walletsIn, walletsOut, escrowIn, escrowOut, eurIn, eurOut, usdOut, shopEur, shopUsd] =
    await Promise.all([
      db.ledgerEntry.aggregate({
        where: { type: "MINT" },
        _sum: { amountCredits: true },
      }),
      db.ledgerEntry.aggregate({
        where: { toPocket: "BURN" },
        _sum: { amountCredits: true },
      }),
      treasuryBalance(db),
      db.ledgerEntry.aggregate({
        where: { toPocket: "USER" },
        _sum: { amountCredits: true },
      }),
      db.ledgerEntry.aggregate({
        where: { fromPocket: "USER" },
        _sum: { amountCredits: true },
      }),
      db.ledgerEntry.aggregate({
        where: { toPocket: "ESCROW" },
        _sum: { amountCredits: true },
      }),
      db.ledgerEntry.aggregate({
        where: { fromPocket: "ESCROW" },
        _sum: { amountCredits: true },
      }),
      db.ledgerEntry.aggregate({
        where: { eurDirection: "IN" },
        _sum: { eurCents: true },
      }),
      db.ledgerEntry.aggregate({
        where: { eurDirection: "OUT" },
        _sum: { eurCents: true },
      }),
      db.ledgerEntry.aggregate({
        where: { type: { in: ["CASHOUT_PAID"] }, fiatCurrency: "USD" },
        _sum: { usdCents: true },
      }),
      db.ledgerEntry.aggregate({
        where: { type: "TREASURY_CONVERT_TO_EUR" },
        _sum: { eurCents: true },
      }),
      db.ledgerEntry.aggregate({
        where: { type: "TREASURY_CONVERT_TO_USD" },
        _sum: { usdCents: true },
      }),
    ]);

  const spentOnGoods = await db.ledgerEntry.aggregate({
    where: { type: "SPEND_ON_ORDER" },
    _sum: { amountCredits: true },
  });
  const cashedOut = await db.ledgerEntry.aggregate({
    where: { type: { in: ["CASHOUT_PAID", "TREASURY_CASHOUT", "TREASURY_CONVERT_TO_EUR", "TREASURY_CONVERT_TO_USD"] } },
    _sum: { amountCredits: true },
  });

  const inWallets =
    (walletsIn._sum.amountCredits ?? 0) - (walletsOut._sum.amountCredits ?? 0);
  const inEscrow =
    (escrowIn._sum.amountCredits ?? 0) - (escrowOut._sum.amountCredits ?? 0);

  return {
    minted: minted._sum.amountCredits ?? 0,
    treasury,
    inWallets,
    inEscrow,
    spentOnGoods: spentOnGoods._sum.amountCredits ?? 0,
    cashedOut: cashedOut._sum.amountCredits ?? 0,
    burned: burned._sum.amountCredits ?? 0,
    eurInCents: eurIn._sum.eurCents ?? 0,
    eurOutCents: eurOut._sum.eurCents ?? 0,
    eurNetCents: (eurIn._sum.eurCents ?? 0) - (eurOut._sum.eurCents ?? 0),
    usdOutCents: usdOut._sum.usdCents ?? 0,
    treasuryEurCents: shopEur._sum.eurCents ?? 0,
    treasuryUsdCents: shopUsd._sum.usdCents ?? 0,
  };
}
