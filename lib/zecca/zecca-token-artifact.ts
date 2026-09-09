import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hex } from "viem";

export type ZeccaTokenArtifact = {
  abi: unknown;
  bytecode: Hex;
};

export function zeccaTokenArtifact(): ZeccaTokenArtifact {
  const cached = join(process.cwd(), "contracts", "out", "ZeccaToken.json");
  if (!existsSync(cached)) {
    throw new Error("Manca contracts/out/ZeccaToken.json. Esegui: npx tsx scripts/compile-zecca-token.ts");
  }
  return JSON.parse(readFileSync(cached, "utf8")) as ZeccaTokenArtifact;
}
