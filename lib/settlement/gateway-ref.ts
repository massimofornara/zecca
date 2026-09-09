/** Predicati della ricevuta gateway: nessun Prisma, nessun filesystem. Sicuri nel bundle client. */

export const GATEWAY_RECEIVED_KIND = "GATEWAY_RECEIVED";

export function isGatewayReceiptRef(raw: string | null | undefined) {
  const ref = (raw ?? "").trim();
  return /^(GW-(BTC|SEPA|USD|CHF|EUR)-[a-f0-9]{8,}|SEPA-[a-f0-9]{8,})$/i.test(ref);
}

export function gatewayReceiptPath(id: string) {
  return `/ricevuta-gateway/${encodeURIComponent(id)}`;
}
