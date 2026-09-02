import { formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
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
      <p className="mt-2 text-muted-foreground">Spese in bottega. Ogni riga ha già scalato crediti e scorte.</p>
      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nessun ordine" body="Quando un cliente paga in crediti, compare qui." />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {orders.map((order) => (
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
