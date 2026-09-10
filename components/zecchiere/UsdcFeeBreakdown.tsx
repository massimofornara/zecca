import {
  USDC_GAS_STATION_COPY,
  usdcFeeBreakdownLines,
  type UsdcWithdrawQuote,
} from "@/lib/zecca/forge-fees";

export function UsdcFeeBreakdown({
  quote,
  className = "space-y-1 text-sm text-muted-foreground",
}: {
  quote: UsdcWithdrawQuote;
  className?: string;
}) {
  const lines = usdcFeeBreakdownLines(quote);
  return (
    <ul className={className}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export function UsdcGasStationNote({ className = "text-xs text-muted-foreground" }: { className?: string }) {
  return <p className={className}>{USDC_GAS_STATION_COPY}</p>;
}
