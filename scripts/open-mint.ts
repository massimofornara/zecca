import { loadEnvConfig } from "@next/env";
import { prisma } from "../lib/db";
import { mintCredits } from "../lib/zecca/mint";
import { treasuryBalance } from "../lib/zecca/ledger";

loadEnvConfig(process.cwd());

const TARGET = 2_000_000_000;

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.error("Nessuno zecchiere nel libro. Lancia prima npm run db:seed.");
    process.exit(1);
  }
  const have = await treasuryBalance();
  if (have >= TARGET) {
    console.log(`Tesoreria già aperta: ${have.toLocaleString("it-IT")} cr.`);
    return;
  }
  const gap = TARGET - have;
  await mintCredits({
    amount: gap,
    note: "Conio aperto: tesoreria portata a due miliardi",
    actorId: admin.id,
  });
  const now = await treasuryBalance();
  console.log(`Coniati ${gap.toLocaleString("it-IT")} cr. Tesoreria: ${now.toLocaleString("it-IT")} cr.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
