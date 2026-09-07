import Link from "next/link";
import { CopyField } from "@/components/copy/CopyField";
import { formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { formatShipping } from "@/lib/shipping";
import { shipProgress } from "@/lib/dhl";

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
    product: { name: string };
  }[];
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
          </li>
        ))}
        <li>Merce · {formatCredits(goods)}</li>
        {order.shippingCredits > 0 ? (
          <li>DHL Express 24h · {formatCredits(order.shippingCredits)}</li>
        ) : (
          <li>Consegna in casa di Massimo · 0 cr</li>
        )}
      </ul>

      <div className="mt-4 text-sm">
        <p>{dest.who}</p>
        {dest.lines ? <p className="text-muted-foreground">{dest.lines}</p> : null}
        {order.shipPhone ? <p className="text-muted-foreground">Tel. {order.shipPhone}</p> : null}
        {order.shipNote ? <p className="mt-1 text-muted-foreground">Nota: {order.shipNote}</p> : null}
      </div>

      {showCopy && dest.lines ? (
        <div className="no-print mt-4 space-y-2 rounded-md bg-background/40 p-3">
          <CopyField label="Destinatario" value={order.shipName ?? ""} />
          <CopyField label="Indirizzo" value={dest.lines} />
          {order.shipPhone ? <CopyField label="Telefono" value={order.shipPhone} mono /> : null}
          {order.trackingNumber ? (
            <CopyField label="Tracking" value={order.trackingNumber} mono />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wider text-primary">{progress.status}</p>
        <p className="mt-1 text-sm text-muted-foreground">{progress.detail}</p>
        {order.dhlTrackedAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Aggiornato {formatRomeDate(order.dhlTrackedAt)}
          </p>
        ) : null}
      </div>

      {order.trackingNumber && (
        <p className="mt-3 font-ledger text-sm">
          Tracking {order.trackingNumber}
          {" · "}
          <Link href={`/traccia/${encodeURIComponent(order.trackingNumber)}`} className="underline hover:text-primary">
            Segui in Zecca
          </Link>
          {order.trackingUrl ? (
            <>
              {" · "}
              <a href={order.trackingUrl} className="underline hover:text-primary" target="_blank" rel="noreferrer">
                DHL
              </a>
            </>
          ) : null}
        </p>
      )}

      {order.dhlLabelPath ? (
        <p className="no-print mt-2 text-sm">
          <a href={order.dhlLabelPath} className="underline hover:text-primary" target="_blank" rel="noreferrer">
            Etichetta DHL (PDF)
          </a>
        </p>
      ) : null}

      {order.dhlMessage ? (
        <p className="mt-2 text-xs text-muted-foreground">{order.dhlMessage}</p>
      ) : null}
    </article>
  );
}
