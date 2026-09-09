import { createHmac } from "node:crypto";
import { explorerUrl, isValidTxHash } from "@/lib/receipt";
import type {
  CryptoInstruction,
  FiatInstruction,
  SettlementFetch,
  SettlementResult,
  ProviderHealth,
} from "@/lib/settlement/types";

export function liquidityGatewayConfig() {
  const url = process.env.ZECCA_LIQUIDITY_URL?.trim().replace(/\/$/, "");
  const token = process.env.ZECCA_LIQUIDITY_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

export function sepaGatewayConfig() {
  const url = process.env.ZECCA_SEPA_GATEWAY_URL?.trim().replace(/\/$/, "");
  const token = process.env.ZECCA_SEPA_GATEWAY_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

export function liquidityHealth(): ProviderHealth {
  const cfg = liquidityGatewayConfig();
  return {
    id: "liquidity",
    label: "Liquidity / clearing (BTC, ETH, BNB nativi)",
    rails: ["BTC", "ETH", "BNB"],
    ready: Boolean(cfg),
    detail: cfg
      ? `Gateway ${cfg.url}`
      : "ZECCA_LIQUIDITY_URL e ZECCA_LIQUIDITY_TOKEN assenti. Senza clearing istituzionale i nativi restano in coda, senza hash inventato.",
  };
}

export function sepaGatewayHealth(): ProviderHealth {
  const cfg = sepaGatewayConfig();
  return {
    id: "sepa",
    label: "SEPA Instant / BaaS (UniCredit EUR)",
    rails: ["EUR"],
    ready: Boolean(cfg),
    detail: cfg
      ? `Gateway ${cfg.url}`
      : "ZECCA_SEPA_GATEWAY_URL e ZECCA_SEPA_GATEWAY_TOKEN assenti. Il pain.001 resta distinta, non un TRN.",
  };
}

function signBody(token: string, body: string) {
  return createHmac("sha256", token).update(body).digest("hex");
}

async function postJson(
  cfg: { url: string; token: string },
  path: string,
  payload: unknown,
  fetchImpl: SettlementFetch,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const body = JSON.stringify(payload);
  try {
    const res = await fetchImpl(`${cfg.url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        "X-Zecca-Signature": signBody(cfg.token, body),
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

function readString(json: Record<string, unknown> | null, keys: string[]) {
  if (!json) return null;
  for (const key of keys) {
    const value = json[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function executeLiquidityDisbursal(
  input: CryptoInstruction,
  fetchImpl: SettlementFetch = fetch,
): Promise<SettlementResult> {
  const cfg = liquidityGatewayConfig();
  if (!cfg) {
    return {
      status: "DEFERRED",
      provider: "liquidity",
      code: "LIQUIDITY_NOT_CONFIGURED",
      reason:
        "Nessun liquidity provider: imposta ZECCA_LIQUIDITY_URL. BTC/ETH/BNB nativi non si coniano dal libro.",
    };
  }
  const posted = await postJson(
    cfg,
    "/v1/disburse",
    {
      asset: input.asset,
      destination: input.destination,
      amountUsdCents: input.usdCents,
      idempotencyKey: input.idempotencyKey,
    },
    fetchImpl,
  );
  if (!posted.ok) {
    return {
      status: "DEFERRED",
      provider: "liquidity",
      code: "LIQUIDITY_REJECTED",
      reason: `Liquidity provider HTTP ${posted.status || "down"}. Nessun tx_hash inventato.`,
    };
  }
  const hash = readString(posted.json, ["tx_hash", "txHash", "hash"]);
  if (hash && isValidTxHash(hash, input.asset)) {
    return {
      status: "EXECUTED",
      provider: "liquidity",
      proofKind: "TX_HASH",
      ref: hash,
      url: explorerUrl(input.asset, hash),
      signer: cfg.url,
    };
  }
  const providerId = readString(posted.json, ["id", "disbursalId", "requestId"]);
  if (providerId) {
    return {
      status: "DISPATCHED",
      provider: "liquidity",
      proofKind: "PROVIDER_REF",
      ref: providerId,
      url: null,
      signer: cfg.url,
    };
  }
  return {
    status: "DEFERRED",
    provider: "liquidity",
    code: "LIQUIDITY_NO_PROOF",
    reason: "Il provider ha risposto senza tx_hash verificabile.",
  };
}

export async function executeSepaDisbursal(
  input: FiatInstruction,
  fetchImpl: SettlementFetch = fetch,
): Promise<SettlementResult> {
  const cfg = sepaGatewayConfig();
  if (!cfg) {
    return {
      status: "DEFERRED",
      provider: "sepa",
      code: "SEPA_NOT_CONFIGURED",
      reason:
        "Nessun gateway BaaS/SEPA Instant: imposta ZECCA_SEPA_GATEWAY_URL. UniCredit non è raggiungibile da questo processo.",
    };
  }
  const posted = await postJson(
    cfg,
    "/v1/payments",
    {
      currency: input.currency,
      iban: input.iban,
      holder: input.holder,
      amountCents: input.amountCents,
      endToEndId: input.reference,
      idempotencyKey: input.idempotencyKey,
      instant: true,
      scheme: "SEPA_INSTANT",
      priority: "INSTANT",
    },
    fetchImpl,
  );
  if (!posted.ok) {
    return {
      status: "DEFERRED",
      provider: "sepa",
      code: "SEPA_REJECTED",
      reason: `Gateway SEPA HTTP ${posted.status || "down"}. Nessun TRN inventato.`,
    };
  }
  const trn = readString(posted.json, ["trn", "cro", "endToEndId", "paymentId", "id"]);
  if (trn && !/^ZECCA\//i.test(trn)) {
    return {
      status: "EXECUTED",
      provider: "sepa",
      proofKind: "BANK_REF",
      ref: trn,
      url: null,
      signer: cfg.url,
    };
  }
  return {
    status: "DEFERRED",
    provider: "sepa",
    code: "SEPA_NO_TRN",
    reason: "Il gateway SEPA non ha restituito un TRN/CRO bancario.",
  };
}
