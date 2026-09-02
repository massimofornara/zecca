import Link from "next/link";
import { notFound } from "next/navigation";
import { addToCartAction } from "@/actions/shop";
import { ProductArt } from "@/components/brand/ProductArt";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { PageShell } from "@/components/layout/SiteChrome";
import { formatCredits } from "@/lib/format";
import { prisma } from "@/lib/db";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({ where: { slug } });
  return { title: product?.name ?? "Pezzo" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product || !product.active) notFound();

  return (
    <PageShell>
      <p className="text-sm text-muted-foreground">
        <Link href="/vetrina" className="hover:text-primary">
          Vetrina
        </Link>{" "}
        / {product.name}
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="metal-frame overflow-hidden rounded-md">
          <ProductArt imageKey={product.imageKey} className="min-h-[320px]" />
        </div>
        <div>
          <h1 className="font-display text-4xl text-primary">{product.name}</h1>
          <p className="mt-4 text-muted-foreground">{product.description}</p>
          <p className="mt-6 font-ledger text-3xl text-ember">{formatCredits(product.priceCredits)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.stock > 0 ? `${product.stock} pezzi in bottega` : "Esaurito"}
          </p>
          {product.stock > 0 && (
            <form action={addToCartAction} className="mt-6 flex items-end gap-3">
              <input type="hidden" name="productId" value={product.id} />
              <label className="text-sm">
                Quantità
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={product.stock}
                  defaultValue={1}
                  className="mt-1 block w-24 rounded-md border border-input bg-background px-2 py-1"
                />
              </label>
              <SubmitButton>Metti in cesta</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  );
}
