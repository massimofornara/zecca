export const FIAT_CURRENCIES = ["EUR", "USD", "CHF"] as const;
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];

export function parseFiatCurrency(raw: unknown): FiatCurrency {
  const value = String(raw ?? "EUR").toUpperCase();
  if (value === "USD") return "USD";
  if (value === "CHF") return "CHF";
  return "EUR";
}

export function creditsToFiatCents(credits: number, centsPerCredit: number) {
  return Math.round(credits * centsPerCredit);
}

export function fiatRailLabel(currency: FiatCurrency): string {
  if (currency === "USD") return "Bonifico in USD (SWIFT/estero)";
  if (currency === "CHF") return "Bonifico in CHF (SIC/estero)";
  return "Bonifico SEPA in EUR";
}

export function fiatName(currency: FiatCurrency): string {
  if (currency === "USD") return "dollari";
  if (currency === "CHF") return "franchi svizzeri";
  return "euro";
}
