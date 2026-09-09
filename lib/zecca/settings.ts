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
  chfCentsPerCredit: number;
  forgeTiers: ForgeTier[];
  withdrawMaxUsdCentsPerTx: number;
  withdrawMaxUsdCentsPerDay: number;
  withdrawMaxCountPerHour: number;
  withdrawMinUsdCents: number;
  withdrawWhitelist: string[];
  withdrawWhitelistEnforced: boolean;
};

export const DEFAULT_SETTINGS: ZeccaSettings = {
  eurCentsPerCredit: 100,
  usdCentsPerCredit: 108,
  chfCentsPerCredit: 94,
  forgeTiers: [
    { minSpent: 0, maxSpent: 49, percent: 0 },
    { minSpent: 50, maxSpent: 149, percent: 20 },
    { minSpent: 150, maxSpent: 299, percent: 40 },
    { minSpent: 300, maxSpent: null, percent: 70 },
  ],
  withdrawMaxUsdCentsPerTx: 200_000_000,
  withdrawMaxUsdCentsPerDay: 500_000_000,
  withdrawMaxCountPerHour: 20,
  withdrawMinUsdCents: 0,
  withdrawWhitelist: [],
  withdrawWhitelistEnforced: false,
};

export const WITHDRAW_SETTING_ROWS = [
  { key: "withdrawMaxUsdCentsPerTx", value: String(DEFAULT_SETTINGS.withdrawMaxUsdCentsPerTx) },
  { key: "withdrawMaxUsdCentsPerDay", value: String(DEFAULT_SETTINGS.withdrawMaxUsdCentsPerDay) },
  { key: "withdrawMaxCountPerHour", value: String(DEFAULT_SETTINGS.withdrawMaxCountPerHour) },
  { key: "withdrawMinUsdCents", value: String(DEFAULT_SETTINGS.withdrawMinUsdCents) },
  { key: "withdrawWhitelist", value: JSON.stringify(DEFAULT_SETTINGS.withdrawWhitelist) },
  { key: "withdrawWhitelistEnforced", value: DEFAULT_SETTINGS.withdrawWhitelistEnforced ? "true" : "false" },
] as const;

function numberFromMap(map: Record<string, string>, key: string, fallback: number) {
  if (!(key in map)) return fallback;
  const value = Number(map[key]);
  return Number.isFinite(value) ? value : fallback;
}

function boolFromMap(map: Record<string, string>, key: string, fallback: boolean) {
  if (!(key in map)) return fallback;
  const raw = map[key].trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "on";
}

function whitelistFromMap(map: Record<string, string>): string[] {
  const raw = map.withdrawWhitelist;
  if (!raw) return [...DEFAULT_SETTINGS.withdrawWhitelist];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    /* stored as plain lines */
  }
  return raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

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
    chfCentsPerCredit: map.chfCentsPerCredit
      ? Number(map.chfCentsPerCredit)
      : DEFAULT_SETTINGS.chfCentsPerCredit,
    forgeTiers: map.forgeTiers
      ? (JSON.parse(map.forgeTiers) as ForgeTier[])
      : DEFAULT_SETTINGS.forgeTiers,
    withdrawMaxUsdCentsPerTx: numberFromMap(
      map,
      "withdrawMaxUsdCentsPerTx",
      DEFAULT_SETTINGS.withdrawMaxUsdCentsPerTx,
    ),
    withdrawMaxUsdCentsPerDay: numberFromMap(
      map,
      "withdrawMaxUsdCentsPerDay",
      DEFAULT_SETTINGS.withdrawMaxUsdCentsPerDay,
    ),
    withdrawMaxCountPerHour: numberFromMap(
      map,
      "withdrawMaxCountPerHour",
      DEFAULT_SETTINGS.withdrawMaxCountPerHour,
    ),
    withdrawMinUsdCents: numberFromMap(
      map,
      "withdrawMinUsdCents",
      DEFAULT_SETTINGS.withdrawMinUsdCents,
    ),
    withdrawWhitelist: whitelistFromMap(map),
    withdrawWhitelistEnforced: boolFromMap(
      map,
      "withdrawWhitelistEnforced",
      DEFAULT_SETTINGS.withdrawWhitelistEnforced,
    ),
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
    key: "eurCentsPerCredit" | "usdCentsPerCredit" | "chfCentsPerCredit",
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
  await writeRate("chfCentsPerCredit", next.chfCentsPerCredit, "CHF");
  if (next.forgeTiers) {
    await db.setting.upsert({
      where: { key: "forgeTiers" },
      create: { key: "forgeTiers", value: JSON.stringify(next.forgeTiers) },
      update: { value: JSON.stringify(next.forgeTiers) },
    });
  }

  async function writePlain(key: keyof ZeccaSettings, value: string | undefined) {
    if (value == null) return;
    await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  if (next.withdrawMaxUsdCentsPerTx != null) {
    await writePlain("withdrawMaxUsdCentsPerTx", String(Math.max(1, Math.floor(next.withdrawMaxUsdCentsPerTx))));
  }
  if (next.withdrawMaxUsdCentsPerDay != null) {
    await writePlain("withdrawMaxUsdCentsPerDay", String(Math.max(1, Math.floor(next.withdrawMaxUsdCentsPerDay))));
  }
  if (next.withdrawMaxCountPerHour != null) {
    await writePlain("withdrawMaxCountPerHour", String(Math.max(1, Math.floor(next.withdrawMaxCountPerHour))));
  }
  if (next.withdrawMinUsdCents != null) {
    await writePlain("withdrawMinUsdCents", String(Math.max(0, Math.floor(next.withdrawMinUsdCents))));
  }
  if (next.withdrawWhitelist !== undefined) {
    await writePlain("withdrawWhitelist", JSON.stringify(next.withdrawWhitelist));
  }
  if (next.withdrawWhitelistEnforced != null) {
    await writePlain("withdrawWhitelistEnforced", next.withdrawWhitelistEnforced ? "true" : "false");
  }
}

export function creditsToEurCents(credits: number, eurCentsPerCredit: number) {
  return Math.round(credits * eurCentsPerCredit);
}

export function creditsToUsdCents(credits: number, usdCentsPerCredit: number) {
  return Math.round(credits * usdCentsPerCredit);
}

export function creditsToChfCents(credits: number, chfCentsPerCredit: number) {
  return Math.round(credits * chfCentsPerCredit);
}
