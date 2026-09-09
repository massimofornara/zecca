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

/** Contratto ERC-20 del negozio con mint(to, amount). Non crea BTC né ether. */
export function proprietaryTokenConfig(): ProprietaryToken | null {
  const raw = process.env.ZECCA_TOKEN_ADDRESS?.trim();
  if (!raw) return null;
  try {
    const address = getAddress(raw);
    const chainId = Number(process.env.ZECCA_TOKEN_CHAIN_ID ?? 1);
    const decimals = Number(process.env.ZECCA_TOKEN_DECIMALS ?? 18);
    if (!Number.isInteger(chainId) || chainId <= 0) return null;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
    const ticker = (process.env.ZECCA_TOKEN_TICKER ?? "ZECCA").trim() || "ZECCA";
    return { address, chainId, decimals, ticker };
  } catch {
    return null;
  }
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
