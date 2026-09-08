import { cancelBonificoAction } from "@/actions/admin";
import { PendingBonificoCard, ShopBankForm } from "@/components/zecchiere/VersamentiForms";
import { EmptyState } from "@/components/ui/banners";
import { Button } from "@/components/ui/button";
import { formatCredits, formatEurFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { getShopBank, isShopBankReady } from "@/lib/zecca/bank";

export const metadata = { title: "Versamenti" };

export default async function VersamentiPage() {
  const [bank, pending, closed] = await Promise.all([
    getShopBank(),
    prisma.creditPurchase.findMany({
      where: { method: "bonifico", status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    }),
    prisma.creditPurchase.findMany({
      where: { method: "bonifico", status: { not: "pending" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: true },
    }),
  ]);

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Versamenti</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Euro veri senza Stripe e senza webhook: il cliente fa un bonifico SEPA sul tuo conto. Tu
        confronti causale e importo in banca, poi accrediti i crediti. L’app non muove i soldi.
      </p>

      <section className="metal-frame mt-8 max-w-xl rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Conto della zecca</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isShopBankReady(bank)
            ? "I clienti vedono questi dati quando comprano crediti."
            : "Senza IBAN nessuno può versare euro veri."}
        </p>
        <ShopBankForm iban={bank.iban} holder={bank.holder} bankName={bank.bankName} />
      </section>

      <h2 className="mt-10 font-display text-2xl text-primary">In attesa sul conto</h2>
      {pending.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nessun bonifico in coda"
            body="Quando un cliente chiede crediti, qui compare la causale da cercare in banca."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {pending.map((row) => (
            <li key={row.id}>
              <PendingBonificoCard
                id={row.id}
                name={row.user.name}
                email={row.user.email}
                credits={row.credits}
                eurCents={row.eurCents}
                reference={row.reference ?? row.id.slice(-6).toUpperCase()}
                createdLabel={formatRomeDate(row.createdAt)}
              />
              <form action={cancelBonificoAction} className="mt-1 px-1">
                <input type="hidden" name="purchaseId" value={row.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Annulla
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 font-display text-2xl text-primary">Chiusi</h2>
      <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
        {closed.map((row) => (
          <li key={row.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {row.user.name} · {row.reference} · {formatCredits(row.credits)}
            </span>
            <span className="text-muted-foreground">
              {row.status === "completed" ? formatEurFromCents(row.eurCents) : row.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
