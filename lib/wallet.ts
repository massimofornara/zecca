import { isAddress } from "viem";
import * as btc from "@scure/btc-signer";

export const WALLET_NETWORKS = [
  { id: "SEPA", label: "Conto bancario (IBAN)" },
  { id: "BTC", label: "Bitcoin" },
  { id: "ETH", label: "Ethereum" },
  { id: "USDT", label: "USDT (ERC-20)" },
  { id: "USDC", label: "USDC su Base" },
  { id: "BNB", label: "BNB Smart Chain" },
  { id: "ZECCA", label: "Token Zecca (mint diretto)" },
  { id: "TRX", label: "USDT (TRC-20)" },
  { id: "OTHER", label: "Altro wallet" },
] as const;

export type WalletNetwork = (typeof WALLET_NETWORKS)[number]["id"];

export type CryptoAsset = {
  id: Exclude<WalletNetwork, "SEPA">;
  label: string;
  ticker: string;
  hint: string;
};

export const CRYPTO_ASSETS: readonly CryptoAsset[] = [
  { id: "BTC", label: "Bitcoin", ticker: "BTC", hint: "bc1… / 1… / 3…" },
  { id: "ETH", label: "Ethereum", ticker: "ETH", hint: "0x…" },
  { id: "USDT", label: "USDT", ticker: "USDT", hint: "0x… su Ethereum (ERC-20)" },
  { id: "USDC", label: "USDC su Base", ticker: "USDC", hint: "0x… su Base (Circle)" },
  { id: "BNB", label: "BNB Smart Chain", ticker: "BNB", hint: "0x… su BNB (BscScan / Blockscout)" },
  { id: "ZECCA", label: "Token Zecca", ticker: "ZECCA", hint: "0x… mint diretto sul contratto del negozio" },
  { id: "TRX", label: "USDT TRC-20", ticker: "USDT", hint: "T… su Tron" },
  { id: "OTHER", label: "Altra crypto", ticker: "CRYPTO", hint: "indirizzo del wallet" },
];

export function cryptoAsset(id: string | null | undefined): CryptoAsset | null {
  return CRYPTO_ASSETS.find((asset) => asset.id === id) ?? null;
}

export function cryptoTicker(id: string | null | undefined): string {
  return cryptoAsset(id)?.ticker ?? "CRYPTO";
}

export function normalizeWalletAddress(raw: string) {
  return raw.replace(/\s+/g, "").trim();
}

function isStrictEvmAddress(address: string) {
  return isAddress(address, { strict: true });
}

function isDecodedBtcAddress(address: string) {
  if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address)) return false;
  try {
    btc.Address(btc.NETWORK).decode(address);
    return true;
  } catch {
    return false;
  }
}

export function isValidWalletAddress(raw: string, network: string) {
  const address = normalizeWalletAddress(raw);
  if (address.length < 12 || address.length > 128) return false;
  if (/[\s<>'"]/.test(address)) return false;

  const id = network.trim().toUpperCase();
  if (id === "ETH" || id === "USDT" || id === "USDC" || id === "BNB" || id === "ZECCA") {
    return isStrictEvmAddress(address);
  }
  if (id === "BTC") return isDecodedBtcAddress(address);
  if (id === "TRX") return /^T[1-9A-HJ-NP-Za-km-z]{25,48}$/.test(address);
  if (id === "OTHER") return /^[a-zA-Z0-9:_-]{12,128}$/.test(address);
  return false;
}

export function walletNetworkLabel(network: string | null | undefined) {
  return WALLET_NETWORKS.find((n) => n.id === network)?.label ?? network ?? "Wallet";
}
