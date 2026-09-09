import type { ReactNode } from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/SiteChrome";
import { ProductCard } from "@/components/shop/ProductCard";
import { EmptyState } from "@/components/ui/banners";
import { categoryOf, SHOP_CATEGORIES, shopCategoryLabel } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata = { title: "Vetrina" };

export default async function VetrinaPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const selected = SHOP_CATEGORIES.some((category) => category.slug === cat) ? cat : undefined;
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { supplier: true },
    orderBy: { priceCredits: "asc" },
  });
  const filtered = selected
    ? products.filter((product) => categoryOf(product.slug) === selected)
    : products;
  const suppliers = new Set(filtered.map((product) => product.supplier?.name).filter(Boolean));

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">E-commerce della Zecca</p>
      <h1 className="mt-1 font-display text-4xl text-primary md:text-5xl">La vetrina</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {products.length} pezzi, ciascuno prodotto e imballato da chi lo fa. Paghi in crediti: al
        checkout Zecca apre da sola un collo DHL Express 24h{" "}
        <Link href="/spedizione" className="underline hover:text-primary">
          dalla sede di ogni fornitore
        </Link>
        . Massimo non tocca i pacchi.
      </p>
      <nav className="mt-8 flex flex-wrap gap-2">
        <FilterLink href="/vetrina" active={!selected} count={products.length}>
          Tutti
        </FilterLink>
        {SHOP_CATEGORIES.map((category) => {
          const count = products.filter((product) => categoryOf(product.slug) === category.slug).length;
          return (
            <FilterLink
              key={category.slug}
              href={`/vetrina?cat=${category.slug}`}
              active={selected === category.slug}
              count={count}
            >
              {category.label}
            </FilterLink>
          );
        })}
      </nav>
      <p className="mt-4 text-xs uppercase tracking-[0.16em] text-primary/80">
        {selected ? shopCategoryLabel(selected) : "Tutta la bottega"} · {filtered.length} pezzi ·{" "}
        {suppliers.size} fornitori spediscono
      </p>
      {filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={products.length === 0 ? "Vetrina vuota" : "Nessun pezzo in questa corsia"}
            body={
              products.length === 0
                ? "Il zecchiere non ha ancora messo pezzi in mostra."
                : "Scegli un’altra corsia o torna a tutta la bottega."
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function FilterLink({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm ring-1 ring-primary/20",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-primary",
      )}
    >
      {children} <span className="font-ledger text-xs">{count}</span>
    </Link>
  );
}
