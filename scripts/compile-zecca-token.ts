import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const artifactDir = join(process.cwd(), "contracts", "out");
mkdirSync(artifactDir, { recursive: true });
execSync("npm install --no-save solc@0.8.24", { stdio: "inherit" });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const solc = require("solc") as { compile: (input: string) => string };
const source = readFileSync(join(process.cwd(), "contracts", "ZeccaToken.sol"), "utf8");
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "ZeccaToken.sol": { content: source } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "berlin",
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
) as {
  errors?: { severity: string; formattedMessage: string }[];
  contracts?: Record<string, Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>>;
};
const fatal = (output.errors ?? []).filter((row) => row.severity === "error");
if (fatal.length) throw new Error(fatal.map((row) => row.formattedMessage).join("\n"));
const compiled = output.contracts?.["ZeccaToken.sol"]?.ZeccaToken;
if (!compiled?.evm?.bytecode?.object) throw new Error("Compile ZeccaToken senza bytecode.");
const artifact = {
  abi: compiled.abi,
  bytecode: `0x${compiled.evm.bytecode.object}`,
};
const dest = join(artifactDir, "ZeccaToken.json");
writeFileSync(dest, JSON.stringify(artifact, null, 2));
console.log("wrote", dest);
