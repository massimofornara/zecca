import { constants, publicEncrypt, randomUUID } from "node:crypto";
import { ZeccaError } from "@/lib/errors";
import { CIRCLE_USDC_CHAIN } from "@/lib/settlement/circle-ref";

export { CIRCLE_USDC_CHAIN, isUsdcCashoutNetwork } from "@/lib/settlement/circle-ref";
export const CIRCLE_USDC_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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
  return Boolean(apiKey() && walletId());
}

export function circleHealth() {
  return {
    id: "circle-usdc",
    ready: circleConfigured(),
    chain: CIRCLE_USDC_CHAIN,
    detail: circleConfigured()
      ? `Wallet Circle ${walletId()} su Base. USDC parte solo se il saldo del wallet è sufficiente.`
      : "CIRCLE_API_KEY e CIRCLE_WALLET_ID assenti. Invia USDC resta fermo: Wallet negozio non configurato.",
  };
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

/**
 * Invia USDC nativo su Base dal wallet Circle del negozio.
 * Nessun segreto esce da questo modulo. Senza env: errore chiaro, niente hash inventato.
 */
export async function transferUsdcOnBase(input: {
  destination: string;
  amountUsdCents: number;
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
}): Promise<CircleTransferResult> {
  if (!circleConfigured()) {
    throw new ZeccaError("Wallet negozio non configurato.", "CIRCLE_NOT_CONFIGURED");
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const destination = input.destination.trim();
  const amount = amountUsd(input.amountUsdCents);
  const idempotencyKey = input.idempotencyKey.slice(0, 36);

  if (entitySecret()) {
    const ciphertext = await entitySecretCiphertext(fetchImpl);
    const tokenId = process.env.CIRCLE_USDC_TOKEN_ID?.trim();
    const body: Record<string, unknown> = {
      idempotencyKey,
      walletId: walletId(),
      destinationAddress: destination,
      amounts: [amount],
      feeLevel: "MEDIUM",
      entitySecretCiphertext: ciphertext,
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
    const txHash = readNestedString(posted.json, [
      ["data", "txHash"],
      ["data", "transactionHash"],
      ["data", "transaction", "txHash"],
    ]);
    if (!posted.ok || !id) {
      throw new ZeccaError(
        "Circle ha rifiutato l’invio USDC. Il wallet del negozio è configurato ma il trasferimento non è partito. La richiesta resta aperta.",
        "CIRCLE_REJECTED",
      );
    }
    return toResult(id, txHash);
  }

  const legacy = await circleJson(
    "/v1/transfers",
    {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        source: { type: "wallet", id: walletId() },
        destination: { type: "blockchain", address: destination, chain: CIRCLE_USDC_CHAIN },
        amount: { amount, currency: "USD" },
      }),
    },
    fetchImpl,
  );
  const id = readNestedString(legacy.json, [["data", "id"], ["id"]]) ?? "";
  const txHash = readNestedString(legacy.json, [
    ["data", "transactionHash"],
    ["data", "txHash"],
  ]);
  if (!legacy.ok || !id) {
    throw new ZeccaError(
      "Circle ha rifiutato l’invio USDC. Imposta anche CIRCLE_ENTITY_SECRET per i wallet developer-controlled, oppure verifica il saldo.",
      "CIRCLE_REJECTED",
    );
  }
  return toResult(id, txHash);
}

