import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { sqliteEphemeral } from "@/lib/public-url";

const COOKIE = "zecca_book_ops";
const MAX_OPS = 24;

export type BookOp = {
  v: 1;
  id: string;
  type: "MINT" | "TREASURY_CONVERT_TO_EUR" | "TREASURY_CONVERT_TO_USD" | "TREASURY_CONVERT_TO_CHF" | "TREASURY_CONVERT_TO_CRYPTO";
  amountCredits: number;
  eurCents?: number;
  usdCents?: number;
  chfCents?: number;
  asset?: string | null;
  note: string;
  actorId: string;
  createdAt: string;
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

export function signBookOp(op: BookOp): string {
  const payload = Buffer.from(JSON.stringify(op), "utf8").toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function verifyBookOp(token: string | null | undefined): BookOp | null {
  if (!token) return null;
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 8) return null;
  const payload = trimmed.slice(0, dot);
  const signature = trimmed.slice(dot + 1);
  if (!payload || !signature || !sameText(signature, hmac(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as BookOp;
    if (parsed?.v !== 1 || !parsed.id || !parsed.type || !parsed.actorId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseTokens(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

export async function rememberBookOp(op: BookOp) {
  if (!sqliteEphemeral() && !process.env.VERCEL) return;
  try {
    const token = signBookOp(op);
    const jar = await cookies();
    const existing = parseTokens(jar.get(COOKIE)?.value)
      .map(verifyBookOp)
      .filter((item): item is BookOp => item !== null && item.id !== op.id);
    const next = [op, ...existing].slice(0, MAX_OPS).map(signBookOp);
    jar.set(COOKIE, next.join(","), {
      httpOnly: true,
      sameSite: "lax",
      secure: Boolean(process.env.VERCEL),
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  } catch {
    /* test, instrumentation, o richiesta senza cookie */
  }
}

export async function loadBookOps(): Promise<BookOp[]> {
  try {
    const jar = await cookies();
    return parseTokens(jar.get(COOKIE)?.value)
      .map(verifyBookOp)
      .filter((item): item is BookOp => item !== null);
  } catch {
    return [];
  }
}

export async function replayBookOps(db: PrismaClient) {
  const ops = await loadBookOps();
  if (ops.length === 0) return 0;
  let applied = 0;
  for (const op of ops) {
    const exists = await db.ledgerEntry.findUnique({ where: { id: op.id } });
    if (exists) continue;
    const actor = await db.user.findUnique({ where: { id: op.actorId }, select: { id: true } });
    const actorId = actor?.id ?? (await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id;
    if (!actorId) continue;
    const metadata =
      op.type === "TREASURY_CONVERT_TO_CRYPTO" && op.asset
        ? JSON.stringify({ asset: op.asset, credits: op.amountCredits, usdCents: op.usdCents ?? 0 })
        : op.type.startsWith("TREASURY_CONVERT")
          ? JSON.stringify({ credits: op.amountCredits })
          : null;
    await db.ledgerEntry.create({
      data: {
        id: op.id,
        type: op.type,
        amountCredits: op.amountCredits,
        eurCents: op.eurCents ?? 0,
        usdCents: op.usdCents ?? 0,
        chfCents: op.chfCents ?? 0,
        fiatCurrency:
          op.type === "TREASURY_CONVERT_TO_EUR"
            ? "EUR"
            : op.type === "TREASURY_CONVERT_TO_CHF"
              ? "CHF"
              : op.type === "TREASURY_CONVERT_TO_USD" || op.type === "TREASURY_CONVERT_TO_CRYPTO"
                ? "USD"
                : null,
        fromPocket: op.type === "MINT" ? "VOID" : "TREASURY",
        toPocket: op.type === "MINT" ? "TREASURY" : "BURN",
        actorId,
        note: op.note,
        metadata,
        createdAt: new Date(op.createdAt),
      },
    });
    applied += 1;
  }
  return applied;
}
