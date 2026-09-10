export const BPS_DENOMINATOR = 10_000;

export const USDC_GAS_STATION_COPY =
  "Il gas della transazione è sponsorizzato dal negozio tramite Circle Gas Station (addebitato sul conto Circle). La commissione di prelievo resta nella cassa Circle (SCA) e non viene inviata.";

export type ConversionSpread = {
  totalCredits: number;
  retainedCredits: number;
  convertedCredits: number;
  spreadBps: number;
};

export type UsdcWithdrawQuote = {
  grossUsdCents: number;
  flatUsdCents: number;
  bps: number;
  percentFeeUsdCents: number;
  feeUsdCents: number;
  netUsdCents: number;
};

export type UsdcFeeSettings = {
  usdcWithdrawFeeFlatCents: number;
  usdcWithdrawFeeBps: number;
};

export function clampBps(raw: number) {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(BPS_DENOMINATOR, Math.max(0, Math.floor(raw)));
}

export function bpsFromPercent(percent: number) {
  if (!Number.isFinite(percent)) return 0;
  return clampBps(Math.round(percent * 100));
}

export function percentFromBps(bps: number) {
  return clampBps(bps) / 100;
}

export function applyConversionSpread(credits: number, spreadBps: number): ConversionSpread {
  const totalCredits = Math.max(0, Math.floor(Number(credits) || 0));
  const bps = clampBps(spreadBps);
  const retainedCredits = Math.floor((totalCredits * bps) / BPS_DENOMINATOR);
  const convertedCredits = totalCredits - retainedCredits;
  return { totalCredits, retainedCredits, convertedCredits, spreadBps: bps };
}

export function quoteUsdcWithdrawFee(grossUsdCents: number, settings: UsdcFeeSettings): UsdcWithdrawQuote {
  const gross = Math.max(0, Math.floor(Number(grossUsdCents) || 0));
  const flatUsdCents = Math.max(0, Math.floor(Number(settings.usdcWithdrawFeeFlatCents) || 0));
  const bps = clampBps(settings.usdcWithdrawFeeBps);
  const percentFeeUsdCents = Math.floor((gross * bps) / BPS_DENOMINATOR);
  const feeUsdCents = Math.min(gross, flatUsdCents + percentFeeUsdCents);
  return {
    grossUsdCents: gross,
    flatUsdCents,
    bps,
    percentFeeUsdCents,
    feeUsdCents,
    netUsdCents: gross - feeUsdCents,
  };
}

export function usdcQuoteFromCashout(
  row: { usdCents: number; usdcFeeCents?: number | null; usdcNetCents?: number | null },
  settings: UsdcFeeSettings,
): UsdcWithdrawQuote {
  if (row.usdcNetCents != null && row.usdcNetCents >= 0) {
    const netUsdCents = Math.max(0, Math.floor(row.usdcNetCents));
    const feeUsdCents =
      row.usdcFeeCents != null
        ? Math.max(0, Math.floor(row.usdcFeeCents))
        : Math.max(0, Math.floor(row.usdCents) - netUsdCents);
    const quoted = quoteUsdcWithdrawFee(row.usdCents, settings);
    return {
      ...quoted,
      grossUsdCents: Math.max(0, Math.floor(row.usdCents)),
      feeUsdCents,
      netUsdCents,
    };
  }
  return quoteUsdcWithdrawFee(row.usdCents, settings);
}

/** Max gross/net such that net ≤ book and net ≤ chain − fee (fee stays in the SCA). */
export function maxUsdcNetSendable(
  bookUsdCents: number,
  chainUsdCents: number,
  settings: UsdcFeeSettings,
): UsdcWithdrawQuote {
  const book = Math.max(0, Math.floor(bookUsdCents));
  const chain = Math.max(0, Math.floor(chainUsdCents));
  let lo = 0;
  let hi = chain;
  let best = quoteUsdcWithdrawFee(0, settings);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const quoted = quoteUsdcWithdrawFee(mid, settings);
    const chainCap = Math.max(0, chain - quoted.feeUsdCents);
    if (quoted.netUsdCents > 0 && quoted.netUsdCents <= book && quoted.netUsdCents <= chainCap) {
      best = quoted;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function reservedUsdCentsForUsdcCashout(row: {
  usdCents: number;
  usdcNetCents?: number | null;
}) {
  if (row.usdcNetCents != null) return Math.max(0, Math.floor(row.usdcNetCents));
  return Math.max(0, Math.floor(row.usdCents));
}

export function formatUsdcCents(cents: number) {
  return `${(Math.max(0, cents) / 100).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
}

export function usdcFeeBreakdownLines(quote: UsdcWithdrawQuote) {
  const percentLabel = percentFromBps(quote.bps).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return [
    `Lordo ${formatUsdcCents(quote.grossUsdCents)}`,
    `Commissione ${formatUsdcCents(quote.flatUsdCents)} fissa + ${percentLabel}% (${formatUsdcCents(quote.percentFeeUsdCents)}) = ${formatUsdcCents(quote.feeUsdCents)} — resta nel SCA Circle, non viene trasferita`,
    `Netto inviato ${formatUsdcCents(quote.netUsdCents)}`,
    USDC_GAS_STATION_COPY,
  ];
}

export function spreadNote(spread: ConversionSpread, unit: string, cashLabel: string) {
  if (spread.retainedCredits <= 0) {
    return `Conversione tesoreria: ${spread.convertedCredits} cr → ${cashLabel}`;
  }
  const pct = percentFromBps(spread.spreadBps).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Conversione tesoreria: ${spread.totalCredits} cr richiesti, spread ${pct}% (${spread.retainedCredits} cr restano in tesoreria) → ${spread.convertedCredits} cr → ${cashLabel}. Lo spread è inventario di libro, non un movimento ${unit} on-chain.`;
}
