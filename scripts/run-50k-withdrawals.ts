import { PrismaClient } from "@prisma/client";
import { executeGenerationPayouts } from "../lib/zecca/cashout";
import { fundsAuthorized, fundsDelivered, settlementPhase } from "../lib/zecca/settlement";
import { saveSettings } from "../lib/zecca/settings";
import { HOUSE_PAYOUT_ACCOUNTS } from "../lib/zecca/house-accounts";

const CREDITS_50K_EUR = 50_000;
const METAMASK = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const BTC = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

async function main() {
  const db = new PrismaClient();
  try {
    const admin = await db.user.findFirst({
      where: { OR: [{ email: "massimo@zecca.local" }, { role: "ADMIN" }] },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) throw new Error("Manca lo zecchiere. Avvia il seed.");

    await saveSettings(
      {
        withdrawMaxCountPerHour: 200,
        withdrawMaxUsdCentsPerTx: 200_000_000,
        withdrawMaxUsdCentsPerDay: 500_000_000,
      },
      admin.id,
      db,
    );

    const result = await executeGenerationPayouts({
      actorId: admin.id,
      role: admin.role,
      creditsFiat: CREDITS_50K_EUR,
      creditsCrypto: CREDITS_50K_EUR,
      creditsIban: CREDITS_50K_EUR,
      btcAddress: BTC,
      evmAddress: METAMASK,
      db,
    });

    const lines = [...result.bundle.cashouts, ...result.ibans];
    let authorized = 0;
    let executed = 0;
    for (const row of lines) {
      const phase = settlementPhase(row);
      const ok = fundsAuthorized(row) || fundsDelivered(row);
      if (fundsDelivered(row)) executed += 1;
      else if (ok) authorized += 1;
      console.log(
        JSON.stringify({
          rail: row.payoutKind,
          asset: row.walletNetwork ?? row.currency,
          dest: row.walletAddress ?? row.iban,
          credits: row.credits,
          status: row.status,
          kind: row.receiptKind,
          phase,
          authorized: ok,
          executed: fundsDelivered(row),
          ref: row.receiptRef,
        }),
      );
    }

    const total = lines.length;
    const success = authorized + executed;
    console.log(
      JSON.stringify({
        houseIban: HOUSE_PAYOUT_ACCOUNTS.map((a) => ({ id: a.id, iban: a.iban })),
        metamask: METAMASK,
        total,
        authorized,
        executed,
        successRate: total ? `${Math.round((success / total) * 100)}%` : "0%",
        note:
          "Successo CISO = AUTHORIZED_PENDING_GATEWAY / READY_FOR_SIGNATURE / EXECUTED. EXECUTED solo con tx_hash o TRN reali.",
      }),
    );
    if (success !== total) process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
