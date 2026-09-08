import { formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";

export function sepaInstruction(input: {
  holder: string;
  iban: string;
  amountCents: number;
  currency?: "EUR" | "USD";
  cashoutId: string;
  /** @deprecated usa amountCents */
  eurCents?: number;
}) {
  const currency = input.currency === "USD" ? "USD" : "EUR";
  const amountCents = input.amountCents ?? input.eurCents ?? 0;
  const causal = `Zecca fusione ${input.cashoutId.slice(0, 8)}`;
  const rail = currency === "USD" ? "Bonifico in USD (SWIFT/estero)" : "Bonifico SEPA in EUR";
  const lines = [
    `Beneficiario: ${input.holder}`,
    `IBAN: ${formatIbanDisplay(input.iban)}`,
    `${rail}: ${formatFiatFromCents(amountCents, currency)}`,
    `Causale: ${causal}`,
  ];
  return { causal, text: lines.join("\n"), amountLabel: formatFiatFromCents(amountCents, currency) };
}
