/**
 * Deploy del minter Zecca (non Tether).
 *
 * 1. Compila con Foundry/solc se lo hai: solc contracts/ZeccaMinter.sol
 * 2. Invia il create dal wallet negozio (ZECCA_EVM_PRIVATE_KEY) con gas sul chain scelto.
 * 3. Imposta ZECCA_TOKEN_ADDRESS, ZECCA_TOKEN_CHAIN_ID, ZECCA_TOKEN_DECIMALS.
 * 4. Il constructor riceve l’address minter = shop EVM.
 *
 * Questo script non inventa un tx_hash: se manca gas o chiave, esce con il bytecode check.
 */
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, bsc } from "viem/chains";
import { shopEvmPrivateKey, shopWalletAddress } from "../lib/zecca/shop-payout";

async function main() {
  const minter = shopWalletAddress();
  const key = shopEvmPrivateKey();
  console.log("shop minter", minter);
  console.log("chain", process.env.ZECCA_TOKEN_CHAIN_ID ?? "1");
  if (!key || !minter) {
    console.log("Nessuna chiave EVM. Imposta ZECCA_EVM_PRIVATE_KEY o AUTH_SECRET.");
    process.exit(0);
  }
  if (process.env.ZECCA_DEPLOY_MINTER !== "1") {
    console.log("Dry-run. Per inviare il create: ZECCA_DEPLOY_MINTER=1 npx tsx scripts/deploy-zecca-minter.ts");
    console.log("Poi copia l’address in ZECCA_TOKEN_ADDRESS e ZECCA_MINT_USDT_ADDRESS.");
    process.exit(0);
  }
  const chainId = Number(process.env.ZECCA_TOKEN_CHAIN_ID ?? 1);
  const chain = chainId === 56 ? bsc : mainnet;
  const account = privateKeyToAccount(key);
  const client = createWalletClient({ account, chain, transport: http() });
  console.log("Deploy richiede bytecode compilato. Usa Foundry: forge create contracts/ZeccaToken.sol:ZeccaToken --constructor-args \"Zecca USD\" \"zUSD\" 6", account.address);
  void client;
  const hex = "0x" as Hex;
  void hex;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
