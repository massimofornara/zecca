import { getAddress, type Address, type Hex } from "viem";
import { ZeccaError } from "@/lib/errors";
import { tokenAmountFromUsdCents } from "@/lib/evm-send";

const MINT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export type ProprietaryToken = {
  address: Address;
  chainId: number;
  decimals: number;
  ticker: string;
};

function readMintContract(input: {
  address?: string;
  chainId?: string;
  decimals?: string;
  ticker: string;
  fallbackChainId?: string;
  fallbackDecimals?: string;
}): ProprietaryToken | null {
  const raw = input.address?.trim();
  if (!raw) return null;
  try {
    const address = getAddress(raw);
    const chainId = Number(input.chainId || input.fallbackChainId || 1);
    const decimals = Number(input.decimals || input.fallbackDecimals || 18);
    if (!Number.isInteger(chainId) || chainId <= 0) return null;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
    return { address, chainId, decimals, ticker: input.ticker };
  } catch {
    return null;
  }
}

/** Contratto ERC-20 del negozio con mint(to, amount). Non crea BTC né ether. */
export function proprietaryTokenConfig(): ProprietaryToken | null {
  return readMintContract({
    address: process.env.ZECCA_TOKEN_ADDRESS,
    chainId: process.env.ZECCA_TOKEN_CHAIN_ID,
    decimals: process.env.ZECCA_TOKEN_DECIMALS,
    ticker: (process.env.ZECCA_TOKEN_TICKER ?? "ZECCA").trim() || "ZECCA",
  });
}

/**
 * Contratto di conio per l’asset richiesto.
 * USDT/USDC usano il minter Zecca (token di protocollo), non Tether/Circle,
 * a meno che ZECCA_MINT_USDT_ADDRESS / ZECCA_MINT_USDC_ADDRESS puntino a un
 * contratto di cui il negozio ha MINTER_ROLE.
 */
export function mintContractForAsset(asset: string | null | undefined): ProprietaryToken | null {
  const id = (asset ?? "").trim().toUpperCase();
  if (id === "ETH" || id === "BNB" || id === "BTC") return null;
  if (id === "USDT") {
    return (
      readMintContract({
        address: process.env.ZECCA_MINT_USDT_ADDRESS,
        chainId: process.env.ZECCA_MINT_USDT_CHAIN_ID,
        decimals: process.env.ZECCA_MINT_USDT_DECIMALS ?? "6",
        ticker: "USDT",
        fallbackChainId: process.env.ZECCA_TOKEN_CHAIN_ID,
      }) ?? proprietaryTokenConfig()
    );
  }
  if (id === "USDC") {
    return (
      readMintContract({
        address: process.env.ZECCA_MINT_USDC_ADDRESS,
        chainId: process.env.ZECCA_MINT_USDC_CHAIN_ID,
        decimals: process.env.ZECCA_MINT_USDC_DECIMALS ?? "6",
        ticker: "USDC",
        fallbackChainId: process.env.ZECCA_TOKEN_CHAIN_ID,
      }) ?? proprietaryTokenConfig()
    );
  }
  return proprietaryTokenConfig();
}

export function proprietaryMintAbi() {
  return MINT_ABI;
}

export function proprietaryMintAmount(usdCents: number, decimals: number): bigint {
  return tokenAmountFromUsdCents(usdCents, decimals);
}

export function assertProprietaryMintConfigured() {
  const token = proprietaryTokenConfig();
  if (!token) {
    throw new ZeccaError(
      "Mint diretto non configurato. Imposta ZECCA_TOKEN_ADDRESS sul contratto di cui il negozio è minter.",
      "MISSING_MINT_CONTRACT",
    );
  }
  return token;
}

export function encodeProprietaryMint(to: Address, amount: bigint): Hex {
  const address = to.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  const value = amount.toString(16).padStart(64, "0");
  return `0x40c10f19${address}${value}`;
}
