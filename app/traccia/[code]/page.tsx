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

  const shipment = await prisma.shipment.findFirst({
    where: { trackingNumber: tracking },
    include: { items: { include: { product: true } }, supplier: true },
  });
  const order = await prisma.order.findFirst({
    where: shipment ? { id: shipment.orderId } : { trackingNumber: tracking },
    include: { items: { include: { product: true } } },
  });
  if (!order) notFound();

  const dest = formatShipping(order);
  const progress = shipProgress({
    shipStatus: shipment?.shipStatus ?? order.shipStatus,
    shipTo: order.shipTo,
    dhlTrackStatus: shipment?.dhlTrackStatus ?? order.dhlTrackStatus,
    dhlTrackDetail: shipment?.dhlTrackDetail ?? order.dhlTrackDetail,
  });
  const items = shipment?.items ?? order.items;
  const trackingNumber = shipment?.trackingNumber ?? order.trackingNumber;
  const trackingUrl = shipment?.trackingUrl ?? order.trackingUrl;
  const updatedAt = shipment?.dhlTrackedAt ?? order.dhlTrackedAt;

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Spedizione</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Tracking {trackingNumber}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Il collo parte dal fornitore, non dalla casa della zecca. Massimo non imballa.
      </p>

      <section className="metal-frame mt-8 max-w-2xl rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">{progress.status}</p>
        <p className="mt-2 font-display text-3xl text-primary">
          {shipment ? shipment.supplierName : dest.who}
        </p>
        {shipment ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Ritiro DHL da {shipment.supplierCity}. Destinazione: {dest.who}.
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">{progress.detail}</p>
        {updatedAt ? (
          <p className="mt-2 text-xs text-muted-foreground">Aggiornato {formatRomeDate(updatedAt)}</p>
        ) : null}
        {dest.lines ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Destinazione: {order.shipCity}, {order.shipPostal}
          </p>
        ) : null}
        <ul className="mt-4 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item.id}>
              {item.quantity} × {item.product.name}
            </li>
          ))}
        </ul>
        {trackingUrl ? (
          <p className="mt-4 text-sm">
            <a href={trackingUrl} className="underline hover:text-primary" target="_blank" rel="noreferrer">
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
