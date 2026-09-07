import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/SiteChrome";
import { buttonVariants } from "@/components/ui/button";
import { shipProgress } from "@/lib/dhl";
import { prisma } from "@/lib/db";
import { formatRomeDate } from "@/lib/rome-day";
import { formatShipping } from "@/lib/shipping";
import { cn } from "@/lib/utils";

export const metadata = { title: "Traccia spedizione" };

export default async function TracciaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const tracking = decodeURIComponent(code).trim();
  if (!tracking) notFound();

  const order = await prisma.order.findFirst({
    where: { trackingNumber: tracking },
    include: { items: { include: { product: true } } },
  });
  if (!order) notFound();

  const dest = formatShipping(order);
  const progress = shipProgress(order);

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Spedizione</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Tracking {order.trackingNumber}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Stato del collo. Non sostituisce conio, prelievo o tesoreria: è solo il corriere.
      </p>

      <section className="metal-frame mt-8 max-w-2xl rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">{progress.status}</p>
        <p className="mt-2 font-display text-3xl text-primary">{dest.who}</p>
        <p className="mt-2 text-sm text-muted-foreground">{progress.detail}</p>
        {order.dhlTrackedAt ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Aggiornato {formatRomeDate(order.dhlTrackedAt)}
          </p>
        ) : null}
        {dest.lines ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Destinazione: {order.shipCity}, {order.shipPostal}
          </p>
        ) : null}
        <ul className="mt-4 text-sm text-muted-foreground">
          {order.items.map((item) => (
            <li key={item.id}>
              {item.quantity} × {item.product.name}
            </li>
          ))}
        </ul>
        {order.trackingUrl ? (
          <p className="mt-4 text-sm">
            <a href={order.trackingUrl} className="underline hover:text-primary" target="_blank" rel="noreferrer">
              Apri su DHL
            </a>
          </p>
        ) : null}
      </section>

      <Link href="/spedizione" className={cn(buttonVariants({ variant: "outline" }), "mt-8")}>
        Come funziona DHL Express 24h
      </Link>
    </PageShell>
  );
}
