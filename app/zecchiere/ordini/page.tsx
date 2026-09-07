import { markOrderShippedAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { formatShipping } from "@/lib/shipping";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/banners";

export const metadata = { title: "Ordini" };

export default async function AdminOrdiniPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: true, items: { include: { product: true } } },
    take: 50,
  });

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Ordini</h1>
      <p className="mt-2 text-muted-foreground">
        Spese in bottega. Copia l’indirizzo, imballa, spedisci, poi conferma. Zecca non chiama il
        corriere da sola.
      </p>
      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nessun ordine" body="Quando un cliente paga in crediti, compare qui." />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {orders.map((order) => {
            const dest = formatShipping(order);
            return (
              <li key={order.id} className="metal-frame rounded-md bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    {order.user.name}{" "}
                    <span className="text-muted-foreground">({order.user.email})</span>
                  </p>
                  <p className="font-ledger text-ember">{formatCredits(order.totalCredits)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  #{order.id.slice(-6).toUpperCase()} · {formatRomeDate(order.createdAt)}
                </p>
                <ul className="mt-2 text-sm text-muted-foreground">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.product.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm">
                  {dest.who}
                  {dest.lines ? <span className="block text-muted-foreground">{dest.lines}</span> : null}
                  {order.shipNote ? (
                    <span className="mt-1 block text-muted-foreground">Nota: {order.shipNote}</span>
                  ) : null}
                </p>
                {order.shipStatus === "SHIPPED" ? (
                  <p className="mt-2 text-xs uppercase tracking-wider text-primary">Spedito</p>
                ) : (
                  <form action={markOrderShippedAction} className="mt-3">
                    <input type="hidden" name="id" value={order.id} />
                    <SubmitButton size="sm">Segna come spedito</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
