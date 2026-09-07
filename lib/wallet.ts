export const WALLET_NETWORKS = [
  { id: "SEPA", label: "Conto bancario (IBAN)" },
  { id: "BTC", label: "Bitcoin" },
  { id: "ETH", label: "Ethereum (ETH / USDT ERC-20)" },
  { id: "TRX", label: "Tron (USDT TRC-20)" },
  { id: "OTHER", label: "Altro wallet" },
] as const;

export type WalletNetwork = (typeof WALLET_NETWORKS)[number]["id"];

export function normalizeWalletAddress(raw: string) {
  return raw.replace(/\s+/g, "").trim();
}

export function isValidWalletAddress(raw: string, network: string) {
  const address = normalizeWalletAddress(raw);
  if (address.length < 12 || address.length > 128) return false;
  if (/[\s<>'"]/.test(address)) return false;

  if (network === "ETH") return /^0x[a-fA-F0-9]{40}$/.test(address);
  if (network === "BTC") return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
  if (network === "TRX") return /^T[1-9A-HJ-NP-Za-km-z]{25,48}$/.test(address);
  if (network === "OTHER") return /^[a-zA-Z0-9:_-]{12,128}$/.test(address);
  return false;
}

export function walletNetworkLabel(network: string | null | undefined) {
  return WALLET_NETWORKS.find((n) => n.id === network)?.label ?? network ?? "Wallet";
}
