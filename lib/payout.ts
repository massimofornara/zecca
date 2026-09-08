import { formatCashoutValue, formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { walletNetworkLabel } from "@/lib/wallet";
import { sepaInstruction } from "@/lib/sepa";

export function walletInstruction(input: {
  network: string;
  address: string;
  amountCents: number;
  currency?: "EUR" | "USD";
  cashoutId: string;
  eurCents?: number;
}) {
  const currency = input.currency === "USD" ? "USD" : "EUR";
  const amountCents = input.amountCents ?? input.eurCents ?? 0;
  const causal = `Zecca prelievo ${input.cashoutId.slice(0, 8)}`;
  const lines = [
    `Rete: ${walletNetworkLabel(input.network)}`,
    `Indirizzo: ${input.address}`,
    `Importo da inviare: ${formatFiatFromCents(amountCents, currency)} (o equivalente sulla rete)`,
    `Riferimento: ${causal}`,
  ];
  return { causal, text: lines.join("\n"), amountLabel: formatFiatFromCents(amountCents, currency) };
}

export function destinationInstruction(input: {
  payoutKind: string;
  holder: string | null;
  iban: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  currency?: string;
  eurCents: number;
  usdCents?: number;
  cashoutId: string;
}) {
  const currency = input.currency === "USD" ? "USD" : "EUR";
  const amountCents = currency === "USD" ? (input.usdCents ?? 0) : input.eurCents;
  if (input.payoutKind === "WALLET" && input.walletAddress) {
    return {
      kind: "WALLET" as const,
      ...walletInstruction({
        network: input.walletNetwork ?? "OTHER",
        address: input.walletAddress,
        amountCents,
        currency,
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
        amountCents,
        currency,
        cashoutId: input.cashoutId,
      }),
      ibanDisplay: formatIbanDisplay(input.iban),
      amountLabel: formatCashoutValue({
        currency,
        eurCents: input.eurCents,
        usdCents: input.usdCents ?? 0,
      }),
    };
  }
  return null;
}
