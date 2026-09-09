import { PrismaClient } from "@prisma/client";

type PragmaColumn = { name: string };

async function main() {
  const prisma = new PrismaClient();
  try {
    const columns = await prisma.$queryRaw<PragmaColumn[]>`PRAGMA table_info("LedgerEntry")`;
    const names = columns.map((column) => column.name);
    if (!names.includes("chfCents")) {
      throw new Error(
        `LedgerEntry.chfCents assente dopo db push. Colonne: ${names.join(", ") || "(nessuna)"}`,
      );
    }
    const cashout = await prisma.$queryRaw<PragmaColumn[]>`PRAGMA table_info("CashoutRequest")`;
    const cashoutNames = cashout.map((column) => column.name);
    if (!cashoutNames.includes("chfCents")) {
      throw new Error(
        `CashoutRequest.chfCents assente dopo db push. Colonne: ${cashoutNames.join(", ")}`,
      );
    }
    console.log("Schema SQLite ok: LedgerEntry.chfCents e CashoutRequest.chfCents presenti.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
