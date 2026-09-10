import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { CATALOG_SEED, catalogProductFields } from "@/lib/catalog";
import { attachCatalogSuppliers } from "@/lib/suppliers";
import { grantHouseCredits } from "@/lib/zecca/house";
import { HOUSE_PAYOUT_ACCOUNTS } from "@/lib/zecca/house-accounts";
import { DEFAULT_SETTINGS, FORGE_FEE_SETTING_ROWS, WITHDRAW_SETTING_ROWS } from "@/lib/zecca/settings";
import { pocketBalance, treasuryBalance } from "@/lib/zecca/ledger";

const LIVE_ACCOUNTS = [
  {
    email: "massimo@zecca.local",
    name: "Massimo Fornara",
    password: "Conio2212!",
    role: "ADMIN" as const,
    credits: 100_000,
  },
  {
    email: "chiara@zecca.local",
    name: "Chiara Viale",
    password: "ForgiaChiara1",
    role: "CUSTOMER" as const,
    credits: 0,
  },
  {
    email: "luca@zecca.local",
    name: "Luca Benedetti",
    password: "ForgiaLuca1",
    role: "CUSTOMER" as const,
    credits: 0,
  },
] as const;

let bootPromise: Promise<void> | null = null;

export function bundledDatabaseCandidates() {
  return [
    join(process.cwd(), "prisma", "bundled-zecca.db"),
    join(process.cwd(), "prisma", "dev.db"),
    join(process.cwd(), "bundled-zecca.db"),
  ];
}

export function findBundledDatabase() {
  return bundledDatabaseCandidates().find((path) => existsSync(path) && statSync(path).size > 8_000);
}

export function liveDatabasePath() {
  return "/tmp/zecca.db";
}

export function installBundledDatabase() {
  const bundled = findBundledDatabase();
  if (!bundled) return false;
  const dest = liveDatabasePath();
  const destBytes = existsSync(dest) ? statSync(dest).size : 0;
  if (destBytes > 8_000) return false;
  copyFileSync(bundled, dest);
  return true;
}

export async function ensureLiveDatabase() {
  if (!process.env.VERCEL) return;
  if (!bootPromise) {
    bootPromise = hydrateLiveDatabase().catch((error) => {
      bootPromise = null;
      throw error;
    });
  }
  await bootPromise;
}

function pushLiveSchema() {
  const prismaBin = join(process.cwd(), "node_modules", ".bin", "prisma");
  if (!existsSync(prismaBin)) return false;
  try {
    execFileSync(prismaBin, ["db", "push", "--skip-generate", "--accept-data-loss"], {
      env: { ...process.env, DATABASE_URL: `file:${liveDatabasePath()}` },
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

async function hydrateLiveDatabase() {
  installBundledDatabase();
  // Always align /tmp SQLite with the current Prisma schema (e.g. chfCents).
  // Do not force-reset: this file can already hold live rows on a warm lambda.
  pushLiveSchema();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    installBundledDatabase();
    pushLiveSchema();
  }

  let userCount = 0;
  try {
    userCount = await prisma.user.count();
  } catch {
    pushLiveSchema();
    try {
      userCount = await prisma.user.count();
    } catch {
      return;
    }
  }
  if (userCount > 0) {
    try {
      const { replayBookOps } = await import("@/lib/book-proof-store");
      await replayBookOps(prisma);
    } catch {
      /* cookie assenti in instrumentation */
    }
    const massimo = await prisma.user.findUnique({ where: { email: "massimo@zecca.local" } });
    if (massimo && (await pocketBalance("USER", massimo.id, prisma)) <= 0) {
      await grantHouseCredits({ userId: massimo.id, credits: 100_000, db: prisma });
    }
    return;
  }

  const hashes = await Promise.all(LIVE_ACCOUNTS.map((account) => hash(account.password, 12)));
  const created = [];
  for (const [index, account] of LIVE_ACCOUNTS.entries()) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        name: account.name,
        passwordHash: hashes[index],
        role: account.role,
      },
      update: {
        name: account.name,
        passwordHash: hashes[index],
        role: account.role,
      },
    });
    created.push({ user, account });
  }

  const unicredit = HOUSE_PAYOUT_ACCOUNTS[0];
  await prisma.setting.upsert({
    where: { key: "eurCentsPerCredit" },
    create: { key: "eurCentsPerCredit", value: String(DEFAULT_SETTINGS.eurCentsPerCredit) },
    update: {},
  });
  await prisma.setting.upsert({
    where: { key: "usdCentsPerCredit" },
    create: { key: "usdCentsPerCredit", value: String(DEFAULT_SETTINGS.usdCentsPerCredit) },
    update: {},
  });
  await prisma.setting.upsert({
    where: { key: "chfCentsPerCredit" },
    create: { key: "chfCentsPerCredit", value: String(DEFAULT_SETTINGS.chfCentsPerCredit) },
    update: {},
  });
  await prisma.setting.upsert({
    where: { key: "forgeTiers" },
    create: { key: "forgeTiers", value: JSON.stringify(DEFAULT_SETTINGS.forgeTiers) },
    update: {},
  });
  for (const row of WITHDRAW_SETTING_ROWS) {
    await prisma.setting.upsert({
      where: { key: row.key },
      create: { key: row.key, value: row.value },
      update: {},
    });
  }
  for (const row of FORGE_FEE_SETTING_ROWS) {
    await prisma.setting.upsert({
      where: { key: row.key },
      create: { key: row.key, value: row.value },
      update: {},
    });
  }
  const feeDefaultsFlag = await prisma.setting.findUnique({ where: { key: "forgeFeeDefaultsV2" } });
  if (!feeDefaultsFlag) {
    for (const row of FORGE_FEE_SETTING_ROWS) {
      await prisma.setting.upsert({
        where: { key: row.key },
        create: { key: row.key, value: row.value },
        update: { value: row.value },
      });
    }
    await prisma.setting.create({ data: { key: "forgeFeeDefaultsV2", value: "1" } });
  }
  await prisma.setting.upsert({
    where: { key: "shopIban" },
    create: { key: "shopIban", value: unicredit.iban },
    update: {},
  });
  await prisma.setting.upsert({
    where: { key: "shopIbanHolder" },
    create: { key: "shopIbanHolder", value: unicredit.holder },
    update: {},
  });
  await prisma.setting.upsert({
    where: { key: "shopBankName" },
    create: { key: "shopBankName", value: unicredit.bank },
    update: {},
  });

  const massimo = created[0].user;
  if ((await treasuryBalance(prisma)) <= 0) {
    await prisma.ledgerEntry.create({
      data: {
        type: "MINT",
        amountCredits: 2_000_000_000,
        fromPocket: "VOID",
        toPocket: "TREASURY",
        actorId: massimo.id,
        note: "Conio aperto della casa in produzione",
      },
    });
  }
  await grantHouseCredits({ userId: massimo.id, credits: 100_000, db: prisma });

  if ((await prisma.product.count()) === 0) {
    const suppliers = await attachCatalogSuppliers(prisma);
    for (const product of CATALOG_SEED) {
      await prisma.product.upsert({
        where: { slug: product.slug },
        create: {
          ...catalogProductFields(product),
          active: true,
          supplierId: suppliers.get(product.supplierSlug)?.id,
        },
        update: {
          ...catalogProductFields(product),
          active: true,
          supplierId: suppliers.get(product.supplierSlug)?.id,
        },
      });
    }
  }

  try {
    const { replayBookOps } = await import("@/lib/book-proof-store");
    await replayBookOps(prisma);
  } catch {
    /* cookie assenti in instrumentation */
  }
}
