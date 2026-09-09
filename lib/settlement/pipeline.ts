import { explorerUrl } from "@/lib/receipt";
import { mintContractForAsset } from "@/lib/zecca/token-mint";
import {
  tryDirectEvmMint,
  tryDirectEvmTransfer,
  tryShopOnChainPayout,
} from "@/lib/zecca/shop-payout";
import { executeLiquidityDisbursal, executeSepaDisbursal, liquidityHealth, sepaGatewayHealth } from "@/lib/settlement/gateways";
import { executeWisePlatformTransfer, wiseHealth } from "@/lib/settlement/wise";
import type {
  CryptoInstruction,
  FiatInstruction,
  ProviderHealth,
  SettlementFetch,
  SettlementResult,
} from "@/lib/settlement/types";

function executedFromHash(provider: string, hash: string, network: string, signer: string | null): SettlementResult {
  return {
    status: "EXECUTED",
    provider,
    proofKind: "TX_HASH",
    ref: hash,
    url: explorerUrl(network, hash),
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
  if (mintable && (asset === "USDT" || asset === "USDC" || asset === "ZECCA")) {
    const minted = await tryDirectEvmMint({
      walletAddress: input.destination,
      usdCents: input.usdCents,
      asset,
    });
    if (minted) return executedFromHash("evm-minter", minted.hash, minted.network, minted.shopAddress);
  }

  if (asset === "ETH" || asset === "BNB" || asset === "USDT" || asset === "USDC") {
    const sent = await tryDirectEvmTransfer({
      walletAddress: input.destination,
      walletNetwork: asset,
      usdCents: input.usdCents,
    });
    if (sent) return executedFromHash("hot-wallet", sent.hash, sent.network, sent.shopAddress);
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
  return [
    {
      id: "evm-minter",
      label: "Smart contract mint (USDT/USDC di protocollo, token Zecca)",
      rails: ["USDT", "USDC", "ZECCA"],
      ready: Boolean(mint),
      detail: mint
        ? `${mint.ticker} ${mint.address} chain ${mint.chainId}`
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
