import { copyFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

function bundledDatabaseCandidates() {
  return [
    join(process.cwd(), "prisma", "bundled-zecca.db"),
    join(process.cwd(), "prisma", "dev.db"),
  ];
}

function installBundledDatabase() {
  const bundled = bundledDatabaseCandidates().find(
    (path) => existsSync(path) && statSync(path).size > 8_000,
  );
  if (!bundled) return;
  const dest = "/tmp/zecca.db";
  const destBytes = existsSync(dest) ? statSync(dest).size : 0;
  if (destBytes > 8_000) return;
  copyFileSync(bundled, dest);
}

function resolveDatabaseUrl() {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured && !process.env.VERCEL) {
    return configured;
  }
  if (configured?.startsWith("postgres")) {
    return configured;
  }
  if (process.env.VERCEL) {
    installBundledDatabase();
    return "file:/tmp/zecca.db";
  }
  return configured || "file:./dev.db";
}

process.env.DATABASE_URL = resolveDatabaseUrl();

const schemaSig = Prisma.dmmf.datamodel.models
  .map((model) => `${model.name}:${model.fields.map((field) => field.name).join(",")}`)
  .join("|");

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaSig?: string;
};

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

if (globalForPrisma.prisma && globalForPrisma.prismaSchemaSig !== schemaSig) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaSig = schemaSig;
}
