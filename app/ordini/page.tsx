import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { EmptyState, OkBanner } from "@/components/ui/banners";
import { formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { formatShipping } from "@/lib/shipping";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Ordini" };

function shipLabel(status: string) {
  if (status === "SHIPPED") return "In viaggio / consegnato in sede";
  if (status === "BOOKED") return "DHL: ritiro prenotato";
  return "In preparazione";
}

export default async function OrdiniPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/ordini");
  const { ok } = await searchParams;
  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: true } } },
  });

  return (
    <PageShell>
      <h1 className="font-display text-4xl text-primary">Ordini</h1>
      <div className="mt-4">
        {ok && (
          <OkBanner message="Ordine pagato. Se hai scelto casa tua, DHL Express 24h è in coda di ritiro." />
        )}
      </div>
      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nessun ordine" body="Il negozio è aperto.">
            <Link href="/vetrina" className={buttonVariants()}>
              Vai in vetrina
            </Link>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => {
            const dest = formatShipping(order);
            return (
              <li key={order.id} className="metal-frame rounded-md bg-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-ledger text-sm text-muted-foreground">
                    #{order.id.slice(-6).toUpperCase()} · {formatRomeDate(order.createdAt)}
                  </p>
                  <p className="font-ledger text-ember">{formatCredits(order.totalCredits)}</p>
                </div>
                <ul className="mt-3 text-sm text-muted-foreground">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.product.name} ({formatCredits(item.unitCredits)})
                    </li>
                  ))}
                </ul>
                {order.shippingCredits > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    DHL Express 24h · {formatCredits(order.shippingCredits)}
                  </p>
                )}
                <p className="mt-3 text-sm">
                  {dest.who}
                  {dest.lines ? <span className="block text-muted-foreground">{dest.lines}</span> : null}
                </p>
                {order.trackingNumber && (
                  <p className="mt-2 font-ledger text-sm">
                    Tracking {order.trackingNumber}
                    {order.trackingUrl ? (
                      <>
                        {" · "}
                        <a href={order.trackingUrl} className="underline hover:text-primary" target="_blank" rel="noreferrer">
                          Segui su DHL
                        </a>
                      </>
                    ) : null}
                  </p>
                )}
                <p className="mt-1 text-xs uppercase tracking-wider text-primary">
                  {shipLabel(order.shipStatus)}
                </p>
                <p className="mt-3 text-sm">
                  <Link href={`/ordini/${order.id}`} className="underline hover:text-primary">
                    Ricevuta e tracking
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
