import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqliteFile = join(repoRoot, "prisma", "dev.db");
const bundledFile = join(repoRoot, "prisma", "bundled-zecca.db");

function isPostgres(url) {
  return /^(prisma\+)?postgres(ql)?:\/\//i.test(url ?? "");
}

const configured = process.env.DATABASE_URL?.trim() ?? "";
if (!isPostgres(configured)) {
  // file:// URL so Prisma CLI and Prisma Client open the same absolute SQLite file.
  process.env.DATABASE_URL = pathToFileURL(sqliteFile).href;
}

function removeIfExists(path) {
  if (existsSync(path)) unlinkSync(path);
}

function removeSqliteSidecars(path) {
  removeIfExists(path);
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    removeIfExists(`${path}${suffix}`);
  }
}

/** Drop leftover SQLite files from git checkout or Vercel build cache. */
function cleanSqliteArtifacts() {
  removeSqliteSidecars(sqliteFile);
  removeSqliteSidecars(join(repoRoot, "dev.db"));
  removeSqliteSidecars(join(repoRoot, "prisma", "test.db"));
  const prismaDir = join(repoRoot, "prisma");
  if (!existsSync(prismaDir)) return;
  for (const name of readdirSync(prismaDir)) {
    if (name === "bundled-zecca.db" || name === "bundled-zecca.db-journal") {
      removeIfExists(join(prismaDir, name));
      continue;
    }
    if (/\.db(-journal|-wal|-shm)?$/.test(name)) {
      removeIfExists(join(prismaDir, name));
    }
  }
}

function run(command, args, { allowFail = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  const status = result.status ?? 1;
  if (status !== 0 && !allowFail) {
    process.exit(status);
  }
  return status;
}

function pushSqliteSchema() {
  const resetStatus = run(
    "npx",
    ["prisma", "db", "push", "--force-reset", "--accept-data-loss"],
    { allowFail: true },
  );
  if (resetStatus === 0) return;
  // Empty file after cleanSqliteArtifacts: push still creates the current DDL
  // (incl. LedgerEntry.chfCents) if a host blocks --force-reset.
  console.warn(
    "prisma db push --force-reset non disponibile; ricreo lo schema su file vuoto.",
  );
  run("npx", ["prisma", "db", "push", "--accept-data-loss"]);
}

function bootstrapSqlite() {
  console.log("SQLite build DB:", process.env.DATABASE_URL);
  cleanSqliteArtifacts();
  pushSqliteSchema();
  run("npx", ["prisma", "generate"]);
  run("npx", ["tsx", "scripts/assert-sqlite-schema.ts"]);
  run("npx", ["tsx", "prisma/seed.ts"]);
  copyFileSync(sqliteFile, bundledFile);
}

if (!isPostgres(process.env.DATABASE_URL)) {
  bootstrapSqlite();
} else {
  run("npx", ["prisma", "generate"]);
  run("npx", ["prisma", "db", "push", "--accept-data-loss"]);
}

run("npx", ["next", "build"]);
