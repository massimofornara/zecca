import { formatEurFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { walletNetworkLabel } from "@/lib/wallet";
import { sepaInstruction } from "@/lib/sepa";

export function walletInstruction(input: {
  network: string;
  address: string;
  eurCents: number;
  cashoutId: string;
}) {
  const causal = `Zecca prelievo ${input.cashoutId.slice(0, 8)}`;
  const lines = [
    `Rete: ${walletNetworkLabel(input.network)}`,
    `Indirizzo: ${input.address}`,
    `Importo da inviare: ${formatEurFromCents(input.eurCents)} (o equivalente sulla rete)`,
    `Riferimento: ${causal}`,
  ];
  return { causal, text: lines.join("\n") };
}

export function destinationInstruction(input: {
  payoutKind: string;
  holder: string | null;
  iban: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  eurCents: number;
  cashoutId: string;
}) {
  if (input.payoutKind === "WALLET" && input.walletAddress) {
    return {
      kind: "WALLET" as const,
      ...walletInstruction({
        network: input.walletNetwork ?? "OTHER",
        address: input.walletAddress,
        eurCents: input.eurCents,
        cashoutId: input.cashoutId,
      }),
    };
  }
  if (input.iban && input.holder) {
    return {
      kind: "IBAN" as const,
      ...sepaInstruction({
        holder: input.holder,
        iban: input.iban,
        eurCents: input.eurCents,
        cashoutId: input.cashoutId,
      }),
      ibanDisplay: formatIbanDisplay(input.iban),
    };
  }
  return null;
}
