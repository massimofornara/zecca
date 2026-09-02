/** Massimo tecnico di un singolo movimento (Prisma Int / SQLite). Non è un tetto di politica. */
export const LEDGER_INT_MAX = 2_147_483_647;

export function parsePositiveCredits(raw: unknown): number | null {
  const amount = Math.floor(Number(raw));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}
