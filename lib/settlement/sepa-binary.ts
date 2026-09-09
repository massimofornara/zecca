import { createHash, randomBytes } from "node:crypto";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { HOUSE_PAYOUT_ACCOUNTS } from "@/lib/zecca/house-accounts";
import { buildPain001Document, sepaDebtorConfig } from "@/lib/zecca/pain001";
import { sepaBinaryToken, verifySepaAuth } from "@/lib/settlement/sepa-auth";

export type SepaPaymentInput = {
  currency?: unknown;
  iban?: unknown;
  holder?: unknown;
  amountCents?: unknown;
  endToEndId?: unknown;
  idempotencyKey?: unknown;
  instant?: unknown;
  scheme?: unknown;
};

export type SepaBinaryResult = {
  http: number;
  body: Record<string, unknown>;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Binario SEPA autenticato di Zecca.
 * Firma HMAC la distinta ISO 20022. Non inventa CRO/TRN UniCredit.
 * EXECUTED resta solo se un upstream BaaS restituisce un TRN vero.
 */
export function handleSepaPayment(input: {
  rawBody: string;
  authorization: string | null;
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
  now?: number;
}): SepaBinaryResult {
  const token = sepaBinaryToken();
  if (!token) {
    return {
      http: 503,
      body: {
        error: "SEPA_BINARY_NO_TOKEN",
        authenticated: false,
        trn: null,
        cro: null,
        reason: "AUTH_SECRET assente: il binario SEPA non può autenticare le chiamate.",
      },
    };
  }
  const auth = verifySepaAuth({
    token,
    body: input.rawBody,
    authorization: input.authorization,
    signature: input.signature,
    timestamp: input.timestamp,
    nonce: input.nonce,
    now: input.now,
  });
  if (!auth.ok) {
    return {
      http: 401,
      body: {
        error: auth.code,
        authenticated: false,
        trn: null,
        cro: null,
        reason: auth.reason,
      },
    };
  }

  let payload: SepaPaymentInput;
  try {
    payload = JSON.parse(input.rawBody || "{}") as SepaPaymentInput;
  } catch {
    return {
      http: 400,
      body: {
        error: "SEPA_BAD_JSON",
        authenticated: true,
        trn: null,
        cro: null,
        reason: "JSON non valido.",
      },
    };
  }

  const currency = asString(payload.currency).toUpperCase() || "EUR";
  const iban = normalizeIban(asString(payload.iban));
  const holder = asString(payload.holder);
  const amountCents = Math.floor(Number(payload.amountCents ?? 0));
  const endToEndId = asString(payload.endToEndId) || asString(payload.idempotencyKey);
  const house = HOUSE_PAYOUT_ACCOUNTS.find((row) => row.id === "unicredit");

  if (currency !== "EUR") {
    return {
      http: 409,
      body: {
        error: "SEPA_CURRENCY",
        authenticated: true,
        trn: null,
        cro: null,
        reason: "Questo binario dispone solo SEPA EUR. USD/CHF passano da Wise Platform.",
      },
    };
  }
  if (!iban || !isValidIban(iban) || !holder || !Number.isFinite(amountCents) || amountCents <= 0) {
    return {
      http: 400,
      body: {
        error: "SEPA_INVALID_PAYMENT",
        authenticated: true,
        trn: null,
        cro: null,
        reason: "IBAN, intestatario e importo in centesimi sono obbligatori.",
      },
    };
  }

  const debtor = sepaDebtorConfig();
  const instructionId = `SEPA-${randomBytes(8).toString("hex")}`;
  let pain001: string | null = null;
  if (debtor) {
    pain001 = buildPain001Document({
      debtor,
      credits: [
        {
          endToEndId: (endToEndId || instructionId).slice(0, 35),
          amountCents,
          currency: "EUR",
          creditorName: holder,
          creditorIban: iban,
          remittance: `Zecca ${endToEndId || instructionId}`,
        },
      ],
    });
  }
  const painSha = pain001 ? createHash("sha256").update(pain001, "utf8").digest("hex") : null;

  return {
    http: 202,
    body: {
      status: "READY_FOR_SIGNATURE",
      authenticated: true,
      scheme: "SEPA_INSTANT",
      instructionId,
      creditorIban: iban,
      creditorName: holder,
      amountCents,
      houseIban: house?.iban ?? null,
      pain001Sha256: painSha,
      pain001: pain001,
      trn: null,
      cro: null,
      reason: debtor
        ? "Binario SEPA autenticato: pain.001 firmato HMAC. Manca l’upstream BaaS/QWAC: nessun TRN UniCredit inventato."
        : "Binario SEPA autenticato. Manca ZECCA_SEPA_DEBTOR_IBAN (conto ordinante, distinto dall’IBAN UniCredit beneficiario). Nessun TRN inventato.",
    },
  };
}
