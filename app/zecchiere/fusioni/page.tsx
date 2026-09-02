import { PendingCashoutCard, TreasuryCashoutForm } from "@/components/zecchiere/FusioniForms";
import { EmptyState } from "@/components/ui/banners";
import { formatCredits, formatEurFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { treasuryBalance } from "@/lib/zecca/ledger";

export const metadata = { title: "Fusioni" };

export default async function FusioniPage() {
  const [pending, closed, treasury] = await Promise.all([
    prisma.cashoutRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    }),
    prisma.cashoutRequest.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: true },
    }),
    treasuryBalance(),
  ]);

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Fusioni</h1>
      <p className="mt-2 text-muted-foreground">
        I clienti chiedono di convertire il forgiato. Copia IBAN e importo, fai il bonifico{" "}
        <strong>dalla tua banca</strong>, poi conferma qui. Zecca non ha accesso ai conti e non
        dispone SEPA da sola.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Fusione tesoreria</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registra l’uscita di crediti dalla tesoreria. L’euro vero, se c’è, lo muovi tu dal conto
          della casa. Tesoreria attuale: {formatCredits(treasury)}.
        </p>
        <TreasuryCashoutForm treasury={treasury} />
      </section>

      <h2 className="mt-10 font-display text-2xl text-primary">Coda clienti</h2>
      {pending.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Coda vuota" body="Nessuna fusione in attesa. Quando un cliente chiede, arriva qui." />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {pending.map((r) => (
            <PendingCashoutCard
              key={r.id}
              id={r.id}
              name={r.user?.name ?? "Cliente"}
              email={r.user?.email ?? ""}
              credits={r.credits}
              eurCents={r.eurCents}
              iban={r.iban}
              ibanHolder={r.ibanHolder}
              createdLabel={formatRomeDate(r.createdAt)}
            />
          ))}
        </ul>
      )}

      <h2 className="mt-10 font-display text-2xl text-primary">Chiuse</h2>
      <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
        {closed.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {r.isTreasury ? "Tesoreria" : r.user?.name} · {formatCredits(r.credits)}
              {r.status === "PAID" ? ` → ${formatEurFromCents(r.eurCents)}` : ""}
            </span>
            <span className="uppercase tracking-wider text-primary">
              {r.status === "PAID" ? "Pagata" : "Rifiutata"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
