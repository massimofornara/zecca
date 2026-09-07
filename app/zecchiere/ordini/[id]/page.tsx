import Link from "next/link";
import { notFound } from "next/navigation";
import { bookDhlAction, markOrderShippedAction, refreshDhlTrackingAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { PrintButton } from "@/components/shop/PrintButton";
import { OrderSheet } from "@/components/shop/OrderSheet";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { isDhlConfigured } from "@/lib/dhl";

export const metadata = { title: "Banco imballo" };

export default async function AdminOrdinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, user: true },
  });
  if (!order) notFound();
  const dhl = isDhlConfigured();

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Banco imballo</p>
      <h1 className="mt-1 font-display text-4xl text-primary">
        Ordine #{order.id.slice(-6).toUpperCase()}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Azioni del negozio, in più rispetto a conio, fusioni e tesoreria.{" "}
        {dhl
          ? "Contratto DHL collegato: puoi ripetere la prenotazione e aggiornare il tracking."
          : "Senza chiavi DHL la lettera resta locale: imballa, copia l’indirizzo, segna il ritiro."}
      </p>

      <div className="mt-8 max-w-2xl">
        <OrderSheet order={order} buyer={`${order.user.name} (${order.user.email})`} showCopy />
      </div>

      <div className="no-print mt-6 flex flex-wrap gap-2">
        {order.carrier === "DHL_EXPRESS" && order.shipStatus !== "SHIPPED" && (
          <form action={bookDhlAction}>
            <input type="hidden" name="id" value={order.id} />
            <SubmitButton size="sm" variant="outline">
              Prenota / ripeti DHL
            </SubmitButton>
          </form>
        )}
        {order.carrier === "DHL_EXPRESS" && order.trackingNumber && (
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
            <SubmitButton size="sm">Segna ritiro avvenuto</SubmitButton>
          </form>
        )}
        <PrintButton>Stampa bolla</PrintButton>
        <Link href="/zecchiere/ordini" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Tutti gli ordini
        </Link>
      </div>
    </div>
  );
}
