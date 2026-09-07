import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export type ForgeTier = {
  minSpent: number;
  maxSpent: number | null;
  percent: number;
};

export type ZeccaSettings = {
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
  forgeTiers: ForgeTier[];
};

export const DEFAULT_SETTINGS: ZeccaSettings = {
  eurCentsPerCredit: 100,
  usdCentsPerCredit: 108,
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
    usdCentsPerCredit: map.usdCentsPerCredit
      ? Number(map.usdCentsPerCredit)
      : DEFAULT_SETTINGS.usdCentsPerCredit,
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
  const current = await getSettings(db);

  async function writeRate(
    key: "eurCentsPerCredit" | "usdCentsPerCredit",
    nextCents: number | undefined,
    label: string,
  ) {
    if (nextCents == null) return;
    await db.setting.upsert({
      where: { key },
      create: { key, value: String(nextCents) },
      update: { value: String(nextCents) },
    });
    if (current[key] !== nextCents) {
      await db.ledgerEntry.create({
        data: {
          type: "RATE_CHANGE",
          amountCredits: 0,
          fromPocket: "VOID",
          toPocket: "VOID",
          actorId,
          note: `Tasso aggiornato: 1 credito = ${(nextCents / 100).toLocaleString("it-IT")} ${label} (prima ${(current[key] / 100).toLocaleString("it-IT")} ${label})`,
          metadata: JSON.stringify({ key, from: current[key], to: nextCents }),
        },
      });
    }
  }

  await writeRate("eurCentsPerCredit", next.eurCentsPerCredit, "EUR");
  await writeRate("usdCentsPerCredit", next.usdCentsPerCredit, "USD");
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
