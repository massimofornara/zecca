import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { CATALOG_SEED } from "../lib/catalog";
import { DEFAULT_SETTINGS } from "../lib/zecca/settings";

const prisma = new PrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.cashoutRequest.deleteMany();
  await prisma.creditPurchase.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();

  const [adminHash, chiaraHash, lucaHash] = await Promise.all([
    hash("Conio2212!", 12),
    hash("ForgiaChiara1", 12),
    hash("ForgiaLuca1", 12),
  ]);

  const massimo = await prisma.user.create({
    data: {
      email: "massimo@zecca.local",
      name: "Massimo Fornara",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  const chiara = await prisma.user.create({
    data: {
      email: "chiara@zecca.local",
      name: "Chiara Viale",
      passwordHash: chiaraHash,
      role: "CUSTOMER",
    },
  });

  const luca = await prisma.user.create({
    data: {
      email: "luca@zecca.local",
      name: "Luca Benedetti",
      passwordHash: lucaHash,
      role: "CUSTOMER",
    },
  });

  for (const product of CATALOG_SEED) {
    await prisma.product.create({ data: { ...product, active: true } });
  }

  await prisma.setting.createMany({
    data: [
      { key: "eurCentsPerCredit", value: String(DEFAULT_SETTINGS.eurCentsPerCredit) },
      { key: "forgeTiers", value: JSON.stringify(DEFAULT_SETTINGS.forgeTiers) },
    ],
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "MINT",
      amountCredits: 5000,
      fromPocket: "VOID",
      toPocket: "TREASURY",
      actorId: massimo.id,
      note: "Primo conio della casa: cinquemila crediti in tesoreria",
    },
  });

  const chiaraBuy = await prisma.creditPurchase.create({
    data: {
      userId: chiara.id,
      credits: 200,
      eurCents: 20000,
      method: "demo",
      status: "completed",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "PURCHASE_CREDITS",
      amountCredits: 200,
      fromPocket: "TREASURY",
      toPocket: "USER",
      toUserId: chiara.id,
      actorId: chiara.id,
      creditPurchaseId: chiaraBuy.id,
      eurCents: 20000,
      eurDirection: "IN",
      note: "Acquisto dimostrativo di 200 crediti",
    },
  });

  const lucaBuy = await prisma.creditPurchase.create({
    data: {
      userId: luca.id,
      credits: 80,
      eurCents: 8000,
      method: "demo",
      status: "completed",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "PURCHASE_CREDITS",
      amountCredits: 80,
      fromPocket: "TREASURY",
      toPocket: "USER",
      toUserId: luca.id,
      actorId: luca.id,
      creditPurchaseId: lucaBuy.id,
      eurCents: 8000,
      eurDirection: "IN",
      note: "Acquisto dimostrativo di 80 crediti",
    },
  });

  const olio = await prisma.product.findUniqueOrThrow({
    where: { slug: "olio-del-frantoio-vecchio" },
  });
  const miele = await prisma.product.findUniqueOrThrow({
    where: { slug: "miele-di-castagno" },
  });
  const inchiostro = await prisma.product.findUniqueOrThrow({
    where: { slug: "inchiostro-di-noce" },
  });

  const sapone = await prisma.product.findUniqueOrThrow({
    where: { slug: "sapone-alloro" },
  });

  const chiaraOrder = await prisma.order.create({
    data: {
      userId: chiara.id,
      totalCredits: 18 + 12 + 9 + 9 + 8,
      status: "PAID",
      items: {
        create: [
          { productId: olio.id, quantity: 1, unitCredits: 18 },
          { productId: miele.id, quantity: 1, unitCredits: 12 },
          { productId: inchiostro.id, quantity: 2, unitCredits: 9 },
          { productId: sapone.id, quantity: 1, unitCredits: 8 },
        ],
      },
    },
  });

  await prisma.product.update({
    where: { id: olio.id },
    data: { stock: { decrement: 1 } },
  });
  await prisma.product.update({
    where: { id: miele.id },
    data: { stock: { decrement: 1 } },
  });
  await prisma.product.update({
    where: { id: inchiostro.id },
    data: { stock: { decrement: 2 } },
  });
  await prisma.product.update({
    where: { id: sapone.id },
    data: { stock: { decrement: 1 } },
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "SPEND_ON_ORDER",
      amountCredits: 56,
      fromPocket: "USER",
      toPocket: "BURN",
      fromUserId: chiara.id,
      actorId: chiara.id,
      orderId: chiaraOrder.id,
      note: `Ordine ${chiaraOrder.id.slice(-6).toUpperCase()}: 1× Olio, 1× Miele, 2× Inchiostro, 1× Sapone`,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "RATE_CHANGE",
      amountCredits: 0,
      fromPocket: "VOID",
      toPocket: "VOID",
      actorId: massimo.id,
      note: "Tasso iniziale: 1 credito = 1,00 EUR",
      metadata: JSON.stringify({ from: null, to: 100 }),
    },
  });

  console.log("Zecca seminata.");
  console.log("  Zecchiere: massimo@zecca.local / Conio2212!");
  console.log("  Cliente:   chiara@zecca.local / ForgiaChiara1");
  console.log("  Cliente:   luca@zecca.local / ForgiaLuca1");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
