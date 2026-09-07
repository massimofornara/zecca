import Link from "next/link";
import { PageShell } from "@/components/layout/SiteChrome";
import { ProductCard } from "@/components/shop/ProductCard";
import { EmptyState } from "@/components/ui/banners";
import { prisma } from "@/lib/db";

export const metadata = { title: "Vetrina" };

export default async function VetrinaPage() {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { priceCredits: "asc" },
  });

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Bottega della Zecca</p>
      <h1 className="mt-1 font-display text-4xl text-primary md:text-5xl">La vetrina</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        E-commerce della bottega: pezzi di massima fattura, pagamento in crediti,{" "}
        <Link href="/spedizione" className="underline hover:text-primary">
          DHL Express 24h
        </Link>{" "}
        a casa tua oppure consegna in casa di Massimo.
      </p>
      {products.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Vetrina vuota"
            body="Il zecchiere non ha ancora messo pezzi in mostra."
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
