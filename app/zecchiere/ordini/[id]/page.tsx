import Link from "next/link";
import { notFound } from "next/navigation";
import { bookDhlAction, markOrderShippedAction, refreshDhlTrackingAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { PrintButton } from "@/components/shop/PrintButton";
import { OrderSheet } from "@/components/shop/OrderSheet";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { isDhlConfigured } from "@/lib/dhl";

export const metadata = { title: "Ordine ai fornitori" };

export default async function AdminOrdinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { include: { supplier: true } } } },
      shipments: { include: { supplier: true, items: { include: { product: true } } } },
      user: true,
    },
  });
  if (!order) notFound();
  const dhl = isDhlConfigured();

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Fornitori</p>
      <h1 className="mt-1 font-display text-4xl text-primary">
        Ordine #{order.id.slice(-6).toUpperCase()}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Tu non imballi. Ogni produttore prepara il collo nella sua sede; tu mandi l’ordine e, se c’è
        il contratto, prenoti il ritiro DHL da lì.{" "}
        {dhl ? "Contratto DHL collegato." : "Senza chiavi DHL la lettera resta locale."}
      </p>

      <div className="mt-8 max-w-2xl">
        <OrderSheet order={order} buyer={`${order.user.name} (${order.user.email})`} showCopy />
      </div>

      <div className="no-print mt-6 flex flex-wrap gap-2">
        {order.shipStatus !== "SHIPPED" && (
          <form action={bookDhlAction}>
            <input type="hidden" name="id" value={order.id} />
            <SubmitButton size="sm" variant="outline">
              Invia / ripeti DHL ai fornitori
            </SubmitButton>
          </form>
        )}
        {order.shipments.some((s) => s.trackingNumber) && (
          <form action={refreshDhlTrackingAction}>
            <input type="hidden" name="id" value={order.id} />
            <SubmitButton size="sm" variant="outline">
              Aggiorna tracking
            </SubmitButton>
          </form>
        )}
        {order.shipStatus !== "SHIPPED" && (
          <form action={markOrderShippedAction}>
            <input type="hidden" name="id" value={order.id} />
            <SubmitButton size="sm">I fornitori hanno consegnato a DHL</SubmitButton>
          </form>
        )}
        <PrintButton>Stampa ordine per i fornitori</PrintButton>
        <Link href="/zecchiere/ordini" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Tutti gli ordini
        </Link>
      </div>
    </div>
  );
}
