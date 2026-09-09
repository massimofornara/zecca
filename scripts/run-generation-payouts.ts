import { PrismaClient } from "@prisma/client";
import { executeGenerationPayouts } from "../lib/zecca/cashout";
import { shopFiatBalances } from "../lib/zecca/convert";
import { saveSettings } from "../lib/zecca/settings";

async function main() {
  const db = new PrismaClient();
  try {
    const admin = await db.user.findFirst({
      where: { OR: [{ email: "massimo@zecca.local" }, { role: "ADMIN" }] },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) {
      throw new Error("Manca l’utente zecchiere. Avvia il seed.");
    }
    await saveSettings({ withdrawMaxCountPerHour: 100 }, admin.id, db);
    const result = await executeGenerationPayouts({
      actorId: admin.id,
      role: admin.role,
      creditsFiat: 50,
      creditsCrypto: 10,
      creditsIban: 50,
      btcAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      evmAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      db,
    });
    const fiat = await shopFiatBalances(db);
    console.log("fiat cassa", fiat);
    console.log(
      "crypto",
      result.bundle.cashouts.map((row) => ({
        net: row.walletNetwork,
        status: row.status,
        ref: row.receiptRef,
        kind: row.receiptKind,
      })),
    );
    console.log(
      "iban",
      result.ibans.map((row) => ({
        currency: row.currency,
        status: row.status,
        ref: row.receiptRef,
        iban: row.iban,
      })),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
