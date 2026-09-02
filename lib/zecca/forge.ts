import type { PrismaClient, Role } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { romeDayBounds } from "@/lib/rome-day";
import { pocketBalance } from "@/lib/zecca/ledger";
import { getSettings, type ForgeTier } from "@/lib/zecca/settings";

export function tierForSpend(spentToday: number, tiers: ForgeTier[]): ForgeTier {
  const sorted = [...tiers].sort((a, b) => a.minSpent - b.minSpent);
  let current = sorted[0];
  for (const tier of sorted) {
    const underMax = tier.maxSpent == null || spentToday <= tier.maxSpent;
    if (spentToday >= tier.minSpent && underMax) current = tier;
  }
  return current;
}

export function nextTier(spentToday: number, tiers: ForgeTier[]): ForgeTier | null {
  const sorted = [...tiers].sort((a, b) => a.minSpent - b.minSpent);
  return sorted.find((t) => t.minSpent > spentToday) ?? null;
}

export async function spentToday(
  userId: string,
  db: PrismaClient = defaultPrisma,
  now = new Date(),
) {
  const { start, end } = romeDayBounds(now);
  const agg = await db.ledgerEntry.aggregate({
    where: {
      type: "SPEND_ON_ORDER",
      fromUserId: userId,
      createdAt: { gte: start, lt: end },
    },
    _sum: { amountCredits: true },
  });
  return agg._sum.amountCredits ?? 0;
}

export type ForgeState = {
  spentToday: number;
  percent: number;
  forged: number;
  available: number;
  escrow: number;
  next: ForgeTier | null;
  tier: ForgeTier;
  dayKey: string;
  isAdmin: boolean;
};

export async function getForgeState(input: {
  userId: string;
  role: Role;
  db?: PrismaClient;
  now?: Date;
}): Promise<ForgeState> {
  const db = input.db ?? defaultPrisma;
  const settings = await getSettings(db);
  const spent = await spentToday(input.userId, db, input.now);
  const available = await pocketBalance("USER", input.userId, db);
  const escrow = await pocketBalance("ESCROW", input.userId, db);
  const { key } = romeDayBounds(input.now);
  const isAdmin = input.role === "ADMIN";
  const tier = isAdmin
    ? { minSpent: 0, maxSpent: null, percent: 100 }
    : tierForSpend(spent, settings.forgeTiers);
  const percent = tier.percent;
  const forged = isAdmin ? available : Math.floor((available * percent) / 100);

  return {
    spentToday: spent,
    percent,
    forged,
    available,
    escrow,
    next: isAdmin ? null : nextTier(spent, settings.forgeTiers),
    tier,
    dayKey: key,
    isAdmin,
  };
}

export async function loyalToday(db: PrismaClient = defaultPrisma, now = new Date()) {
  const { start, end } = romeDayBounds(now);
  const spends = await db.ledgerEntry.groupBy({
    by: ["fromUserId"],
    where: {
      type: "SPEND_ON_ORDER",
      fromUserId: { not: null },
      createdAt: { gte: start, lt: end },
    },
    _sum: { amountCredits: true },
  });

  const settings = await getSettings(db);
  const userIds = spends.map((s) => s.fromUserId).filter((id): id is string => !!id);
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const byId = new Map(users.map((u) => [u.id, u]));

  return spends
    .map((row) => {
      const user = row.fromUserId ? byId.get(row.fromUserId) : null;
      const spent = row._sum.amountCredits ?? 0;
      const tier = tierForSpend(spent, settings.forgeTiers);
      return {
        user,
        spent,
        percent: tier.percent,
        fedele: spent >= 50,
      };
    })
    .filter((r) => r.user)
    .sort((a, b) => b.spent - a.spent);
}
