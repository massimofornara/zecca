import { wiseApiConfig, type WiseDispatchResult } from "@/lib/zecca/wise-dispatch";
import type { FiatInstruction, ProviderHealth, SettlementFetch, SettlementResult } from "@/lib/settlement/types";

export function wiseHealth(): ProviderHealth {
  const cfg = wiseApiConfig();
  const recipientUsd = process.env.WISE_USD_RECIPIENT_ID?.trim();
  const recipientChf = process.env.WISE_CHF_RECIPIENT_ID?.trim();
  const ready = Boolean(cfg && (recipientUsd || recipientChf));
  return {
    id: "wise",
    label: "Wise Platform (USD / CHF)",
    rails: ["USD", "CHF"],
    ready,
    detail: cfg
      ? ready
        ? `Profilo ${cfg.profileId}`
        : "Token Wise presente, mancano WISE_USD_RECIPIENT_ID / WISE_CHF_RECIPIENT_ID."
      : "WISE_API_TOKEN e WISE_PROFILE_ID assenti.",
  };
}

function recipientId(currency: "USD" | "CHF") {
  return (currency === "USD" ? process.env.WISE_USD_RECIPIENT_ID : process.env.WISE_CHF_RECIPIENT_ID)?.trim() || null;
}

async function wiseJson(
  path: string,
  init: RequestInit,
  fetchImpl: SettlementFetch,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const cfg = wiseApiConfig();
  if (!cfg) return { ok: false, status: 0, json: null };
  try {
    const res = await fetchImpl(`${cfg.host}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

/**
 * Quote → transfer → fund sul saldo Wise.
 * Senza token o recipient ID non parte nulla e non si inventa un ID.
 */
export async function executeWisePlatformTransfer(
  input: FiatInstruction,
  fetchImpl: SettlementFetch = fetch,
): Promise<SettlementResult> {
  const cfg = wiseApiConfig();
  if (!cfg) {
    return {
      status: "DEFERRED",
      provider: "wise",
      code: "WISE_NOT_CONFIGURED",
      reason: "Wise Platform non collegato (WISE_API_TOKEN / WISE_PROFILE_ID).",
    };
  }
  if (input.currency !== "USD" && input.currency !== "CHF") {
    return {
      status: "DEFERRED",
      provider: "wise",
      code: "WISE_CURRENCY",
      reason: "Wise gestisce USD e CHF. L’EUR va sul binario SEPA.",
    };
  }
  const targetAccount = recipientId(input.currency);
  if (!targetAccount) {
    return {
      status: "DEFERRED",
      provider: "wise",
      code: "WISE_RECIPIENT_MISSING",
      reason: `Manca WISE_${input.currency}_RECIPIENT_ID. Il token da solo non dispone il bonifico.`,
    };
  }

  const sourceCurrency = (process.env.WISE_SOURCE_CURRENCY?.trim() || "EUR").toUpperCase();
  const quote = await wiseJson(
    `/v3/profiles/${cfg.profileId}/quotes`,
    {
      method: "POST",
      body: JSON.stringify({
        sourceCurrency,
        targetCurrency: input.currency,
        targetAmount: input.amountCents / 100,
        targetAccount,
        payOut: "BANK_TRANSFER",
        preferredPayIn: "BALANCE",
      }),
    },
    fetchImpl,
  );
  const quoteId =
    (typeof quote.json?.id === "string" && quote.json.id) ||
    (typeof quote.json?.quoteId === "string" && quote.json.quoteId) ||
    null;
  if (!quote.ok || !quoteId) {
    return {
      status: "DEFERRED",
      provider: "wise",
      code: "WISE_QUOTE_FAILED",
      reason: `Wise quote HTTP ${quote.status || "down"}. Nessun ID inventato.`,
    };
  }

  const transfer = await wiseJson(
    "/v1/transfers",
    {
      method: "POST",
      body: JSON.stringify({
        targetAccount,
        quoteUuid: quoteId,
        customerTransactionId: input.idempotencyKey.slice(0, 36),
        details: { reference: input.reference.slice(0, 35), transferPurpose: "verification.transfers.purpose.other" },
      }),
    },
    fetchImpl,
  );
  const transferId = typeof transfer.json?.id === "number" || typeof transfer.json?.id === "string"
    ? String(transfer.json.id)
    : null;
  if (!transfer.ok || !transferId) {
    return {
      status: "DEFERRED",
      provider: "wise",
      code: "WISE_TRANSFER_FAILED",
      reason: `Wise transfer HTTP ${transfer.status || "down"}. Nessun ID inventato.`,
    };
  }

  const funded = await wiseJson(
    `/v3/profiles/${cfg.profileId}/transfers/${transferId}/payments`,
    {
      method: "POST",
      body: JSON.stringify({ type: "BALANCE" }),
    },
    fetchImpl,
  );
  if (!funded.ok) {
    return {
      status: "DISPATCHED",
      provider: "wise",
      proofKind: "PROVIDER_REF",
      ref: transferId,
      url: null,
      signer: cfg.host,
    };
  }

  return {
    status: "EXECUTED",
    provider: "wise",
    proofKind: "BANK_REF",
    ref: transferId,
    url: null,
    signer: cfg.host,
  };
}

export function wiseResultFromPlatform(result: SettlementResult): WiseDispatchResult | null {
  if (result.status === "EXECUTED") return { ok: true, transferId: result.ref };
  if (result.status === "DISPATCHED") {
    return { ok: false, code: result.proofKind, message: `Wise preso in carico ${result.ref}, fondo non confermato.` };
  }
  return { ok: false, code: result.code, message: result.reason };
}
