import Link from "next/link";
import { formatSupplierSeat } from "@/lib/suppliers";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/banners";

export const metadata = { title: "Fornitori" };

export default async function FornitoriPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true, shipments: true } } },
  });

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Fornitori</h1>
      <p className="mt-2 text-muted-foreground">
        Aziende che producono i pezzi in vetrina. Imballano loro, dalla loro sede. Zecca vende e
        prenota DHL: tu non prepari colli.
      </p>
      {suppliers.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nessun fornitore" body="Lancia npm run db:catalog o il seed." />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="metal-frame rounded-md bg-card p-4">
              <p className="font-display text-2xl text-primary">{supplier.name}</p>
              <p className="text-sm text-muted-foreground">{supplier.company}</p>
              <p className="mt-2 text-sm">{formatSupplierSeat(supplier)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {supplier.phone} · {supplier.email}
              </p>
              <p className="mt-2 font-ledger text-xs text-muted-foreground">
                {supplier._count.products} pezzi · {supplier._count.shipments} spedizioni
              </p>
              <Link href="/zecchiere/prodotti" className="mt-2 inline-block text-sm underline hover:text-primary">
                Vetrina
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
