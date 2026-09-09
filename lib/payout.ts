import { formatCashoutValue, formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { cryptoTicker, walletNetworkLabel } from "@/lib/wallet";
import { sepaInstruction } from "@/lib/sepa";
import { parseFiatCurrency, type FiatCurrency } from "@/lib/zecca/fiat";

export function walletInstruction(input: {
  network: string;
  address: string;
  amountCents: number;
  currency?: FiatCurrency | string;
  cashoutId: string;
  eurCents?: number;
}) {
  const currency = parseFiatCurrency(input.currency);
  const amountCents = input.amountCents ?? input.eurCents ?? 0;
  const ticker = cryptoTicker(input.network);
  const amountLabel = `${formatFiatFromCents(amountCents, currency === "CHF" ? "USD" : currency)} in ${ticker}`;
  const causal = `Zecca prelievo ${input.cashoutId.slice(0, 8)}`;
  const lines = [
    `Crypto: ${walletNetworkLabel(input.network)} (${ticker})`,
    `Indirizzo: ${input.address}`,
    `Importo che il negozio invia: ${amountLabel} (o equivalente sulla rete)`,
    `Chi riceve non firma: MetaMask, Trust Wallet o exchange solo ricevono.`,
    `Riferimento: ${causal}`,
  ];
  return { causal, text: lines.join("\n"), amountLabel };
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
  chfCents?: number;
  cashoutId: string;
}) {
  const currency: FiatCurrency =
    input.payoutKind === "WALLET" && (input.usdCents ?? 0) > 0
      ? "USD"
      : parseFiatCurrency(input.currency);
  const amountCents =
    currency === "USD"
      ? (input.usdCents ?? 0)
      : currency === "CHF"
        ? (input.chfCents ?? 0)
        : input.eurCents;
  if (input.payoutKind === "WALLET" && input.walletAddress) {
    return {
      kind: "WALLET" as const,
      ...walletInstruction({
        network: input.walletNetwork ?? "OTHER",
        address: input.walletAddress,
        amountCents,
        currency: "USD",
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
        chfCents: input.chfCents ?? 0,
      }),
    };
  }
  return null;
}
