import { constants, createHash, publicEncrypt } from "node:crypto";
import { ZeccaError } from "@/lib/errors";
import {
  CIRCLE_SHOP_SCA_ADDRESS,
  CIRCLE_USDC_CHAIN,
  CIRCLE_USDC_TOKEN_ADDRESS,
} from "@/lib/settlement/circle-ref";

export {
  CIRCLE_SHOP_SCA_ADDRESS,
  CIRCLE_USDC_CHAIN,
  CIRCLE_USDC_TOKEN_ADDRESS,
  isCircleUsdcReceipt,
  isUsdcCashoutNetwork,
} from "@/lib/settlement/circle-ref";
export const CIRCLE_NOT_CONFIGURED_MESSAGE = "Wallet negozio non configurato.";

const FAILED_STATES = new Set(["FAILED", "DENIED", "CANCELLED"]);

export type CircleTransferResult = {
  provider: "circle";
  id: string;
  txHash: string | null;
  url: string | null;
};

function apiKey() {
  return process.env.CIRCLE_API_KEY?.trim() || null;
}

function walletId() {
  return process.env.CIRCLE_WALLET_ID?.trim() || null;
}

function entitySecret() {
  return process.env.CIRCLE_ENTITY_SECRET?.trim() || null;
}

function apiHost() {
  const explicit = process.env.CIRCLE_API_HOST?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const key = apiKey() ?? "";
  if (key.startsWith("TEST_API_KEY") || key.startsWith("SANDBOX")) {
    return "https://api-sandbox.circle.com";
  }
  return "https://api.circle.com";
}

export function circleConfigured() {
  return Boolean(apiKey() && walletId() && entitySecret());
}

export function circleHealth() {
  return {
    id: "circle-usdc",
    ready: circleConfigured(),
    chain: CIRCLE_USDC_CHAIN,
    detail: circleConfigured()
      ? `Wallet Circle SCA ${walletId()} su Base. USDC parte se il saldo USDC c’è. Il gas lo sponsorizza Gas Station (policy Base in Console), non il cliente.`
      : "Mancano CIRCLE_API_KEY, CIRCLE_WALLET_ID o CIRCLE_ENTITY_SECRET. USDC automatico fermo: Wallet negozio non configurato.",
  };
}

function idempotencyUuid(key: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    return key;
  }
  const hex = createHash("sha256").update(`zecca-circle:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function amountUsd(cents: number) {
  return (Math.max(0, Math.floor(cents)) / 100).toFixed(2);
}

function baseScanUrl(hash: string) {
  return `https://basescan.org/tx/${hash}`;
}

