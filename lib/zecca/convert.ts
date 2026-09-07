import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { creditsToFiatCents } from "@/lib/zecca/fiat";
import { getSettings } from "@/lib/zecca/settings";

type Db = PrismaClient | Prisma.TransactionClient;

export async function shopFiatBalances(db: Db = defaultPrisma) {
  const [eur, usd] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: { type: "TREASURY_CONVERT_TO_EUR" },
      _sum: { eurCents: true },
    }),
    db.ledgerEntry.aggregate({
      where: { type: "TREASURY_CONVERT_TO_USD" },
      _sum: { usdCents: true },
    }),
  ]);
  return {
    treasuryEurCents: eur._sum.eurCents ?? 0,
    treasuryUsdCents: usd._sum.usdCents ?? 0,
  };
}

export async function convertTreasuryToShopFiat(input: {
  actorId: string;
  creditsEur?: number;
  creditsUsd?: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const creditsEur = Math.max(0, Math.floor(Number(input.creditsEur ?? 0)));
  const creditsUsd = Math.max(0, Math.floor(Number(input.creditsUsd ?? 0)));
  if (creditsEur <= 0 && creditsUsd <= 0) {
    throw new ZeccaError("Indica i crediti da convertire in euro e/o dollari.", "INVALID_AMOUNT");
  }

  const settings = await getSettings(db);
  const eurCents = creditsToFiatCents(creditsEur, settings.eurCentsPerCredit);
  const usdCents = creditsToFiatCents(creditsUsd, settings.usdCentsPerCredit);
  const totalCredits = creditsEur + creditsUsd;

  return db.$transaction(async (tx) => {
    const treasury = await pocketBalance("TREASURY", null, tx);
    if (treasury < totalCredits) {
      throw new ZeccaError(
        `La tesoreria ha solo ${treasury} cr. Non puoi convertire ${totalCredits} cr.`,
        "TREASURY_SHORT",
      );
    }

    const entries = [];

    if (creditsEur > 0) {
      entries.push(
        await appendLedger(
          {
            type: "TREASURY_CONVERT_TO_EUR",
            amountCredits: creditsEur,
            fromPocket: "TREASURY",
            toPocket: "BURN",
            actorId: input.actorId,
            eurCents,
            usdCents: 0,
            fiatCurrency: "EUR",
            note: `Conversione tesoreria: ${creditsEur} cr → ${(eurCents / 100).toFixed(2)} EUR in cassa negozio`,
            metadata: { credits: creditsEur, eurCents },
          },
          tx,
        ),
      );
    }

    if (creditsUsd > 0) {
      entries.push(
        await appendLedger(
          {
            type: "TREASURY_CONVERT_TO_USD",
            amountCredits: creditsUsd,
            fromPocket: "TREASURY",
            toPocket: "BURN",
            actorId: input.actorId,
            eurCents: 0,
            usdCents,
            fiatCurrency: "USD",
            note: `Conversione tesoreria: ${creditsUsd} cr → ${(usdCents / 100).toFixed(2)} USD in cassa negozio`,
            metadata: { credits: creditsUsd, usdCents },
          },
          tx,
        ),
      );
    }

    return { creditsEur, creditsUsd, eurCents, usdCents, entries };
  });
}
