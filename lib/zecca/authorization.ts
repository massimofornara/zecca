import { createHmac } from "node:crypto";
import { officialReceiptHash, zeccaSettlementRef } from "@/lib/official-receipt";
import { buildPain001Document, sepaDebtorConfig } from "@/lib/zecca/pain001";
import { parseFiatCurrency } from "@/lib/zecca/fiat";

export const AUTHORIZED_RECEIPT_KIND = "AUTHORIZED_PENDING_GATEWAY";
export const READY_FOR_SIGNATURE_KIND = "READY_FOR_SIGNATURE";
export const LEGACY_QUEUED_KIND = "QUEUED_FOR_SETTLEMENT";

export function isAuthorizedReceiptKind(kind: string | null | undefined) {
  return (
    kind === AUTHORIZED_RECEIPT_KIND ||
    kind === READY_FOR_SIGNATURE_KIND ||
    kind === LEGACY_QUEUED_KIND
  );
}

function signingSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  return "zecca-demo-secret-cambia-in-produzione-32ch";
}

export function hmacBookAuthorization(canonical: string) {
  return createHmac("sha256", signingSecret()).update(canonical, "utf8").digest("hex");
}

export function authorizeCashoutInstruction(input: {
  cashoutId: string;
  credits: number;
  currency: string;
  eurCents: number;
  usdCents: number;
  chfCents: number;
  payoutKind: string;
  destination: string;
  rail: string;
  resolvedAt: Date;
  iban?: string | null;
  holder?: string | null;
}) {
  const receiptRef = zeccaSettlementRef(input.cashoutId, input.rail, input.resolvedAt);
  const documentHash = officialReceiptHash({
    cashoutId: input.cashoutId,
    credits: input.credits,
    currency: input.currency,
    eurCents: input.eurCents,
    usdCents: input.usdCents,
    chfCents: input.chfCents,
    payoutKind: input.payoutKind,
    destination: input.destination,
    receiptRef,
    resolvedAt: input.resolvedAt.toISOString(),
  });
  const signature = hmacBookAuthorization(`${documentHash}|${receiptRef}|${input.cashoutId}`);
  const currency = parseFiatCurrency(input.currency);
  const receiptKind =
    input.payoutKind === "IBAN" && currency === "EUR"
      ? READY_FOR_SIGNATURE_KIND
      : AUTHORIZED_RECEIPT_KIND;

  let painSha: string | null = null;
  const debtor = sepaDebtorConfig();
  if (receiptKind === READY_FOR_SIGNATURE_KIND && debtor && input.iban && input.holder) {
    const xml = buildPain001Document({
      debtor,
      credits: [
        {
          endToEndId: receiptRef.slice(0, 35),
          amountCents: input.eurCents,
          currency: "EUR",
          creditorName: input.holder,
          creditorIban: input.iban,
          remittance: `Zecca ${input.cashoutId}`,
        },
      ],
      createdAt: input.resolvedAt,
    });
    painSha = hmacBookAuthorization(xml);
  }

  return {
    receiptKind,
    receiptRef,
    receiptHash: documentHash,
    signature,
    painSha,
    adminNote:
      receiptKind === READY_FOR_SIGNATURE_KIND
        ? `READY_FOR_SIGNATURE · ISO 20022 pain.001${painSha ? ` HMAC ${painSha.slice(0, 12)}…` : " (manca ZECCA_SEPA_DEBTOR_IBAN)"}. Clearing solo con API BaaS/QWAC.`
        : `AUTHORIZED_PENDING_GATEWAY · istruzione firmata HMAC ${signature.slice(0, 12)}…. Niente CRO e niente tx_hash inventati.`,
  };
}
