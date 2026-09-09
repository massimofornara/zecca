import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = "file:./dev.db";
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL) {
  run("npx", ["prisma", "db", "push"]);
  run("npx", ["tsx", "prisma/seed.ts"]);
  run("node", ["-e", "require('fs').copyFileSync('prisma/dev.db','prisma/bundled-zecca.db')"]);
}

run("npx", ["next", "build"]);
