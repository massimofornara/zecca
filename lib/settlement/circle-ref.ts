/** Predicati USDC sicuri per il client: niente chiavi Circle, niente node:crypto. */

export const CIRCLE_USDC_CHAIN = "BASE" as const;

export function isUsdcCashoutNetwork(network: string | null | undefined) {
  const id = (network ?? "").trim().toUpperCase();
  return id === "USDC" || id === "USDC_BASE" || id === "BASE";
}
