import { formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { fiatRailLabel, parseFiatCurrency, type FiatCurrency } from "@/lib/zecca/fiat";

export function sepaInstruction(input: {
  holder: string;
  iban: string;
  amountCents: number;
  currency?: FiatCurrency | string;
  cashoutId: string;
  bic?: string | null;
  /** @deprecated usa amountCents */
  eurCents?: number;
}) {
  const currency = parseFiatCurrency(input.currency);
  const amountCents = input.amountCents ?? input.eurCents ?? 0;
  const causal = `Zecca fusione ${input.cashoutId.slice(0, 8)}`;
  const rail = fiatRailLabel(currency);
  const lines = [
    `Beneficiario: ${input.holder}`,
    `IBAN: ${formatIbanDisplay(input.iban)}`,
    ...(input.bic ? [`BIC: ${input.bic}`] : []),
    `${rail}: ${formatFiatFromCents(amountCents, currency)}`,
    `Causale: ${causal}`,
  ];
  return { causal, text: lines.join("\n"), amountLabel: formatFiatFromCents(amountCents, currency) };
}
