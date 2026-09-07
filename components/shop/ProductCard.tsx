import Link from "next/link";
import { ProductArt } from "@/components/brand/ProductArt";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/format";
import { addToCartAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";

export function ProductCard({
  product,
}: {
  product: {
    id: string;
    slug: string;
    name: string;
    description: string;
    imageKey: string;
    priceCredits: number;
    stock: number;
  };
}) {
  return (
    <article className="metal-frame group flex flex-col overflow-hidden rounded-md bg-card">
      <Link href={`/vetrina/${product.slug}`} className="block">
        <ProductArt imageKey={product.imageKey} alt={product.name} />
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <Link href={`/vetrina/${product.slug}`}>
            <h3 className="font-display text-xl text-primary group-hover:underline">{product.name}</h3>
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3">
          <div>
            <p className="font-ledger text-lg text-ember">{formatCredits(product.priceCredits)}</p>
            <p className="text-xs text-muted-foreground">
              {product.stock > 0 ? `${product.stock} in bottega` : "Esaurito"}
            </p>
          </div>
          {product.stock > 0 ? (
            <form action={addToCartAction}>
              <input type="hidden" name="productId" value={product.id} />
              <SubmitButton size="sm">In cesta</SubmitButton>
            </form>
          ) : (
            <Button size="sm" disabled>
              Esaurito
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
