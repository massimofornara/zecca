export function formatCredits(amount: number): string {
  return `${amount.toLocaleString("it-IT")} cr`;
}

export function formatEurFromCents(cents: number): string {
  return formatFiatFromCents(cents, "EUR");
}

export function formatUsdFromCents(cents: number): string {
  return formatFiatFromCents(cents, "USD");
}

export function formatFiatFromCents(cents: number, currency: "EUR" | "USD"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatSignedCredits(amount: number): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString("it-IT")} cr`;
}

export const LEDGER_LABELS: Record<string, string> = {
  MINT: "Conio",
  PURCHASE_CREDITS: "Acquisto crediti",
  SPEND_ON_ORDER: "Spesa in bottega",
  CASHOUT_REQUEST: "Richiesta di fusione",
  CASHOUT_PAID: "Fusione pagata",
  CASHOUT_REJECTED: "Fusione rifiutata",
  TREASURY_CASHOUT: "Fusione tesoreria",
  TREASURY_CONVERT_TO_EUR: "Conversione tesoreria → EUR",
  TREASURY_CONVERT_TO_USD: "Conversione tesoreria → USD",
  RATE_CHANGE: "Cambio tasso",
};

export const POCKET_LABELS: Record<string, string> = {
  VOID: "Vuoto (origine del conio)",
  TREASURY: "Tesoreria",
  USER: "Portafoglio",
  ESCROW: "In fusione",
  BURN: "Fuso / speso",
};
