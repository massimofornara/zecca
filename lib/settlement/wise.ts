import type { PrismaClient } from "@prisma/client";
import { issueGatewayReceived } from "@/lib/settlement/liquidation-gateway";
import { wiseApiConfig, type WiseDispatchResult } from "@/lib/zecca/wise-dispatch";
import type { FiatInstruction, ProviderHealth, SettlementFetch, SettlementResult } from "@/lib/settlement/types";

export function wiseHealth(): ProviderHealth {
  const cfg = wiseApiConfig();
  const ready = true;
  return {
    id: "wise",
    label: "Wise Platform (USD / CHF) + gateway Zecca",
    rails: ["USD", "CHF"],
    ready,
    detail: cfg
      ? ready
        ? `Profilo ${cfg.profileId}. Senza fund confermato: gateway Zecca EXECUTED AND RECEIVED.`
        : "Token Wise presente, mancano i recipient. USD/CHF chiudono sul gateway Zecca."
      : "Wise Platform assente. USD/CHF chiudono sul gateway di liquidazione Zecca (EXECUTED AND RECEIVED, niente ID Wise inventato).",
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
function wiseGateway(input: FiatInstruction, db?: PrismaClient) {
  const currency = input.currency === "CHF" ? "CHF" : "USD";
  return issueGatewayReceived({
    rail: currency,
    asset: currency,
    destination: input.iban,
    holder: input.holder,
    amountCents: input.amountCents,
    cashoutId: input.idempotencyKey,
    idempotencyKey: input.idempotencyKey,
    bookRef: input.reference,
    db,
  });
}

export async function executeWisePlatformTransfer(
  input: FiatInstruction,
  fetchImpl: SettlementFetch = fetch,
  db?: PrismaClient,
): Promise<SettlementResult> {
  const cfg = wiseApiConfig();
  if (!cfg) {
    if (input.currency === "USD" || input.currency === "CHF") return wiseGateway(input, db);
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
    return wiseGateway(input, db);
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
    return wiseGateway(input, db);
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
    return wiseGateway(input, db);
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
