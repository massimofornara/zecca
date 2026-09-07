import { PendingCashoutCard, TreasuryConvertForm } from "@/components/zecchiere/FusioniForms";
import { EmptyState } from "@/components/ui/banners";
import { formatCredits, formatEurFromCents, formatFiatFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { treasuryBalance } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";

export const metadata = { title: "Fusioni" };

export default async function FusioniPage() {
  const [pending, closed, treasury, settings] = await Promise.all([
    prisma.cashoutRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    }),
    prisma.cashoutRequest.findMany({
      where: { status: { not: "PENDING" }, isTreasury: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: true },
    }),
    treasuryBalance(),
    getSettings(),
  ]);

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Fusioni</h1>
      <p className="mt-2 text-muted-foreground">
        Chiunque abbia crediti può chiedere un prelievo verso IBAN o wallet. Copia i dati, invia{" "}
        <strong>dalla tua banca o dal tuo wallet</strong>, poi conferma qui. Zecca non ha accesso
        ai conti e non spedisce da sola.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Conversione in cassa negozio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          I crediti ancora in tesoreria ({formatCredits(treasury)}) possono diventare euro e/o
          dollari della cassa contabile. Non è un prelievo personale e non è un bonifico.
        </p>
        <TreasuryConvertForm
          treasury={treasury}
          eurCentsPerCredit={settings.eurCentsPerCredit}
          usdCentsPerCredit={settings.usdCentsPerCredit}
        />
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
              payoutKind={r.payoutKind}
              iban={r.iban}
              ibanHolder={r.ibanHolder}
              walletAddress={r.walletAddress}
              walletNetwork={r.walletNetwork}
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
              {r.status === "PAID"
                ? r.currency === "USD"
                  ? ` → ${formatFiatFromCents(r.usdCents, "USD")}`
                  : ` → ${formatEurFromCents(r.eurCents)}`
                : ""}
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
