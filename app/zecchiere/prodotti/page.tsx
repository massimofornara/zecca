import Link from "next/link";
import { toggleProductAction } from "@/actions/admin";
import { ProductArt } from "@/components/brand/ProductArt";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import { formatCredits } from "@/lib/format";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata = { title: "Prodotti" };

export default async function ProdottiPage() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { supplier: true },
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-primary">Vetrina</h1>
          <p className="mt-2 text-muted-foreground">
            Pezzi in vetrina, ciascuno legato al fornitore che lo produce e lo spedisce.
          </p>
        </div>
        <Link href="/zecchiere/prodotti/nuovo" className={cn(buttonVariants(), "px-4")}>
          Nuovo pezzo
        </Link>
      </div>
      <ul className="mt-8 space-y-3">
        {products.map((p) => (
          <li key={p.id} className="metal-frame flex items-center gap-4 rounded-md bg-card p-3">
            <div className="size-16 overflow-hidden rounded-sm">
              <ProductArt imageKey={p.imageKey} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-primary">{p.name}</p>
              <p className="font-ledger text-xs text-muted-foreground">
                {formatCredits(p.priceCredits)} · scorte {p.stock} ·{" "}
                {p.supplier ? p.supplier.name : "senza fornitore"} · {p.active ? "in vetrina" : "nascosto"}
              </p>
            </div>
            <Link href={`/zecchiere/prodotti/${p.id}`} className="text-sm text-primary underline">
              Modifica
            </Link>
            <form action={toggleProductAction}>
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton size="sm" variant="outline">
                {p.active ? "Nascondi" : "Mostra"}
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
