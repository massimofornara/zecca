import { formatCredits } from "@/lib/format";
import { formatRomeDay } from "@/lib/rome-day";
import { loyalToday } from "@/lib/zecca/forge";
import { EmptyState } from "@/components/ui/banners";

export const metadata = { title: "Fedeli" };

export default async function FedeliPage() {
  const loyal = await loyalToday();
  const fedeli = loyal.filter((l) => l.fedele);

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">{formatRomeDay(new Date())}</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Fedeli di oggi</h1>
      <p className="mt-2 text-muted-foreground">
        Chi ha speso almeno 50 crediti in bottega nella giornata romana. Domani la lista è vuota: la
        fedeltà non si accumula.
      </p>
      {loyal.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nessuno in bottega oggi" body="Quando un cliente spende crediti, compare qui." />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {loyal.map((row) => (
            <li
              key={row.user!.id}
              className={`metal-frame rounded-md p-4 ${row.fedele ? "bg-primary/10" : "bg-card"}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-display text-xl text-primary">{row.user!.name}</p>
                  <p className="text-xs text-muted-foreground">{row.user!.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-ledger text-ember">{formatCredits(row.spent)}</p>
                  <p className="text-xs uppercase tracking-wider">
                    {row.fedele ? `Fedele · ${row.percent}%` : `Ancora freddo · ${row.percent}%`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        Fedeli: {fedeli.length} su {loyal.length} acquirenti di oggi.
      </p>
    </div>
  );
}
