import { formatIbanDisplay, normalizeIban } from "@/lib/iban";

export type HousePayoutAccount = {
  id: "unicredit" | "wise";
  bank: string;
  iban: string;
  holder: string;
  preferredCurrency: "EUR" | "USD";
};

/** Conti su cui la casa preleva. Indicati da Massimo: UniCredit (EUR) e Wise (USD). */
export const HOUSE_PAYOUT_ACCOUNTS: readonly HousePayoutAccount[] = [
  {
    id: "unicredit",
    bank: "UniCredit",
    iban: "IT22B0200822800000103317304",
    holder: "Massimo Fornara",
    preferredCurrency: "EUR",
  },
  {
    id: "wise",
    bank: "Wise",
    iban: "BE06967614820722",
    holder: "NeoNoble Company",
    preferredCurrency: "USD",
  },
];

export function housePayoutAccount(id: string | null | undefined): HousePayoutAccount | null {
  return HOUSE_PAYOUT_ACCOUNTS.find((account) => account.id === id) ?? null;
}

export function housePayoutForCurrency(currency: "EUR" | "USD"): HousePayoutAccount {
  return (
    HOUSE_PAYOUT_ACCOUNTS.find((account) => account.preferredCurrency === currency) ??
    HOUSE_PAYOUT_ACCOUNTS[0]
  );
}

export function housePayoutByIban(iban: string | null | undefined): HousePayoutAccount | null {
  if (!iban) return null;
  const normalized = normalizeIban(iban);
  return HOUSE_PAYOUT_ACCOUNTS.find((account) => account.iban === normalized) ?? null;
}

export function housePayoutLabel(iban: string | null | undefined): string | null {
  const account = housePayoutByIban(iban);
  if (!account) return null;
  return `${account.bank} · ${formatIbanDisplay(account.iban)}`;
}
