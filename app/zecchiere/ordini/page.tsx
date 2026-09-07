import Link from "next/link";
import { bookDhlAction, markOrderShippedAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { formatShipping } from "@/lib/shipping";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/banners";
import { isDhlConfigured } from "@/lib/dhl";

export const metadata = { title: "Ordini" };

export default async function AdminOrdiniPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: true,
      items: { include: { product: { include: { supplier: true } } } },
      shipments: true,
    },
    take: 50,
  });
  const dhl = isDhlConfigured();

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Ordini</h1>
      <p className="mt-2 text-muted-foreground">
        Tu non imballi. I fornitori preparano i colli nella loro sede; qui trasmetti l’ordine e
        prenoti DHL da lì.{" "}
        {dhl
          ? "Contratto DHL collegato."
          : "Senza chiavi DHL la lettera di vettura è locale: il ritiro vero parte quando le metti nel .env."}
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
                  #{order.id.slice(-6).toUpperCase()} · {formatRomeDate(order.createdAt)} ·{" "}
                  {order.carrier === "DHL_EXPRESS" ? "DHL Express 24h" : "Ritiro in casa"}
                  {order.shippingCredits > 0 ? ` · ${formatCredits(order.shippingCredits)}` : ""}
                </p>
                <ul className="mt-2 text-sm text-muted-foreground">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.product.name}
                      {item.product.supplier ? ` · ${item.product.supplier.name}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm">
                  {dest.who}
                  {dest.lines ? <span className="block text-muted-foreground">{dest.lines}</span> : null}
                  {order.shipPhone ? (
                    <span className="block text-muted-foreground">Tel. {order.shipPhone}</span>
                  ) : null}
                  {order.shipNote ? (
                    <span className="mt-1 block text-muted-foreground">Nota: {order.shipNote}</span>
                  ) : null}
                </p>
                {order.trackingNumber && (
                  <p className="mt-2 font-ledger text-sm">
                    {order.trackingNumber}
                    {order.trackingUrl ? (
                      <>
                        {" · "}
                        <a href={order.trackingUrl} className="underline" target="_blank" rel="noreferrer">
                          DHL
                        </a>
                      </>
                    ) : null}
                  </p>
                )}
                {order.dhlMessage && (
                  <p className="mt-1 text-xs text-muted-foreground">{order.dhlMessage}</p>
                )}
                <p className="mt-3 text-sm">
                  <Link href={`/zecchiere/ordini/${order.id}`} className="underline hover:text-primary">
                    Ordine ai fornitori
                  </Link>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.shipStatus !== "SHIPPED" && (
                    <form action={bookDhlAction}>
                      <input type="hidden" name="id" value={order.id} />
                      <SubmitButton size="sm" variant="outline">
                        Invia DHL ai fornitori
                      </SubmitButton>
                    </form>
                  )}
                  {order.shipStatus === "SHIPPED" ? (
                    <p className="text-xs uppercase tracking-wider text-primary">Spedito</p>
                  ) : (
                    <form action={markOrderShippedAction}>
                      <input type="hidden" name="id" value={order.id} />
                      <SubmitButton size="sm">Fornitori: ritiro avvenuto</SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
