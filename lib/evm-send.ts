export const EVM_ASSETS: Record<
  string,
  { chainId: number; decimals: number; native?: boolean; token?: `0x${string}`; chainName: string }
> = {
  ETH: { chainId: 1, decimals: 18, native: true, chainName: "Ethereum" },
  USDT: {
    chainId: 1,
    decimals: 6,
    token: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    chainName: "Ethereum",
  },
  USDC: {
    chainId: 1,
    decimals: 6,
    token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainName: "Ethereum",
  },
  BNB: { chainId: 56, decimals: 18, native: true, chainName: "BNB Smart Chain" },
};

export function tokenAmountFromUsdCents(usdCents: number, decimals: number): bigint {
  const cents = Math.floor(usdCents);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("Importo crypto non valido.");
  }
  return (BigInt(cents) * BigInt(10) ** BigInt(decimals)) / BigInt(100);
}

export function encodeErc20Transfer(to: string, amount: bigint): `0x${string}` {
  const address = to.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  const value = amount.toString(16).padStart(64, "0");
  return `0xa9059cbb${address}${value}`;
}

export function toHex(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}

export function chainIdHex(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export async function usdSpotPrice(ticker: "ETH" | "BNB"): Promise<number> {
  const url =
    ticker === "BNB"
      ? "https://api.coinbase.com/v2/prices/BNB-USD/spot"
      : "https://api.coinbase.com/v2/prices/ETH-USD/spot";
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Prezzo di rete non disponibile.");
  const json = (await res.json()) as { data?: { amount?: string } };
  const price = Number(json.data?.amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Prezzo di rete non disponibile.");
  return price;
}

export function nativeWeiFromUsdCents(usdCents: number, usdPrice: number, decimals: number): bigint {
  if (usdPrice <= 0) throw new Error("Prezzo di rete non disponibile.");
  const usd = usdCents / 100;
  const coins = usd / usdPrice;
  const wei = BigInt(Math.round(coins * 10 ** Math.min(decimals, 8))) * BigInt(10) ** BigInt(Math.max(decimals - 8, 0));
  if (wei <= BigInt(0)) throw new Error("Importo troppo piccolo per questa rete.");
  return wei;
}
