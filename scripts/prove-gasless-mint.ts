import { readFileSync } from "node:fs";
import {
  tryGaslessEvmMint,
  gaslessRpcRequest,
  gaslessTxView,
  ZECCA_GASLESS_CHAIN_ID,
} from "../lib/zecca/gasless-chain";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const cut = trimmed.indexOf("=");
      if (cut < 0) continue;
      const key = trimmed.slice(0, cut).trim();
      let value = trimmed.slice(cut + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  } catch {
    /* .env assente: AUTH_SECRET deve essere già nell’ambiente */
  }
}

async function main() {
  loadEnv();
  delete process.env.ZECCA_GASLESS;
  const to = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" as const;
  const minted = await tryGaslessEvmMint({ walletAddress: to, usdCents: 1080 });
  if (!minted) {
    console.error("NO_MINT: catena gasless non ha prodotto un hash.");
    process.exit(2);
  }
  const receipt = (await gaslessRpcRequest("eth_getTransactionReceipt", [minted.hash])) as {
    status?: string;
  };
  const tx = (await gaslessRpcRequest("eth_getTransactionByHash", [minted.hash])) as {
    gasPrice?: string;
  };
  const view = await gaslessTxView(minted.hash);
  const gasPrice = BigInt(tx?.gasPrice ?? "0x1");
  if (receipt?.status !== "0x1" || gasPrice !== 0n || view?.status !== "success") {
    console.error(JSON.stringify({ minted, receipt, tx, view }, null, 2));
    process.exit(3);
  }
  if (/etherscan/i.test(minted.explorerUrl)) {
    console.error("Explorer non deve essere Etherscan.");
    process.exit(4);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        chainId: ZECCA_GASLESS_CHAIN_ID,
        gasPrice: 0,
        hash: minted.hash,
        token: minted.token,
        explorerUrl: minted.explorerUrl,
        status: receipt.status,
        etherscan: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
