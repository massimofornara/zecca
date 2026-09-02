import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export type ForgeTier = {
  minSpent: number;
  maxSpent: number | null;
  percent: number;
};

export type ZeccaSettings = {
  eurCentsPerCredit: number;
  forgeTiers: ForgeTier[];
};

export const DEFAULT_SETTINGS: ZeccaSettings = {
  eurCentsPerCredit: 100,
  forgeTiers: [
    { minSpent: 0, maxSpent: 49, percent: 0 },
    { minSpent: 50, maxSpent: 149, percent: 20 },
    { minSpent: 150, maxSpent: 299, percent: 40 },
    { minSpent: 300, maxSpent: null, percent: 70 },
  ],
};

export async function getSettings(
  db: PrismaClient = defaultPrisma,
): Promise<ZeccaSettings> {
  const rows = await db.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settings: ZeccaSettings = {
    eurCentsPerCredit: map.eurCentsPerCredit
      ? Number(map.eurCentsPerCredit)
      : DEFAULT_SETTINGS.eurCentsPerCredit,
    forgeTiers: map.forgeTiers
      ? (JSON.parse(map.forgeTiers) as ForgeTier[])
      : DEFAULT_SETTINGS.forgeTiers,
  };
  return settings;
}

export async function saveSettings(
  next: Partial<ZeccaSettings>,
  actorId: string | null,
  db: PrismaClient = defaultPrisma,
) {
  if (next.eurCentsPerCredit != null) {
    const current = await getSettings(db);
    await db.setting.upsert({
      where: { key: "eurCentsPerCredit" },
      create: { key: "eurCentsPerCredit", value: String(next.eurCentsPerCredit) },
      update: { value: String(next.eurCentsPerCredit) },
    });
    if (current.eurCentsPerCredit !== next.eurCentsPerCredit) {
      await db.ledgerEntry.create({
        data: {
          type: "RATE_CHANGE",
          amountCredits: 0,
          fromPocket: "VOID",
          toPocket: "VOID",
          actorId,
          note: `Tasso aggiornato: 1 credito = ${(next.eurCentsPerCredit / 100).toLocaleString("it-IT")} EUR (prima ${(current.eurCentsPerCredit / 100).toLocaleString("it-IT")} EUR)`,
          metadata: JSON.stringify({
            from: current.eurCentsPerCredit,
            to: next.eurCentsPerCredit,
          }),
        },
      });
    }
  }
  if (next.forgeTiers) {
    await db.setting.upsert({
      where: { key: "forgeTiers" },
      create: { key: "forgeTiers", value: JSON.stringify(next.forgeTiers) },
      update: { value: JSON.stringify(next.forgeTiers) },
    });
  }
}

export function creditsToEurCents(credits: number, eurCentsPerCredit: number) {
  return Math.round(credits * eurCentsPerCredit);
}
