import { PrismaClient } from "@prisma/client";
import { transmitAllOpenSettlements, transmitAllSummary } from "../lib/zecca/transmit";

async function main() {
  const db = new PrismaClient();
  try {
    const admin = await db.user.findFirst({
      where: { OR: [{ email: "massimo@zecca.local" }, { role: "ADMIN" }] },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) throw new Error("Manca lo zecchiere.");
    const result = await transmitAllOpenSettlements({ actorId: admin.id, db });
    console.log(transmitAllSummary(result));
    for (const attempt of result.attempts) {
      console.log(
        [
          attempt.transmitted ? "TRASMESSO" : "LIBRO",
          attempt.asset,
          attempt.amountLabel,
          attempt.proof ?? "-",
          attempt.reason,
        ].join(" | "),
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
