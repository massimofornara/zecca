export const FIAT_CURRENCIES = ["EUR", "USD"] as const;
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];

export function parseFiatCurrency(raw: unknown): FiatCurrency {
  const value = String(raw ?? "EUR").toUpperCase();
  return value === "USD" ? "USD" : "EUR";
}

export function creditsToFiatCents(credits: number, centsPerCredit: number) {
  return Math.round(credits * centsPerCredit);
}
