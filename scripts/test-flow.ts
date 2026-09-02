import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { mintCredits } from "../lib/zecca/mint";
import { purchaseCredits } from "../lib/zecca/credits";
import { placeOrder } from "../lib/zecca/shop";
import { getForgeState } from "../lib/zecca/forge";
import { requestCustomerCashout, resolveCashout } from "../lib/zecca/cashout";
import { pocketBalance, treasuryBalance } from "../lib/zecca/ledger";
import { DEFAULT_SETTINGS } from "../lib/zecca/settings";

const dbPath = path.join(process.cwd(), "prisma", "test.db");
const dbUrl = "file:./test.db";

async function main() {
  if (existsSync(dbPath)) unlinkSync(dbPath);
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    const admin = await db.user.create({
      data: {
        email: "admin@test.local",
        name: "Massimo Test",
        passwordHash: await hash("passwordpassword", 10),
        role: "ADMIN",
      },
    });
    const customer = await db.user.create({
      data: {
        email: "cliente@test.local",
        name: "Chiara Test",
        passwordHash: await hash("passwordpassword", 10),
        role: "CUSTOMER",
      },
    });

    await db.setting.createMany({
      data: [
        { key: "eurCentsPerCredit", value: String(DEFAULT_SETTINGS.eurCentsPerCredit) },
        { key: "forgeTiers", value: JSON.stringify(DEFAULT_SETTINGS.forgeTiers) },
      ],
    });

    const product = await db.product.create({
      data: {
        slug: "sapone-test",
        name: "Sapone test",
        description: "Pezzo di prova",
        imageKey: "sapone",
        priceCredits: 50,
        stock: 10,
        active: true,
      },
    });

    await mintCredits({ amount: 1000, note: "Lotto di prova", actorId: admin.id, db });
    assert.equal(await treasuryBalance(db), 1000);

    await purchaseCredits({ userId: customer.id, credits: 200, method: "demo", db });
    assert.equal(await treasuryBalance(db), 800);
    assert.equal(await pocketBalance("USER", customer.id, db), 200);

    let short = false;
    try {
      await purchaseCredits({ userId: customer.id, credits: 9000, method: "demo", db });
    } catch (error) {
      short = error instanceof Error && error.message.includes("tesoreria è a corto");
    }
    assert.equal(short, true, "tesoreria short deve fallire in italiano");

    await placeOrder({
      userId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      db,
    });
    assert.equal(await pocketBalance("USER", customer.id, db), 150);
    const stock = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(stock.stock, 9);

    const forge = await getForgeState({ userId: customer.id, role: "CUSTOMER", db });
    assert.equal(forge.spentToday, 50);
    assert.equal(forge.percent, 20);
    assert.equal(forge.forged, 30);

    const cashout = await requestCustomerCashout({
      userId: customer.id,
      role: "CUSTOMER",
      credits: 30,
      db,
    });
    assert.equal(await pocketBalance("USER", customer.id, db), 120);
    assert.equal(await pocketBalance("ESCROW", customer.id, db), 30);

    const pending = await db.cashoutRequest.findMany({ where: { status: "PENDING" } });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, cashout.id);

    await resolveCashout({ cashoutId: cashout.id, actorId: admin.id, action: "pay", db });
    assert.equal(await pocketBalance("ESCROW", customer.id, db), 0);
    const paid = await db.cashoutRequest.findUniqueOrThrow({ where: { id: cashout.id } });
    assert.equal(paid.status, "PAID");

    const types = await db.ledgerEntry.groupBy({ by: ["type"], _count: true });
    const typeSet = new Set(types.map((t) => t.type));
    for (const needed of ["MINT", "PURCHASE_CREDITS", "SPEND_ON_ORDER", "CASHOUT_REQUEST", "CASHOUT_PAID"]) {
      assert.equal(typeSet.has(needed as never), true, `manca ${needed} nel libro`);
    }

    console.log("Flusso Zecca: conio → crediti → bottega → forgia → fusione. OK.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
