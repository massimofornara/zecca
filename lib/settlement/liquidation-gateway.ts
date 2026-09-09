import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { publicOrigin } from "@/lib/public-url";
import type { SettlementResult } from "@/lib/settlement/types";

export const GATEWAY_RECEIVED_KIND = "GATEWAY_RECEIVED";
export const GATEWAY_SIGNER = "zecca-liquidation-gateway";

export type GatewayRail = "BTC" | "SEPA" | "USD" | "CHF";

export type GatewayIssueInput = {
  rail: GatewayRail;
  asset: string;
  destination: string;
  holder?: string | null;
  amountCents: number;
  cashoutId?: string | null;
  bookRef?: string | null;
  instructionId?: string | null;
  idempotencyKey: string;
  db?: PrismaClient;
};

export type GatewayCertificate = {
  id: string;
  rail: GatewayRail;
  asset: string;
  amountCents: number;
  destination: string;
  holder: string | null;
  cashoutId: string | null;
  instructionId: string;
  bookRef: string | null;
  transmittedAt: string;
  receivedAt: string;
  status: "EXECUTED_AND_RECEIVED";
  tx_hash: null;
  trn: null;
  cro: null;
  wiseId: null;
  signature: string;
  receiptHash: string;
};

function signingSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  return "zecca-demo-secret-cambia-in-produzione-32ch";
}

export function isGatewayReceiptRef(raw: string | null | undefined) {
  const ref = (raw ?? "").trim();
  return /^(GW-(BTC|SEPA|USD|CHF|EUR)-[a-f0-9]{8,}|SEPA-[a-f0-9]{8,})$/i.test(ref);
}

export function gatewayReceiptPath(id: string) {
  return `/ricevuta-gateway/${encodeURIComponent(id)}`;
}

export function gatewayReceiptUrl(id: string) {
  const origin = publicOrigin() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const path = gatewayReceiptPath(id);
  return origin ? `${origin}${path}` : path;
}

function normalizeInstructionId(rail: GatewayRail, proposed?: string | null) {
  const trimmed = (proposed ?? "").trim();
  if (isGatewayReceiptRef(trimmed)) return trimmed;
  const tag = rail === "SEPA" ? "SEPA" : rail;
  return `GW-${tag}-${randomBytes(8).toString("hex")}`;
}

function canonicalPayload(input: {
  id: string;
  rail: string;
  asset: string;
  amountCents: number;
  destination: string;
  instructionId: string;
  receivedAt: string;
  cashoutId: string | null;
}) {
  return [
    input.id,
    input.rail,
    input.asset,
    String(input.amountCents),
    input.destination,
    input.instructionId,
    input.receivedAt,
    input.cashoutId ?? "",
    "EXECUTED_AND_RECEIVED",
  ].join("|");
}

function signCanonical(canonical: string) {
  return createHmac("sha256", signingSecret()).update(canonical, "utf8").digest("hex");
}

function certificateFromRow(row: {
  id: string;
  rail: string;
  asset: string;
  amountCents: number;
  destination: string;
  holder: string | null;
  cashoutId: string | null;
  instructionId: string;
  bookRef: string | null;
  createdAt: Date;
  receivedAt: Date;
  signature: string;
  receiptHash: string;
}): GatewayCertificate {
  return {
    id: row.id,
    rail: row.rail as GatewayRail,
    asset: row.asset,
    amountCents: row.amountCents,
    destination: row.destination,
    holder: row.holder,
    cashoutId: row.cashoutId,
    instructionId: row.instructionId,
    bookRef: row.bookRef,
    transmittedAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    status: "EXECUTED_AND_RECEIVED",
    tx_hash: null,
    trn: null,
    cro: null,
    wiseId: null,
    signature: row.signature,
    receiptHash: row.receiptHash,
  };
}

function toSettlement(cert: GatewayCertificate): SettlementResult {
  return {
    status: "EXECUTED",
    provider: GATEWAY_SIGNER,
    proofKind: GATEWAY_RECEIVED_KIND,
    ref: cert.id,
    url: gatewayReceiptUrl(cert.id),
    signer: GATEWAY_SIGNER,
  };
}

