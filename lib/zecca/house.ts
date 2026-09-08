import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { LEDGER_INT_MAX, parsePositiveCredits } from "@/lib/zecca/amount";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { creditsToEurCents, creditsToUsdCents, getSettings } from "@/lib/zecca/settings";

import {
  HOUSE_PROFILES,
  houseDisplayName,
  houseEmailCandidates,
  isHouseEmail,
  normalizeHouseEmail,
} from "@/lib/zecca/house-accounts";

export {
  HOUSE_PAYOUT_ACCOUNTS,
  HOUSE_PROFILES,
  houseDisplayName,
  houseEmailCandidates,
  housePayoutAccount,
  housePayoutByIban,
  housePayoutForCurrency,
  housePayoutLabel,
  isHouseEmail,
  type HousePayoutAccount,
} from "@/lib/zecca/house-accounts";

export const HOUSE_EMAILS = HOUSE_PROFILES.map((profile) => profile.email);

export function normalizeEmail(email: string | null | undefined): string {
  return normalizeHouseEmail(email);
}

export async function findUserByLoginEmail(email: string, db?: PrismaClient) {
  const client = db ?? defaultPrisma;
  for (const candidate of houseEmailCandidates(email)) {
    const user = await client.user.findUnique({ where: { email: candidate } });
    if (user) return user;
  }
  return null;
}

export async function ensureHouseAdmin(input: {
  userId: string;
  email: string;
  db?: PrismaClient;
}) {
  if (!isHouseEmail(input.email)) return false;
  const db = input.db ?? defaultPrisma;
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { role: true, name: true },
  });
  if (!user) return false;
  const name = houseDisplayName(input.email);
  const next = {
    role: "ADMIN" as const,
    ...(name && user.name !== name ? { name } : {}),
  };
  if (user.role !== "ADMIN" || next.name) {
    await db.user.update({ where: { id: input.userId }, data: next });
  }
  return true;
}

export async function grantHouseCredits(input: {
  userId: string;
  credits: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = parsePositiveCredits(input.credits);
  if (credits == null) {
    throw new ZeccaError("Indica una quantità di crediti maggiore di zero.", "INVALID_AMOUNT");
  }
  if (credits > LEDGER_INT_MAX) {
    throw new ZeccaError(
      `Una generazione può arrivare a ${LEDGER_INT_MAX.toLocaleString("it-IT")} cr.`,
      "INVALID_AMOUNT",
    );
  }

  const settings = await getSettings(db);

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user || (!isHouseEmail(user.email) && user.role !== "ADMIN")) {
      throw new ZeccaError(
        "Solo Massimo e Maxi possono generare crediti senza pagare.",
        "FORBIDDEN",
      );
    }
    if (user.role !== "ADMIN") {
      await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    }

    const eurCents = creditsToEurCents(credits, settings.eurCentsPerCredit);
    const usdCents = creditsToUsdCents(credits, settings.usdCentsPerCredit);

    const entry = await appendLedger(
      {
        type: "HOUSE_GRANT",
        amountCredits: credits,
        fromPocket: "VOID",
        toPocket: "USER",
        toUserId: user.id,
        actorId: user.id,
        eurCents,
        usdCents,
        note: `Generazione casa senza pagamento: ${credits} cr (valore ${ (eurCents / 100).toFixed(2) } EUR / ${ (usdCents / 100).toFixed(2) } USD)`,
      },
      tx,
    );

    return { entry, credits, eurCents, usdCents };
  });
}

/** Se il portafoglio non copre il prelievo, Massimo/Maxi (o lo zecchiere) generano il mancante. */
export async function ensureHouseWalletCredits(input: {
  userId: string;
  credits: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const needed = Math.floor(input.credits);
  if (!Number.isFinite(needed) || needed <= 0) return 0;
  const have = await pocketBalance("USER", input.userId, db);
  if (have >= needed) return 0;
  const gap = needed - have;
  await grantHouseCredits({ userId: input.userId, credits: gap, db });
  return gap;
}
