/**
 * Compila ZeccaToken, fa il create on-chain se c’è gas, assegna MINTER_ROLE
 * al signer sealed/KMS, mint verso MetaMask. Non inventa tx_hash.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  parseAbi,
  type Hex,
  type Chain,
} from "viem";
import { sepolia, mainnet, baseSepolia } from "viem/chains";
import { kmsSignerAccount, kmsSignerAddress, kmsSignerHealth } from "../lib/zecca/kms-signer";

const METAMASK = (process.env.ZECCA_MINT_TO?.trim() ||
  "0x742d35Cc6634C0532925a3b844Bc454e4438f44e") as `0x${string}`;
const MINT_UNITS = BigInt(process.env.ZECCA_MINT_UNITS ?? "50000000000"); // 50_000 * 1e6

const MINT_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function balanceOf(address) view returns (uint256)",
]);

function compile(): { bytecode: Hex; abi: unknown } {
  const artifactDir = join(process.cwd(), "contracts", "out");
  mkdirSync(artifactDir, { recursive: true });
  const cached = join(artifactDir, "ZeccaToken.json");
  execSync("npm install --no-save solc@0.8.24", { stdio: "inherit" });
  const solc = require("solc") as {
    compile: (input: string) => string;
  };
  const source = readFileSync(join(process.cwd(), "contracts", "ZeccaToken.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "ZeccaToken.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: { severity: string; formattedMessage: string }[];
    contracts?: Record<string, Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>>;
  };
  const fatal = (output.errors ?? []).filter((row) => row.severity === "error");
  if (fatal.length) {
    throw new Error(fatal.map((row) => row.formattedMessage).join("\n"));
  }
  const compiled = output.contracts?.["ZeccaToken.sol"]?.ZeccaToken;
  if (!compiled?.evm?.bytecode?.object) throw new Error("Compile senza bytecode.");
  const artifact = {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}` as Hex,
  };
  writeFileSync(cached, JSON.stringify(artifact, null, 2));
  return artifact;
}

function pickChain(): { chain: Chain; url: string } {
  const id = Number(process.env.ZECCA_TOKEN_CHAIN_ID ?? 11155111);
  if (id === 1) return { chain: mainnet, url: process.env.ZECCA_ETH_RPC_URL?.trim() || "https://ethereum.publicnode.com" };
  if (id === 84532) return { chain: baseSepolia, url: "https://sepolia.base.org" };
  return {
    chain: sepolia,
    url: process.env.ZECCA_ETH_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com",
  };
}

async function main() {
  const health = kmsSignerHealth();
  const account = kmsSignerAccount();
  const admin = kmsSignerAddress();
  console.log(JSON.stringify({ kms: health.backend, signer: admin, kmsReady: health.ready }));
  if (!account || !admin) {
    console.log(JSON.stringify({ error: "NO_SIGNER" }));
    process.exit(1);
  }

  const { bytecode, abi } = compile();
  const { chain, url } = pickChain();
  const transport = http(url, { timeout: 20_000 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const gasBal = await publicClient.getBalance({ address: admin });
  console.log(JSON.stringify({ chain: chain.name, chainId: chain.id, gasWei: gasBal.toString() }));

  if (gasBal === 0n) {
    console.log(
      JSON.stringify({
        status: "NO_GAS",
        detail:
          "Il signer non ha native token su questa rete. Senza gas il create non parte. Nessun tx_hash inventato. Euro IBAN: nessuna API UniCredit/Wise in questo runtime.",
      }),
    );
    process.exit(2);
  }

  const deployData = encodeDeployData({
    abi: abi as never,
    bytecode,
    args: ["Zecca USD", "zUSD", 6, admin],
  });
  const hash = await walletClient.sendTransaction({
    data: deployData,
    account,
    chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const token = receipt.contractAddress;
  if (!token) {
    console.log(JSON.stringify({ status: "DEPLOY_NO_ADDRESS", hash }));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "DEPLOYED", hash, token, block: receipt.blockNumber.toString() }));

  const mintData = encodeFunctionData({
    abi: MINT_ABI,
    functionName: "mint",
    args: [METAMASK, MINT_UNITS],
  });
  const mintHash = await walletClient.sendTransaction({
    to: token,
    data: mintData,
    account,
    chain,
  });
  const minted = await publicClient.waitForTransactionReceipt({ hash: mintHash, timeout: 120_000 });
  const balance = await publicClient.readContract({
    address: token,
    abi: MINT_ABI,
    functionName: "balanceOf",
    args: [METAMASK],
  });
  console.log(
    JSON.stringify({
      status: "MINTED",
      mintHash,
      to: METAMASK,
      units: balance.toString(),
      explorerDeploy: `${chain.id === 11155111 ? "https://sepolia.etherscan.io/tx/" : "https://etherscan.io/tx/"}${hash}`,
      explorerMint: `${chain.id === 11155111 ? "https://sepolia.etherscan.io/tx/" : "https://etherscan.io/tx/"}${mintHash}`,
      addToMetaMask: { address: token, symbol: "zUSD", decimals: 6, chainId: chain.id },
      note: "Token di protocollo Zecca, non USDT Tether. MetaMask su Ethereum mainnet non mostra Sepolia da solo.",
    }),
  );
  writeFileSync(
    join(process.cwd(), "contracts", "out", "last-deploy.json"),
    JSON.stringify(
      {
        token,
        chainId: chain.id,
        deployHash: hash,
        mintHash,
        minter: admin,
        to: METAMASK,
      },
      null,
      2,
    ),
  );
  void existsSync;
  void minted;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