async function circleJson(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const key = apiKey();
  if (!key) return { ok: false, status: 0, json: null };
  try {
    const res = await fetchImpl(`${apiHost()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Request-Id": idempotencyUuid(`${path}:${Date.now()}`),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

function readNestedString(json: Record<string, unknown> | null, paths: string[][]) {
  if (!json) return null;
  for (const path of paths) {
    let cursor: unknown = json;
    for (const key of path) {
      if (!cursor || typeof cursor !== "object") {
        cursor = null;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (typeof cursor === "string" && cursor.trim()) return cursor.trim();
  }
  return null;
}

async function entitySecretCiphertext(fetchImpl: typeof fetch) {
  const secret = entitySecret();
  if (!secret) return null;
  const pub = await circleJson("/v2/w3s/config/entity/publicKey", { method: "GET" }, fetchImpl);
  const pem = readNestedString(pub.json, [["data", "publicKey"], ["publicKey"]]);
  if (!pub.ok || !pem) {
    throw new ZeccaError(
      "Circle ha rifiutato la chiave pubblica dell’entity secret. Controlla CIRCLE_API_KEY.",
      "CIRCLE_ENTITY",
    );
  }
  const material = /^[0-9a-fA-F]{64}$/.test(secret) ? Buffer.from(secret, "hex") : Buffer.from(secret, "utf8");
  return publicEncrypt(
    {
      key: pem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    material,
  ).toString("base64");
}

function toResult(id: string, txHash: string | null): CircleTransferResult {
  return {
    provider: "circle",
    id,
    txHash,
    url: txHash ? baseScanUrl(txHash) : null,
  };
}

function parseUsdCents(raw: string | null) {
  if (!raw) return null;
  const value = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export type CircleUsdcBalance = {
  usdCents: number;
  amountLabel: string;
  walletId: string;
  address: string;
};

function tokenLooksLikeUsdc(token: Record<string, unknown> | null | undefined) {
  if (!token) return false;
  const symbol = String(token.symbol ?? token.name ?? "").toUpperCase();
  const chain = String(token.blockchain ?? "").toUpperCase();
  const address = String(token.tokenAddress ?? token.address ?? "").toLowerCase();
  const expected = CIRCLE_USDC_TOKEN_ADDRESS.toLowerCase();
  if (address && address === expected) return true;
  if (symbol.includes("USDC") && (!chain || chain.includes("BASE"))) return true;
  return symbol === "USDC";
}

function readBalanceRows(json: Record<string, unknown> | null): { amount: string; token: Record<string, unknown> }[] {
  if (!json) return [];
  const data = (json.data ?? json) as Record<string, unknown>;
  const rows =
    (data.tokenBalances as unknown[]) ??
    (data.balances as unknown[]) ??
    (Array.isArray(data) ? data : []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const token = (record.token as Record<string, unknown> | undefined) ?? record;
      const amount = String(record.amount ?? record.available ?? record.balance ?? "");
      return { amount, token };
    })
    .filter((row): row is { amount: string; token: Record<string, unknown> } => Boolean(row));
}

/** Saldo USDC nativo Base del wallet SCA. Null se Circle non è configurato. */
export async function fetchCircleUsdcBalance(fetchImpl: typeof fetch = fetch): Promise<CircleUsdcBalance | null> {
  if (!circleConfigured()) return null;
  const id = walletId();
  if (!id) return null;
  const listed = await circleJson(`/v1/w3s/wallets/${id}/balances`, { method: "GET" }, fetchImpl);
  const rows = readBalanceRows(listed.json);
  let usdCents = 0;
  for (const row of rows) {
    if (!tokenLooksLikeUsdc(row.token)) continue;
    const cents = parseUsdCents(row.amount);
    if (cents != null) usdCents += cents;
  }
  return {
    usdCents,
    amountLabel: (usdCents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    walletId: id,
    address: process.env.CIRCLE_WALLET_ADDRESS?.trim() || CIRCLE_SHOP_SCA_ADDRESS,
  };
}

/**
 * Invia USDC nativo su Base dal wallet Circle SCA del negozio.
 * feeLevel MEDIUM: Circle stima il gas. Su SCA, se in Console c’è una policy Gas
 * Station di default su BASE, Circle sponsorizzata il gas in automatico: nessun
 * flag extra e nessun ETH nel wallet. Senza policy il transfer fallisce in chiaro.
 * Nessun segreto esce da questo modulo. Senza env: errore chiaro, niente hash inventato.
 */
export async function transferUsdcOnBase(input: {
  destination: string;
  amountUsdCents: number;
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
}): Promise<CircleTransferResult> {
  if (!circleConfigured()) {
    throw new ZeccaError(CIRCLE_NOT_CONFIGURED_MESSAGE, "CIRCLE_NOT_CONFIGURED");
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const destination = input.destination.trim();
  const amount = amountUsd(input.amountUsdCents);
  const idempotencyKey = idempotencyUuid(input.idempotencyKey);
  const ciphertext = await entitySecretCiphertext(fetchImpl);
  if (!ciphertext) {
    throw new ZeccaError(CIRCLE_NOT_CONFIGURED_MESSAGE, "CIRCLE_NOT_CONFIGURED");
  }
  const tokenId = process.env.CIRCLE_USDC_TOKEN_ID?.trim();
  const body: Record<string, unknown> = {
    idempotencyKey,
    walletId: walletId(),
    destinationAddress: destination,
    amounts: [amount],
    feeLevel: "MEDIUM",
    entitySecretCiphertext: ciphertext,
    refId: `zecca-usdc-${input.idempotencyKey.slice(0, 24)}`,
  };
  if (tokenId) {
    body.tokenId = tokenId;
  } else {
    body.blockchain = CIRCLE_USDC_CHAIN;
    body.tokenAddress = process.env.CIRCLE_USDC_TOKEN_ADDRESS?.trim() || CIRCLE_USDC_TOKEN_ADDRESS;
  }
  const posted = await circleJson(
    "/v1/w3s/developer/transactions/transfer",
    { method: "POST", body: JSON.stringify(body) },
    fetchImpl,
  );
  const id =
    readNestedString(posted.json, [["data", "id"], ["data", "transaction", "id"], ["id"]]) ?? "";
  const state = (
    readNestedString(posted.json, [["data", "state"], ["data", "transaction", "state"], ["state"]]) ?? ""
  ).toUpperCase();
  const txHash = readNestedString(posted.json, [
    ["data", "txHash"],
    ["data", "transactionHash"],
    ["data", "transaction", "txHash"],
  ]);
  if (!posted.ok || !id || FAILED_STATES.has(state)) {
    const apiMessage = readNestedString(posted.json, [["message"], ["data", "message"]]);
    throw new ZeccaError(
      apiMessage
        ? `Circle ha rifiutato l’invio USDC: ${apiMessage} La richiesta resta aperta.`
        : "Circle ha rifiutato l’invio USDC. Controlla il saldo USDC sul wallet SCA e la policy Gas Station su Base in Console. La richiesta resta aperta.",
      "CIRCLE_REJECTED",
    );
  }
  const hash = txHash && /^0x[a-fA-F0-9]{64}$/i.test(txHash) ? txHash : null;
  return toResult(id, hash);
}

