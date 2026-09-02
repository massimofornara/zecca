import { resolveCashoutForm, treasuryCashoutForm } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { EmptyState } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { formatIbanDisplay } from "@/lib/iban";
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
        I clienti chiedono di convertire il forgiato. Tu fai il bonifico <strong>dalla tua banca</strong> verso
        l’IBAN indicato, poi confermi qui. Zecca non ha accesso ai conti e non dispone SEPA da sola.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Fusione tesoreria</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registra l’uscita di crediti dalla tesoreria. L’euro vero, se c’è, lo muovi tu dal conto della
          casa. Tesoreria attuale: {formatCredits(treasury)}.
        </p>
        <form action={treasuryCashoutForm} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Crediti
            <Input name="credits" type="number" min={1} defaultValue={50} className="mt-1 w-36" />
          </label>
          <SubmitButton>Fondi tesoreria</SubmitButton>
        </form>
      </section>

      <h2 className="mt-10 font-display text-2xl text-primary">Coda clienti</h2>
      {pending.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Coda vuota" body="Nessuna fusione in attesa. Quando un cliente chiede, arriva qui." />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {pending.map((r) => (
            <li key={r.id} className="metal-frame rounded-md bg-card p-4">
              <p>
                {r.user?.name} <span className="text-muted-foreground">({r.user?.email})</span>
              </p>
              <p className="font-ledger text-ember">
                {formatCredits(r.credits)} → {formatEurFromCents(r.eurCents)}
              </p>
              {r.iban && (
                <p className="mt-2 font-ledger text-sm">
                  {r.ibanHolder} · {formatIbanDisplay(r.iban)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{formatRomeDate(r.createdAt)}</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <form action={resolveCashoutForm} className="space-y-2">
                  <input type="hidden" name="cashoutId" value={r.id} />
                  <input type="hidden" name="action" value="pay" />
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="sepaConfirm" value="on" className="mt-0.5" required />
                    Ho disposto il bonifico SEPA da un conto a mio nome verso questo IBAN.
                  </label>
                  <SubmitButton size="sm">Conferma bonifico eseguito</SubmitButton>
                </form>
                <form action={resolveCashoutForm}>
                  <input type="hidden" name="cashoutId" value={r.id} />
                  <input type="hidden" name="action" value="reject" />
                  <SubmitButton size="sm" variant="outline">
                    Rifiuta
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 font-display text-2xl text-primary">Chiuse</h2>
      <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
        {closed.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {r.isTreasury ? "Tesoreria" : r.user?.name} · {formatCredits(r.credits)}
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
