import { cookies } from "next/headers";
import { signCashoutProof, verifyCashoutProof, type CashoutProof } from "@/lib/cashout-proof";

const COOKIE = "zecca_receipts";
const MAX_PROOFS = 8;

function parseTokens(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

export async function rememberCashoutProof(proof: CashoutProof) {
  const token = signCashoutProof(proof);
  const jar = await cookies();
  const existing = parseTokens(jar.get(COOKIE)?.value)
    .map(verifyCashoutProof)
    .filter((item): item is CashoutProof => item !== null && item.id !== proof.id);
  const next = [proof, ...existing].slice(0, MAX_PROOFS).map(signCashoutProof);
  jar.set(COOKIE, next.join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(process.env.VERCEL),
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return token;
}

export async function loadRememberedProofs(userId?: string | null): Promise<CashoutProof[]> {
  const jar = await cookies();
  return parseTokens(jar.get(COOKIE)?.value)
    .map(verifyCashoutProof)
    .filter((item): item is CashoutProof => item !== null && (!userId || item.userId === userId));
}

export async function findRememberedProof(id: string, userId?: string | null) {
  const proofs = await loadRememberedProofs(userId);
  return proofs.find((proof) => proof.id === id) ?? null;
}
