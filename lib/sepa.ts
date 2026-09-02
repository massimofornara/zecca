import { formatEurFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";

export function sepaInstruction(input: {
  holder: string;
  iban: string;
  eurCents: number;
  cashoutId: string;
}) {
  const causal = `Zecca fusione ${input.cashoutId.slice(0, 8)}`;
  const lines = [
    `Beneficiario: ${input.holder}`,
    `IBAN: ${formatIbanDisplay(input.iban)}`,
    `Importo: ${formatEurFromCents(input.eurCents)}`,
    `Causale: ${causal}`,
  ];
  return { causal, text: lines.join("\n") };
}
