import { createHash } from "node:crypto";

export function officialReceiptHash(payload: {
  cashoutId: string;
  credits: number;
  currency: string;
  eurCents: number;
  usdCents: number;
  chfCents?: number;
  payoutKind: string;
  destination: string;
  receiptRef: string;
  resolvedAt: string;
}) {
  const canonical = [
    payload.cashoutId,
    String(payload.credits),
    payload.currency,
    String(payload.eurCents),
    String(payload.usdCents),
    ...(payload.currency === "CHF" ? [String(payload.chfCents ?? 0)] : []),
    payload.payoutKind,
    payload.destination,
    payload.receiptRef,
    payload.resolvedAt,
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function sepaEndToEndId(cashoutId: string, currency: string, at = new Date()) {
  const day = at.toISOString().slice(0, 10).replaceAll("-", "");
  return `ZECCA/${currency}/${day}/${cashoutId.slice(0, 8).toUpperCase()}`;
}