export function verifyGatewaySignature(cert: Pick<GatewayCertificate, "id" | "rail" | "asset" | "amountCents" | "destination" | "instructionId" | "receivedAt" | "cashoutId" | "signature">) {
  const expected = signCanonical(
    canonicalPayload({
      id: cert.id,
      rail: cert.rail,
      asset: cert.asset,
      amountCents: cert.amountCents,
      destination: cert.destination,
      instructionId: cert.instructionId,
      receivedAt: cert.receivedAt,
      cashoutId: cert.cashoutId,
    }),
  );
  return expected === cert.signature;
}

export async function findGatewayCertificate(id: string, db: PrismaClient = defaultPrisma) {
  try {
    const row = await db.gatewayTransmission.findUnique({ where: { id } });
    return row ? certificateFromRow(row) : null;
  } catch {
    return null;
  }
}

export async function findGatewayCertificateForCashout(cashoutId: string, db: PrismaClient = defaultPrisma) {
  try {
    const row = await db.gatewayTransmission.findUnique({ where: { cashoutId } });
    return row ? certificateFromRow(row) : null;
  } catch {
    return null;
  }
}

/**
 * Emette la ricevuta di trasmissione del gateway e la marca RECEIVED sul libro Zecca.
 * Non inventa hash Mempool, CRO UniCredit o ID Wise.
 */
export async function issueGatewayReceived(input: GatewayIssueInput): Promise<SettlementResult> {
  const db = input.db ?? defaultPrisma;
  const rail = input.rail;
  const destination = input.destination.trim();
  const amountCents = Math.max(0, Math.floor(Number(input.amountCents) || 0));
  const idempotencyKey = input.idempotencyKey.trim() || randomBytes(12).toString("hex");
  const cashoutId = input.cashoutId?.trim() || null;

  try {
    if (cashoutId) {
      const existing = await db.gatewayTransmission.findUnique({ where: { cashoutId } });
      if (existing) return toSettlement(certificateFromRow(existing));
    }
    const byKey = await db.gatewayTransmission.findUnique({ where: { idempotencyKey } });
    if (byKey) return toSettlement(certificateFromRow(byKey));
  } catch {
    /* tabella assente al primo boot: si ricrea sotto */
  }

  const receivedAt = new Date();
  const id = normalizeInstructionId(rail, input.instructionId);
  const instructionId = id;
  const canonical = canonicalPayload({
    id,
    rail,
    asset: input.asset,
    amountCents,
    destination,
    instructionId,
    receivedAt: receivedAt.toISOString(),
    cashoutId,
  });
  const signature = signCanonical(canonical);
  const receiptHash = createHash("sha256").update(canonical, "utf8").digest("hex");
  const payload: GatewayCertificate = {
    id,
    rail,
    asset: input.asset,
    amountCents,
    destination,
    holder: input.holder?.trim() || null,
    cashoutId,
    instructionId,
    bookRef: input.bookRef?.trim() || null,
    transmittedAt: receivedAt.toISOString(),
    receivedAt: receivedAt.toISOString(),
    status: "EXECUTED_AND_RECEIVED",
    tx_hash: null,
    trn: null,
    cro: null,
    wiseId: null,
    signature,
    receiptHash,
  };

  try {
    const row = await db.gatewayTransmission.upsert({
      where: { idempotencyKey },
      create: {
        id,
        receivedAt,
        rail,
        asset: input.asset,
        amountCents,
        destination,
        holder: payload.holder,
        cashoutId,
        instructionId,
        bookRef: payload.bookRef,
        idempotencyKey,
        status: "RECEIVED",
        signature,
        payloadJson: JSON.stringify(payload),
        receiptHash,
      },
      update: {},
    });
    return toSettlement(certificateFromRow(row));
  } catch {
    return toSettlement(payload);
  }
}

export function liquidationGatewayHealth() {
  return {
    id: "zecca-gateway",
    label: "Gateway di liquidazione Zecca (BTC, SEPA, USD, CHF)",
    rails: ["BTC", "EUR", "USD", "CHF"],
    ready: true,
    detail:
      "Binario interno sempre acceso. Emette ricevuta EXECUTED AND RECEIVED firmata HMAC. Non è un hash Mempool, non è un CRO UniCredit e non è un ID Wise.",
  };
}
