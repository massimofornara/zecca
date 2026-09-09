import { createHmac, timingSafeEqual } from "node:crypto";
import { publicOrigin } from "@/lib/public-url";

const TOKEN_CONTEXT = "zecca-sepa-binary-v1";
const MAX_SKEW_MS = 5 * 60 * 1000;

export function sepaBinaryToken(): string | null {
  const explicit = process.env.ZECCA_SEPA_GATEWAY_TOKEN?.trim();
  if (explicit) return explicit;
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  return createHmac("sha256", secret).update(TOKEN_CONTEXT).digest("hex");
}

export function sepaBinaryEnabled() {
  if (process.env.ZECCA_SEPA_BINARY === "0") return false;
  if (process.env.ZECCA_SEPA_BINARY === "1") return true;
  return process.env.VERCEL_ENV === "production";
}

/** Origine del binario SEPA di Zecca (stesso deploy). */
export function sepaBinaryOrigin() {
  return publicOrigin() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
}

export function signSepaBody(token: string, body: string) {
  return createHmac("sha256", token).update(body).digest("hex");
}

export function signSepaRequest(token: string, body: string, timestamp: string, nonce: string) {
  return createHmac("sha256", token).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

function equalHex(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifySepaAuth(input: {
  token: string;
  body: string;
  authorization: string | null;
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
  now?: number;
}): { ok: true } | { ok: false; code: string; reason: string } {
  const header = (input.authorization ?? "").trim();
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!bearer || !equalHex(bearer, input.token)) {
    return { ok: false, code: "SEPA_AUTH", reason: "Bearer token non valido." };
  }
  const signature = (input.signature ?? "").trim().toLowerCase();
  if (!signature) {
    return { ok: false, code: "SEPA_AUTH", reason: "Manca X-Zecca-Signature." };
  }
  const timestamp = (input.timestamp ?? "").trim();
  const nonce = (input.nonce ?? "").trim();
  if (timestamp && nonce) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      return { ok: false, code: "SEPA_AUTH", reason: "Timestamp non numerico." };
    }
    const now = input.now ?? Date.now();
    if (Math.abs(now - ts) > MAX_SKEW_MS) {
      return { ok: false, code: "SEPA_AUTH", reason: "Timestamp fuori finestra (5 minuti)." };
    }
    const expected = signSepaRequest(input.token, input.body, timestamp, nonce);
    if (!equalHex(signature, expected)) {
      return { ok: false, code: "SEPA_AUTH", reason: "HMAC richiesta non valida." };
    }
    return { ok: true };
  }
  const expectedBody = signSepaBody(input.token, input.body);
  if (!equalHex(signature, expectedBody)) {
    return { ok: false, code: "SEPA_AUTH", reason: "HMAC del body non valida." };
  }
  return { ok: true };
}

export function sepaAuthHeaders(token: string, body: string) {
  const timestamp = String(Date.now());
  const nonce = createHmac("sha256", token).update(`${timestamp}:${body.length}`).digest("hex").slice(0, 32);
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Zecca-Signature": signSepaRequest(token, body, timestamp, nonce),
    "X-Zecca-Timestamp": timestamp,
    "X-Zecca-Nonce": nonce,
  };
}
