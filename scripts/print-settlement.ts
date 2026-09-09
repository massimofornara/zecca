import { PrismaClient } from "@prisma/client";
import { classifyCashout } from "../lib/zecca/settlement";
import { shopFiatBalances } from "../lib/zecca/convert";

const db = new PrismaClient();

async function main() {
  const shop = await shopFiatBalances(db);
  const rows = await db.cashoutRequest.findMany({
    where: { status: { in: ["QUEUED", "PAID", "PENDING"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  console.log("CASSA", shop);
  for (const row of rows) {
    const line = classifyCashout(row);
    console.log(
      [line.phase, line.asset, line.amountLabel, line.status, line.bookRef ?? "-", line.bankOrChainRef ?? "-", line.destination].join(" | "),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
