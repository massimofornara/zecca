import { explorerUrl } from "@/lib/receipt";
import { mintContractForAsset } from "@/lib/zecca/token-mint";
import { kmsSignerHealth } from "@/lib/zecca/kms-signer";
import {
  tryDirectEvmMint,
  tryDirectEvmTransfer,
  tryShopOnChainPayout,
} from "@/lib/zecca/shop-payout";
import { tryGaslessEvmMint, gaslessEnabled } from "@/lib/zecca/gasless-chain";
import { executeWisePlatformTransfer, wiseHealth } from "@/lib/settlement/wise";
import type {
  CryptoInstruction,
  FiatInstruction,
  ProviderHealth,
  SettlementFetch,
  SettlementResult,
} from "@/lib/settlement/types";

function executedFromHash(
  provider: string,
  hash: string,
  network: string,
  signer: string | null,
  url?: string | null,
): SettlementResult {
  return {
    status: "EXECUTED",
    provider,
    proofKind: "TX_HASH",
    ref: hash,
    url: url ?? explorerUrl(network, hash),
    signer,
  };
}

/**
 * Crypto: mint (token Zecca / USDT-USDC di protocollo) → hot wallet → liquidity gateway.
 * Nativi BTC/ETH/BNB saltano il mint. Nessun hash se tutti i binari falliscono.
 */
export async function executeCryptoSettlement(
  input: CryptoInstruction,
  fetchImpl: SettlementFetch = fetch,
): Promise<SettlementResult> {
  const asset = input.asset.trim().toUpperCase();
  const mintable = Boolean(mintContractForAsset(asset));
  const tokenMint = mintable && (asset === "USDT" || asset === "USDC" || asset === "ZECCA");
  const evmSend = asset === "ETH" || asset === "BNB" || asset === "USDT" || asset === "USDC";
  const wantsEvmMint =
    asset === "ETH" || asset === "USDT" || asset === "USDC" || asset === "BNB" || asset === "ZECCA";

  const firstHop = await Promise.all([
    tokenMint || wantsEvmMint
      ? tryDirectEvmMint({
          walletAddress: input.destination,
          usdCents: input.usdCents,
          asset,
        })
      : Promise.resolve(null),
    evmSend
      ? tryDirectEvmTransfer({
          walletAddress: input.destination,
          walletNetwork: asset,
          usdCents: input.usdCents,
        })
      : Promise.resolve(null),
  ]);
  let mintedOrSent = firstHop.find((row) => row !== null) ?? null;
  if (!mintedOrSent && wantsEvmMint) {
    const gasless = await tryGaslessEvmMint({
      walletAddress: input.destination as `0x${string}`,
      usdCents: input.usdCents,
    });
    if (gasless) {
      mintedOrSent = {
        hash: gasless.hash,
        explorerUrl: gasless.explorerUrl,
        shopAddress: gasless.shopAddress,
        network: gasless.network,
      };
    }
  }
  if (mintedOrSent) {
    return executedFromHash(
      mintedOrSent.network === "ZECCA" ? "zecca-gasless" : mintedOrSent.network === "ETH" || mintedOrSent.network === "BNB" || mintedOrSent.network === asset
        ? "hot-wallet"
        : "evm-minter",
      mintedOrSent.hash,
      mintedOrSent.network,
      mintedOrSent.shopAddress,
      mintedOrSent.explorerUrl,
    );
  }

  if (asset === "BTC") {
    const sent = await tryShopOnChainPayout({
      walletAddress: input.destination,
      walletNetwork: "BTC",
      usdCents: input.usdCents,
    });
    if (sent) return executedFromHash("hot-wallet", sent.hash, "BTC", sent.shopAddress);
  }

  if (asset === "BTC" || asset === "ETH" || asset === "BNB" || asset === "USDT" || asset === "USDC") {
    const viaProvider = await executeLiquidityDisbursal(input, fetchImpl);
    if (viaProvider.status !== "DEFERRED") return viaProvider;
    if (asset === "BTC" || asset === "ETH" || asset === "BNB") return viaProvider;
  }

  if (mintable) {
    return {
      status: "DEFERRED",
      provider: "evm-minter",
      code: "MINT_FAILED",
      reason:
        "Il contratto di mint è configurato ma la transazione non è partita (gas, ruolo MINTER o RPC). Nessun hash inventato.",
    };
  }

  return {
    status: "DEFERRED",
    provider: "pipeline",
    code: "NO_RAIL",
    reason:
      "Nessun binario pronto: manca il minter (ZECCA_TOKEN_ADDRESS / ZECCA_MINT_USDT_ADDRESS) e il vault è vuoto.",
  };
}

export async function executeFiatSettlement(
  input: FiatInstruction,
  fetchImpl: SettlementFetch = fetch,
): Promise<SettlementResult> {
  if (input.currency === "EUR") return executeSepaDisbursal(input, fetchImpl);
  return executeWisePlatformTransfer(input, fetchImpl);
}

export function settlementProviderHealth(): ProviderHealth[] {
  const mint = mintContractForAsset("USDT") ?? mintContractForAsset("ZECCA");
  const kms = kmsSignerHealth();
  return [
    {
      id: "kms-signer",
      label: "KMS secp256k1 / MINTER_ROLE",
      rails: ["USDT", "USDC", "ZECCA"],
      ready: kms.ready,
      detail: kms.detail,
    },
    {
      id: "zecca-gasless",
      label: "Zecca Gasless (chain 22120, gasPrice 0)",
      rails: ["ETH", "USDT", "USDC", "BNB", "ZECCA"],
      ready: gaslessEnabled() && kms.ready,
      detail: gaslessEnabled()
        ? "Catena in-process: mint zUSD a gas zero. Hash su /catena/tx, non su Etherscan. Non è ether di mainnet né USDT Tether."
        : "ZECCA_GASLESS=0: la catena a gas zero è spenta (test).",
    },
    {
      id: "evm-minter",
      label: "Smart contract mint (USDT/USDC di protocollo, token Zecca)",
      rails: ["USDT", "USDC", "ZECCA"],
      ready: Boolean(mint) || (gaslessEnabled() && kms.ready),
      detail: mint
        ? `${mint.ticker} ${mint.address} chain ${mint.chainId}`
        : gaslessEnabled()
          ? "Nessun contratto su Ethereum/BSC. Il mint parte su Zecca Gasless 22120."
          : "Nessun contratto con MINTER_ROLE. Tether/Circle non si coniano da questo libro.",
    },
    {
      id: "hot-wallet",
      label: "Hot wallet negozio (transfer se c’è saldo)",
      rails: ["BTC", "ETH", "USDT", "USDC", "BNB"],
      ready: true,
      detail: "Usato solo se il vault on-chain ha fondi. Saldo zero → passo successivo, niente blocco UI.",
    },
    liquidityHealth(),
    sepaGatewayHealth(),
    wiseHealth(),
  ];
}
