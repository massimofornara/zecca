import { formatIbanDisplay, normalizeIban } from "@/lib/iban";

export const HOUSE_PROFILES = [
  { email: "massimo.fornara.2212@gmail.com", name: "Massimo" },
  { email: "massimo@zecca.local", name: "Massimo" },
  { email: "mfornara93@gmail.com", name: "Maxi" },
] as const;

export function normalizeHouseEmail(email: string | null | undefined): string {
  return (email ?? "").toLowerCase().trim();
}

/**
 * Gmail ignora punti e +tag. In produzione Massimo/Maxi restano casa
 * anche se l’account è scritto senza punti o con un alias.
 */
export function emailIdentity(email: string | null | undefined): string {
  const normalized = normalizeHouseEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 1) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const bare = local.split("+")[0]?.replace(/\./g, "") ?? "";
    return `${bare}@gmail.com`;
  }
  return normalized;
}

export function isHouseEmail(email: string | null | undefined): boolean {
  const identity = emailIdentity(email);
  if (!identity) return false;
  return HOUSE_PROFILES.some((profile) => emailIdentity(profile.email) === identity);
}

export function houseDisplayName(email: string | null | undefined): string | null {
  const identity = emailIdentity(email);
  return HOUSE_PROFILES.find((profile) => emailIdentity(profile.email) === identity)?.name ?? null;
}

/** Varianti con cui l’utente può essersi iscritto o accedere. */
export function houseEmailCandidates(email: string | null | undefined): string[] {
  const normalized = normalizeHouseEmail(email);
  if (!normalized) return [];
  const found = new Set<string>([normalized, emailIdentity(normalized)]);
  for (const profile of HOUSE_PROFILES) {
    if (emailIdentity(profile.email) === emailIdentity(normalized)) {
      found.add(profile.email);
    }
  }
  return [...found];
}

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
