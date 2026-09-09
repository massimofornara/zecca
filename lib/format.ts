import type { FiatCurrency } from "@/lib/zecca/fiat";
import { parseFiatCurrency } from "@/lib/zecca/fiat";

export function formatCredits(amount: number): string {
  return `${amount.toLocaleString("it-IT")} cr`;
}

export function formatEurFromCents(cents: number): string {
  return formatFiatFromCents(cents, "EUR");
}

export function formatUsdFromCents(cents: number): string {
  return formatFiatFromCents(cents, "USD");
}

export function formatChfFromCents(cents: number): string {
  return formatFiatFromCents(cents, "CHF");
}

export function formatFiatFromCents(cents: number, currency: FiatCurrency): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatSignedCredits(amount: number): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString("it-IT")} cr`;
}

export function formatCashoutValue(input: {
  currency: string;
  eurCents: number;
  usdCents: number;
  chfCents?: number;
}): string {
  const currency = parseFiatCurrency(input.currency);
  if (currency === "USD") return formatUsdFromCents(input.usdCents);
  if (currency === "CHF") return formatChfFromCents(input.chfCents ?? 0);
  return formatEurFromCents(input.eurCents);
}

export const LEDGER_LABELS: Record<string, string> = {
  MINT: "Conio",
  HOUSE_GRANT: "Generazione casa",
  PURCHASE_CREDITS: "Acquisto crediti",
  SPEND_ON_ORDER: "Spesa in bottega",
  CASHOUT_REQUEST: "Richiesta di prelievo",
  CASHOUT_PAID: "Prelievo pagato",
  CASHOUT_REJECTED: "Prelievo rifiutato",
  TREASURY_CASHOUT: "Fusione tesoreria",
  TREASURY_CONVERT_TO_EUR: "Conversione tesoreria → EUR",
  TREASURY_CONVERT_TO_USD: "Conversione tesoreria → USD",
  TREASURY_CONVERT_TO_CHF: "Conversione tesoreria → CHF",
  TREASURY_CONVERT_TO_CRYPTO: "Conversione tesoreria → crypto",
  TREASURY_CRYPTO_WITHDRAW: "Prelievo wallet interno",
  RATE_CHANGE: "Cambio tasso",
};

export const POCKET_LABELS: Record<string, string> = {
  VOID: "Vuoto (origine del conio)",
  TREASURY: "Tesoreria",
  USER: "Portafoglio",
  ESCROW: "In fusione",
  BURN: "Fuso / speso",
};
