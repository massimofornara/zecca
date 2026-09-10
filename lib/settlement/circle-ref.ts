/** Predicati USDC sicuri per il client: niente chiavi Circle, niente node:crypto. */

export const CIRCLE_USDC_CHAIN = "BASE" as const;

/** Wallet Circle SCA del negozio su Base. I clienti non firmano: deposita USDC qui. */
export const CIRCLE_SHOP_SCA_ADDRESS = "0xaa7b4d75b80b145163d1f1caacd8b1b468fcca08";

export const CIRCLE_USDC_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function isUsdcCashoutNetwork(network: string | null | undefined) {
  const id = (network ?? "").trim().toUpperCase();
  return id === "USDC" || id === "USDC_BASE" || id === "BASE";
}

export function isLocalOrInternalExplorer(url: string | null | undefined) {
  const value = (url ?? "").toLowerCase();
  return (
    value.includes("127.0.0.1") ||
    value.includes("localhost") ||
    value.includes("/catena/")
  );
}

export function basescanTxUrl(hash: string) {
  const ref = hash.trim();
  const path = ref.startsWith("0x") ? ref : `0x${ref}`;
  return `https://basescan.org/tx/${path}`;
}

/** Prova Circle vera: ID trasferimento o hash BaseScan. Catena interna / localhost non contano. */
export function isCircleUsdcReceipt(input: {
  receiptKind?: string | null;
  receiptRef?: string | null;
  receiptUrl?: string | null;
  adminNote?: string | null;
  walletNetwork?: string | null;
}) {
  if (!isUsdcCashoutNetwork(input.walletNetwork)) return false;
  if (isLocalOrInternalExplorer(input.receiptUrl)) return false;
  const kind = (input.receiptKind ?? "").trim().toUpperCase();
  const ref = (input.receiptRef ?? "").trim();
  const url = (input.receiptUrl ?? "").toLowerCase();
  const note = (input.adminNote ?? "").toLowerCase();
  if (kind === "CIRCLE_TRANSFER" && ref.length >= 8 && !ref.startsWith("0x")) return true;
  if (kind === "TX_HASH" && /^0x[a-fA-F0-9]{64}$/.test(ref) && url.includes("basescan.org")) return true;
  if (kind === "TX_HASH" && /^0x[a-fA-F0-9]{64}$/.test(ref) && note.includes("circle") && url.includes("basescan")) {
    return true;
  }
  return false;
}
