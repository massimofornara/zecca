import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqliteFile = join(repoRoot, "prisma", "dev.db");

function isPostgres(url) {
  return /^(prisma\+)?postgres(ql)?:\/\//i.test(url ?? "");
}

const configured = process.env.DATABASE_URL?.trim() ?? "";
if (!isPostgres(configured)) {
  // Absolute file URL so Prisma CLI and Prisma Client open the same SQLite file
  // (schema-relative `file:./dev.db` vs cwd-relative otherwise diverge on Vercel).
  process.env.DATABASE_URL = `file:${sqliteFile}`;
}

function removeSqlite(path) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) unlinkSync(candidate);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL) {
  if (!isPostgres(process.env.DATABASE_URL)) {
    removeSqlite(sqliteFile);
    removeSqlite(join(repoRoot, "dev.db"));
    // Delete then push: a missing file gets the current schema (incl. chfCents).
    // Avoid --force-reset so Prisma's production-guard cannot abort the Vercel build.
    run("npx", ["prisma", "db", "push", "--accept-data-loss", "--skip-generate"]);
    run("npx", ["tsx", "prisma/seed.ts"]);
    copyFileSync(sqliteFile, join(repoRoot, "prisma", "bundled-zecca.db"));
  } else {
    run("npx", ["prisma", "db", "push", "--accept-data-loss", "--skip-generate"]);
    run("npx", ["tsx", "prisma/seed.ts"]);
  }
}

run("npx", ["next", "build"]);
