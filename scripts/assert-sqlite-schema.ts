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
    const gateway = await prisma.$queryRaw<PragmaColumn[]>`PRAGMA table_info("GatewayTransmission")`;
    const gatewayNames = gateway.map((column) => column.name);
    if (!gatewayNames.includes("signature") || !gatewayNames.includes("receiptHash")) {
      throw new Error(
        `GatewayTransmission incompleta dopo db push. Colonne: ${gatewayNames.join(", ") || "(nessuna)"}`,
      );
    }
    console.log(
      "Schema SQLite ok: LedgerEntry.chfCents, CashoutRequest.chfCents e GatewayTransmission presenti.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
