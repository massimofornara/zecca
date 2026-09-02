import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { CashoutForm } from "@/components/shop/CashoutForm";
import { EmptyState } from "@/components/ui/banners";
import { formatCredits, formatEurFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { getForgeState } from "@/lib/zecca/forge";
import { getSettings } from "@/lib/zecca/settings";

export const metadata = { title: "Fusione" };

export default async function FusionePage() {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/fusione");

  const [forge, settings, requests] = await Promise.all([
    getForgeState({ userId: session.user.id, role: session.user.role }),
    getSettings(),
    prisma.cashoutRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Fusione</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Fondi i crediti</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Solo il metallo forgiato oggi può tornare euro. La richiesta va al zecchiere, che segna il
        pagamento (bonifico o PayPal, nella vita reale). In demo chiude il movimento nel libro mastro.
      </p>
      <div className="mt-8">
        <CashoutForm
          forged={forge.forged}
          percent={forge.percent}
          eurCentsPerCredit={settings.eurCentsPerCredit}
        />
      </div>
      <section className="mt-12">
        <h2 className="font-display text-2xl text-primary">Le tue richieste</h2>
        {requests.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nessuna fusione" body="Quando la forgia è calda, puoi chiedere di convertire." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-ledger">
                    {formatCredits(r.credits)} → {formatEurFromCents(r.eurCents)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatRomeDate(r.createdAt)}</p>
                </div>
                <Status status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

function Status({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "In attesa",
    PAID: "Pagata",
    REJECTED: "Rifiutata",
  };
  return <span className="uppercase tracking-wider text-primary">{map[status] ?? status}</span>;
}
