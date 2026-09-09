import { createHmac, timingSafeEqual } from "node:crypto";
import "@/lib/boot-env";

export type CashoutProof = {
  v: 1;
  id: string;
  userId: string;
  userName: string;
  credits: number;
  eurCents: number;
  usdCents: number;
  currency: string;
  payoutKind: string;
  iban: string | null;
  ibanHolder: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  receiptKind: string | null;
  receiptRef: string | null;
  receiptUrl: string | null;
  receiptHash: string | null;
  createdAt: string;
  resolvedAt: string;
  status: "PENDING" | "PAID" | "REJECTED";
  isTreasury?: boolean;
};

function signingSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  return "zecca-demo-secret-cambia-in-produzione-32ch";
}

function hmac(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function sameText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function proofFromPaidCashout(input: {
  id: string;
  userId: string | null;
  userName: string;
  credits: number;
  eurCents: number;
  usdCents: number;
  currency: string;
  payoutKind: string;
  iban: string | null;
  ibanHolder: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  receiptKind: string | null;
  receiptRef: string | null;
  receiptUrl: string | null;
  receiptHash: string | null;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
  status?: string | null;
  isTreasury?: boolean | null;
}): CashoutProof {
  const createdAt = input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt;
  const resolvedAt =
    input.resolvedAt instanceof Date
      ? input.resolvedAt.toISOString()
      : input.resolvedAt ?? createdAt;
  return {
    v: 1,
    id: input.id,
    userId: input.userId ?? "",
    userName: input.userName,
    credits: input.credits,
    eurCents: input.eurCents,
    usdCents: input.usdCents,
    currency: input.currency,
    payoutKind: input.payoutKind,
    iban: input.iban,
    ibanHolder: input.ibanHolder,
    walletAddress: input.walletAddress,
    walletNetwork: input.walletNetwork,
    receiptKind: input.receiptKind,
    receiptRef: input.receiptRef,
    receiptUrl: input.receiptUrl,
    receiptHash: input.receiptHash,
    createdAt,
    resolvedAt,
    status:
      input.status === "PENDING" || input.status === "REJECTED" || input.status === "PAID"
        ? input.status
        : input.receiptHash
          ? "PAID"
          : "PENDING",
    isTreasury: Boolean(input.isTreasury),
  };
}

export function signCashoutProof(proof: CashoutProof): string {
  const payload = Buffer.from(JSON.stringify(proof), "utf8").toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function verifyCashoutProof(token: string | null | undefined): CashoutProof | null {
  if (!token) return null;
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 8) return null;
  const payload = trimmed.slice(0, dot);
  const signature = trimmed.slice(dot + 1);
  if (!payload || !signature || !sameText(signature, hmac(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CashoutProof;
    if (parsed?.v !== 1 || !parsed.id || !parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cashoutProofStatus(proof: Pick<CashoutProof, "status" | "receiptHash">) {
  if (proof.status === "PENDING" || proof.status === "PAID" || proof.status === "REJECTED") {
    return proof.status;
  }
  return proof.receiptHash ? "PAID" : "PENDING";
}

export function receiptHref(cashoutId: string, proofToken?: string | null) {
  if (!proofToken) return `/ricevuta/${cashoutId}`;
  return `/ricevuta/${cashoutId}?p=${encodeURIComponent(proofToken)}`;
}
