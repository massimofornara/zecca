import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { LEDGER_INT_MAX, parsePositiveCredits } from "@/lib/zecca/amount";
import { appendLedger } from "@/lib/zecca/ledger";
import { creditsToEurCents, creditsToUsdCents, getSettings } from "@/lib/zecca/settings";

export {
  HOUSE_PAYOUT_ACCOUNTS,
  housePayoutAccount,
  housePayoutByIban,
  housePayoutForCurrency,
  housePayoutLabel,
  type HousePayoutAccount,
} from "@/lib/zecca/house-accounts";

/** Email che possono generare crediti senza pagamento e prelevarne il valore. */
export const HOUSE_EMAILS = [
  "massimo.fornara.2212@gmail.com",
  "mfornara93@gmail.com",
] as const;

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").toLowerCase().trim();
}

export function isHouseEmail(email: string | null | undefined): boolean {
  return (HOUSE_EMAILS as readonly string[]).includes(normalizeEmail(email));
}

export async function ensureHouseAdmin(input: {
  userId: string;
  email: string;
  db?: PrismaClient;
}) {
  if (!isHouseEmail(input.email)) return false;
  const db = input.db ?? defaultPrisma;
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { role: true } });
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  await db.user.update({ where: { id: input.userId }, data: { role: "ADMIN" } });
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
    if (!user || !isHouseEmail(user.email)) {
      throw new ZeccaError(
        "Solo massimo.fornara.2212@gmail.com e mfornara93@gmail.com possono generare crediti senza pagare.",
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
