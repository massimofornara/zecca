import { formatUsdcCents, percentFromBps, USDC_GAS_STATION_COPY, type UsdcWithdrawQuote } from "@/lib/zecca/forge-fees";

export function UsdcFeeBreakdown({
  quote,
  className = "mt-3 space-y-1 text-sm",
}: {
  quote: UsdcWithdrawQuote;
  className?: string;
}) {
  const percentLabel = percentFromBps(quote.bps).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <dl className={className}>
      <div className="flex flex-wrap justify-between gap-2">
        <dt className="text-muted-foreground">Lordo</dt>
        <dd className="font-ledger">{formatUsdcCents(quote.grossUsdCents)}</dd>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <dt className="text-muted-foreground">Commissione (resta nel SCA)</dt>
        <dd className="font-ledger">{formatUsdcCents(quote.feeUsdCents)}</dd>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatUsdcCents(quote.flatUsdCents)} fissa + {percentLabel}% ({formatUsdcCents(quote.percentFeeUsdCents)})
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <dt className="font-medium">Netto inviato</dt>
        <dd className="font-ledger text-ember">{formatUsdcCents(quote.netUsdCents)}</dd>
      </div>
      <p className="text-xs text-muted-foreground">{USDC_GAS_STATION_COPY}</p>
    </dl>
  );
}

export function UsdcGasStationNote({ className = "text-xs text-muted-foreground" }: { className?: string }) {
  return <p className={className}>{USDC_GAS_STATION_COPY}</p>;
}
