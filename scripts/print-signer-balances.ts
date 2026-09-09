import { createPublicClient, http, formatEther } from "viem";
import {
  mainnet,
  sepolia,
  holesky,
  bsc,
  baseSepolia,
  arbitrumSepolia,
  type Chain,
} from "viem/chains";
import { kmsSignerAddress } from "../lib/zecca/kms-signer";

const CHAINS: { name: string; chain: Chain; url: string }[] = [
  { name: "mainnet", chain: mainnet, url: "https://ethereum.publicnode.com" },
  { name: "sepolia", chain: sepolia, url: "https://ethereum-sepolia-rpc.publicnode.com" },
  { name: "holesky", chain: holesky, url: "https://ethereum-holesky-rpc.publicnode.com" },
  { name: "bsc", chain: bsc, url: "https://bsc-dataseed.binance.org" },
  { name: "baseSepolia", chain: baseSepolia, url: "https://sepolia.base.org" },
  { name: "arbSepolia", chain: arbitrumSepolia, url: "https://sepolia-rollup.arbitrum.io/rpc" },
];

async function main() {
  const addr = kmsSignerAddress();
  if (!addr) {
    console.log(JSON.stringify({ error: "NO_SIGNER" }));
    process.exit(1);
  }
  console.log(JSON.stringify({ signer: addr }));
  for (const row of CHAINS) {
    try {
      const client = createPublicClient({
        chain: row.chain,
        transport: http(row.url, { timeout: 8_000 }),
      });
      const bal = await client.getBalance({ address: addr });
      console.log(JSON.stringify({ chain: row.name, chainId: row.chain.id, native: formatEther(bal) }));
    } catch (error) {
      console.log(
        JSON.stringify({
          chain: row.name,
          error: error instanceof Error ? error.message.slice(0, 160) : "rpc",
        }),
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
