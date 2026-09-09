import { LEDGER_LABELS, POCKET_LABELS, formatCredits, formatEurFromCents, formatFiatFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import type { LedgerType } from "@prisma/client";

export const metadata = { title: "Libro mastro" };

const TYPES: LedgerType[] = [
  "MINT",
  "HOUSE_GRANT",
  "PURCHASE_CREDITS",
  "SPEND_ON_ORDER",
  "CASHOUT_REQUEST",
  "CASHOUT_PAID",
  "CASHOUT_REJECTED",
  "TREASURY_CASHOUT",
  "TREASURY_CONVERT_TO_EUR",
  "TREASURY_CONVERT_TO_USD",
  "TREASURY_CONVERT_TO_CRYPTO",
  "TREASURY_CRYPTO_WITHDRAW",
  "RATE_CHANGE",
];

export default async function LibroMastroPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; q?: string }>;
}) {
  const { tipo, q } = await searchParams;
  const type = TYPES.includes(tipo as LedgerType) ? (tipo as LedgerType) : undefined;

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q } },
              { fromUser: { email: { contains: q } } },
              { toUser: { email: { contains: q } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { fromUser: true, toUser: true, actor: true },
  });

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Libro mastro</h1>
      <p className="mt-2 text-muted-foreground">
        Ogni movimento di credito è eterno. I saldi si derivano da queste righe.
      </p>
      <form className="mt-6 flex flex-wrap gap-2">
        <select
          name="tipo"
          defaultValue={tipo ?? ""}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="">Tutti i tipi</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {LEDGER_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="Nota o email"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
        />
        <button type="submit" className="h-8 rounded-lg bg-primary px-3 text-sm text-primary-foreground">
          Filtra
        </button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-md ring-1 ring-primary/20">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/40 font-ledger text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Da</th>
              <th className="px-3 py-2">A</th>
              <th className="px-3 py-2">Crediti</th>
              <th className="px-3 py-2">Fiat</th>
              <th className="px-3 py-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-primary/10">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {formatRomeDate(e.createdAt)}
                </td>
                <td className="px-3 py-2">{LEDGER_LABELS[e.type]}</td>
                <td className="px-3 py-2 text-xs">
                  {pocket(e.fromPocket, e.fromUser?.email)}
                </td>
                <td className="px-3 py-2 text-xs">{pocket(e.toPocket, e.toUser?.email)}</td>
                <td className="px-3 py-2 font-ledger">{formatCredits(e.amountCredits)}</td>
                <td className="px-3 py-2 font-ledger">
                  {e.type === "HOUSE_GRANT"
                    ? `${formatEurFromCents(e.eurCents)} / ${formatFiatFromCents(e.usdCents, "USD")}`
                    : e.fiatCurrency === "USD" && e.usdCents
                    ? `${e.type === "TREASURY_CASHOUT" || e.type === "CASHOUT_PAID" || e.type === "CASHOUT_REQUEST" || e.type === "TREASURY_CRYPTO_WITHDRAW" ? "−" : "+"}${formatFiatFromCents(e.usdCents, "USD")}`
                    : e.eurCents
                      ? `${e.eurDirection === "OUT" ? "−" : "+"}${formatEurFromCents(e.eurCents)}`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pocket(p: string, email?: string | null) {
  if (p === "USER" || p === "ESCROW") return `${POCKET_LABELS[p]}${email ? ` (${email})` : ""}`;
  return POCKET_LABELS[p] ?? p;
}
