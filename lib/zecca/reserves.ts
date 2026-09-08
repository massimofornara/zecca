import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { totals } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";

export type ReserveReport = {
  outstandingCredits: number;
  treasuryCredits: number;
  mintedCredits: number;
  liabilityCents: number;
  stripeEurCents: number;
  demoEurCents: number;
  stripeCredits: number;
  demoCredits: number;
  /** null se non c’è circolante da coprire */
  reserveRatio: number | null;
  fullyReserved: boolean;
};

export async function getReserveReport(
  db: PrismaClient = defaultPrisma,
): Promise<ReserveReport> {
  const [flow, settings, stripe, demo, bank] = await Promise.all([
    totals(db),
    getSettings(db),
    db.creditPurchase.aggregate({
      where: { method: "stripe", status: "completed" },
      _sum: { eurCents: true, credits: true },
    }),
    db.creditPurchase.aggregate({
      where: { method: "demo", status: "completed" },
      _sum: { eurCents: true, credits: true },
    }),
    db.creditPurchase.aggregate({
      where: { method: "bonifico", status: "completed" },
      _sum: { eurCents: true, credits: true },
    }),
  ]);

  const outstandingCredits = flow.inWallets + flow.inEscrow;
  const liabilityCents = outstandingCredits * settings.eurCentsPerCredit;
  const stripeEurCents = stripe._sum.eurCents ?? 0;
  const bankEurCents = bank._sum.eurCents ?? 0;
  const receivedEurCents = stripeEurCents + bankEurCents;
  const reserveRatio = liabilityCents <= 0 ? null : receivedEurCents / liabilityCents;

  return {
    outstandingCredits,
    treasuryCredits: flow.treasury,
    mintedCredits: flow.minted,
    liabilityCents,
    stripeEurCents: receivedEurCents,
    demoEurCents: demo._sum.eurCents ?? 0,
    stripeCredits: stripe._sum.credits ?? 0,
    demoCredits: demo._sum.credits ?? 0,
    reserveRatio,
    fullyReserved: reserveRatio != null && reserveRatio >= 1,
  };
}

export function formatReserveRatio(ratio: number | null) {
  if (ratio == null) return "n.d.";
  return `${Math.round(ratio * 1000) / 10}%`;
}
