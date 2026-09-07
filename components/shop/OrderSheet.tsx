import Link from "next/link";
import { CopyField } from "@/components/copy/CopyField";
import { formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { formatShipping } from "@/lib/shipping";
import { shipProgress } from "@/lib/dhl";
import { formatSupplierSeat } from "@/lib/suppliers";

export type OrderSheetShipment = {
  id: string;
  supplierName: string;
  supplierStreet: string;
  supplierCity: string;
  supplierPostal: string;
  supplierPhone: string;
  supplierEmail: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  dhlMessage: string | null;
  dhlTrackStatus: string | null;
  dhlTrackDetail: string | null;
  dhlTrackedAt: Date | null;
  dhlLabelPath: string | null;
  shipStatus: string;
  items: { id: string; quantity: number; product: { name: string } }[];
};

export type OrderSheetData = {
  id: string;
  totalCredits: number;
  shippingCredits: number;
  createdAt: Date;
  shipTo: string;
  shipName: string | null;
  shipStreet: string | null;
  shipCity: string | null;
  shipPostal: string | null;
  shipNote: string | null;
  shipPhone: string | null;
  carrier: string;
  shipStatus: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  dhlMessage: string | null;
  dhlTrackStatus: string | null;
  dhlTrackDetail: string | null;
  dhlTrackedAt: Date | null;
  dhlLabelPath: string | null;
  items: {
    id: string;
    quantity: number;
    unitCredits: number;
    product: { name: string; supplier?: { name: string; city: string } | null };
  }[];
  shipments?: OrderSheetShipment[];
};

export function OrderSheet({
  order,
  buyer,
  showCopy,
}: {
  order: OrderSheetData;
  buyer?: string;
  showCopy?: boolean;
}) {
  const dest = formatShipping(order);
  const progress = shipProgress(order);
  const goods = order.totalCredits - order.shippingCredits;
  const shipments = order.shipments ?? [];

  return (
    <article className="print-sheet metal-frame rounded-md bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-ledger text-sm text-muted-foreground">
            #{order.id.slice(-6).toUpperCase()} · {formatRomeDate(order.createdAt)}
          </p>
          {buyer ? <p className="mt-1 text-sm">{buyer}</p> : null}
        </div>
        <p className="font-ledger text-ember">{formatCredits(order.totalCredits)}</p>
      </div>

      <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity} × {item.product.name} · {formatCredits(item.unitCredits)}
            {item.product.supplier ? (
              <span className="block text-xs">
                Spedisce {item.product.supplier.name}, {item.product.supplier.city}
              </span>
            ) : null}
          </li>
        ))}
        <li>Merce · {formatCredits(goods)}</li>
        {order.shippingCredits > 0 ? (
          <li>DHL Express 24h dai fornitori · {formatCredits(order.shippingCredits)}</li>
        ) : (
          <li>I fornitori spediscono a casa di Massimo · 0 cr</li>
        )}
      </ul>

      <div className="mt-4 text-sm">
        <p>{dest.who}</p>
        {dest.lines ? <p className="text-muted-foreground">{dest.lines}</p> : null}
        {order.shipPhone ? <p className="text-muted-foreground">Tel. {order.shipPhone}</p> : null}
        {order.shipNote ? <p className="mt-1 text-muted-foreground">Nota: {order.shipNote}</p> : null}
      </div>

      <p className="mt-4 text-sm text-primary">
        Massimo non imballa. Ogni produttore prepara il proprio collo e DHL ritira dalla sua sede.
      </p>

      {shipments.map((shipment) => {
        const local = shipProgress(shipment);
        return (
          <section key={shipment.id} className="mt-4 rounded-md bg-background/40 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-primary/80">Fornitore</p>
            <p className="font-display text-xl text-primary">{shipment.supplierName}</p>
            <p className="text-sm text-muted-foreground">
              {formatSupplierSeat({
                name: shipment.supplierName,
                street: shipment.supplierStreet,
                postal: shipment.supplierPostal,
                city: shipment.supplierCity,
              })}
            </p>
            <ul className="mt-2 text-sm text-muted-foreground">
              {shipment.items.map((item) => (
                <li key={item.id}>
                  {item.quantity} × {item.product.name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs uppercase tracking-wider text-primary">{local.status}</p>
            <p className="text-sm text-muted-foreground">{local.detail}</p>
            {shipment.trackingNumber ? (
              <p className="mt-2 font-ledger text-sm">
                Tracking {shipment.trackingNumber}
                {" · "}
                <Link
                  href={`/traccia/${encodeURIComponent(shipment.trackingNumber)}`}
                  className="underline hover:text-primary"
                >
                  Segui
                </Link>
                {shipment.trackingUrl ? (
                  <>
                    {" · "}
                    <a
                      href={shipment.trackingUrl}
                      className="underline hover:text-primary"
                      target="_blank"
                      rel="noreferrer"
                    >
                      DHL
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            {shipment.dhlLabelPath ? (
              <p className="no-print mt-1 text-sm">
                <a href={shipment.dhlLabelPath} className="underline hover:text-primary" target="_blank" rel="noreferrer">
                  Etichetta per il fornitore
                </a>
              </p>
            ) : null}
            {showCopy ? (
              <div className="no-print mt-3 space-y-2">
                <CopyField label="Fornitore" value={shipment.supplierName} />
                <CopyField
                  label="Ritiro DHL"
                  value={`${shipment.supplierStreet}, ${shipment.supplierPostal} ${shipment.supplierCity}`}
                />
                <CopyField label="Telefono fornitore" value={shipment.supplierPhone} mono />
                <CopyField label="Email fornitore" value={shipment.supplierEmail} />
                {shipment.trackingNumber ? (
                  <CopyField label="Tracking" value={shipment.trackingNumber} mono />
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}

      {showCopy && dest.lines ? (
        <div className="no-print mt-4 space-y-2 rounded-md bg-background/40 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Destinazione cliente</p>
          <CopyField label="Destinatario" value={order.shipName ?? ""} />
          <CopyField label="Indirizzo" value={dest.lines} />
          {order.shipPhone ? <CopyField label="Telefono" value={order.shipPhone} mono /> : null}
        </div>
      ) : null}

      {shipments.length === 0 ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-primary">{progress.status}</p>
          <p className="mt-1 text-sm text-muted-foreground">{progress.detail}</p>
          {order.trackingNumber && (
            <p className="mt-3 font-ledger text-sm">
              Tracking {order.trackingNumber}
              {" · "}
              <Link href={`/traccia/${encodeURIComponent(order.trackingNumber)}`} className="underline hover:text-primary">
                Segui in Zecca
              </Link>
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}
