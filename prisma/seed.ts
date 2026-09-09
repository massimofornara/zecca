import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { CATALOG_SEED, catalogProductFields } from "../lib/catalog";
import { HOUSE_PAYOUT_ACCOUNTS } from "../lib/zecca/house-accounts";
import { grantHouseCredits } from "../lib/zecca/house";
import { DEFAULT_SETTINGS, WITHDRAW_SETTING_ROWS } from "../lib/zecca/settings";
import { attachCatalogSuppliers } from "../lib/suppliers";

const prisma = new PrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.cashoutRequest.deleteMany();
  await prisma.creditPurchase.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
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

  const suppliers = await attachCatalogSuppliers(prisma);
  for (const product of CATALOG_SEED) {
    await prisma.product.create({
      data: {
        ...catalogProductFields(product),
        active: true,
        supplierId: suppliers.get(product.supplierSlug)?.id,
      },
    });
  }

  const unicredit = HOUSE_PAYOUT_ACCOUNTS[0];
  await prisma.setting.createMany({
    data: [
      { key: "eurCentsPerCredit", value: String(DEFAULT_SETTINGS.eurCentsPerCredit) },
      { key: "usdCentsPerCredit", value: String(DEFAULT_SETTINGS.usdCentsPerCredit) },
      { key: "chfCentsPerCredit", value: String(DEFAULT_SETTINGS.chfCentsPerCredit) },
      { key: "forgeTiers", value: JSON.stringify(DEFAULT_SETTINGS.forgeTiers) },
      ...WITHDRAW_SETTING_ROWS,
      { key: "shopIban", value: unicredit.iban },
      { key: "shopIbanHolder", value: unicredit.holder },
      { key: "shopBankName", value: unicredit.bank },
    ],
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "MINT",
      amountCredits: 2_000_000_000,
      eurCents: 0,
      usdCents: 0,
      chfCents: 0,
      fromPocket: "VOID",
      toPocket: "TREASURY",
      actorId: massimo.id,
      note: "Conio aperto della casa: due miliardi di crediti in tesoreria",
    },
  });

  await grantHouseCredits({ userId: massimo.id, credits: 100_000, db: prisma });

  const chiaraBuy = await prisma.creditPurchase.create({
    data: {
      userId: chiara.id,
      credits: 400,
      eurCents: 40000,
      method: "demo",
      status: "completed",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "PURCHASE_CREDITS",
      amountCredits: 400,
      fromPocket: "TREASURY",
      toPocket: "USER",
      toUserId: chiara.id,
      actorId: chiara.id,
      creditPurchaseId: chiaraBuy.id,
      eurCents: 20000,
      usdCents: 0,
      chfCents: 0,
      eurDirection: "IN",
      note: "Acquisto dimostrativo di 400 crediti",
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
      usdCents: 0,
      chfCents: 0,
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
      totalCredits: 86 + 48 + 36 + 36 + 28 + 18,
      status: "PAID",
      shipTo: "CUSTOMER",
      shipName: "Chiara Viale",
      shipStreet: "Via delle Rose 8",
      shipCity: "Genova",
      shipPostal: "16121",
      shipPhone: "+390101234567",
      carrier: "DHL_EXPRESS",
      service: "EXPRESS_24H",
      shippingCredits: 18,
      shipStatus: "TO_PACK",
      trackingNumber: "JD14ZECCA0001",
      trackingUrl: "https://www.dhl.com/it-it/home/tracking.html?tracking-id=JD14ZECCA0001",
      dhlMessage: "I fornitori preparano i colli. Massimo non imballa.",
      dhlTrackStatus: "In preparazione dal fornitore",
      dhlTrackDetail: "Chi produce imballa. DHL ritira dalla sede del fornitore.",
      dhlTrackedAt: new Date(),
      items: {
        create: [
          { productId: olio.id, quantity: 1, unitCredits: 86 },
          { productId: miele.id, quantity: 1, unitCredits: 48 },
          { productId: inchiostro.id, quantity: 2, unitCredits: 36 },
          { productId: sapone.id, quantity: 1, unitCredits: 28 },
        ],
      },
    },
    include: { items: { include: { product: { include: { supplier: true } } } } },
  });

  let firstTracking = true;
  const bySupplier = new Map<string, typeof chiaraOrder.items>();
  for (const item of chiaraOrder.items) {
    if (!item.product.supplierId || !item.product.supplier) continue;
    const list = bySupplier.get(item.product.supplierId) ?? [];
    list.push(item);
    bySupplier.set(item.product.supplierId, list);
  }
  for (const [supplierId, items] of bySupplier) {
    const supplier = items[0].product.supplier!;
    const tracking = firstTracking ? "JD14ZECCA0001" : `JD14${supplier.slug.slice(0, 6).toUpperCase()}01`;
    firstTracking = false;
    await prisma.shipment.create({
      data: {
        orderId: chiaraOrder.id,
        supplierId,
        supplierName: supplier.name,
        supplierStreet: supplier.street,
        supplierCity: supplier.city,
        supplierPostal: supplier.postal,
        supplierPhone: supplier.phone,
        supplierEmail: supplier.email,
        trackingNumber: tracking,
        trackingUrl: `https://www.dhl.com/it-it/home/tracking.html?tracking-id=${tracking}`,
        dhlMessage: `Collo di ${supplier.name}. Massimo non imballa.`,
        dhlTrackStatus: "In preparazione dal fornitore",
        dhlTrackDetail: `${supplier.name} imballa a ${supplier.city}.`,
        dhlTrackedAt: new Date(),
        shipStatus: "AWAITING_SUPPLIER",
        items: { connect: items.map((item) => ({ id: item.id })) },
      },
    });
  }

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
      amountCredits: 252,
      fromPocket: "USER",
      toPocket: "BURN",
      fromUserId: chiara.id,
      actorId: chiara.id,
      orderId: chiaraOrder.id,
      eurCents: 0,
      usdCents: 0,
      chfCents: 0,
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
      eurCents: 0,
      usdCents: 0,
      chfCents: 0,
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
