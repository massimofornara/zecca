import Link from "next/link";
import { updateCartAction } from "@/actions/shop";
import { CheckoutForm } from "@/components/shop/CheckoutForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { PageShell } from "@/components/layout/SiteChrome";
import { EmptyState, ErrorBanner } from "@/components/ui/banners";
import { buttonVariants } from "@/components/ui/button";
import { ProductArt } from "@/components/brand/ProductArt";
import { getCart } from "@/lib/cart";
import { formatCredits } from "@/lib/format";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { userWallet } from "@/lib/zecca/ledger";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cesta" };

export default async function CarrelloPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const cart = await getCart();
  const ids = cart.map((l) => l.productId);
  const products = ids.length
    ? await prisma.product.findMany({ where: { id: { in: ids } } })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = cart
    .map((l) => {
      const product = byId.get(l.productId);
      if (!product) return null;
      return { ...l, product, lineTotal: product.priceCredits * l.quantity };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const session = await auth();
  const wallet = session?.user ? await userWallet(session.user.id) : null;

  return (
    <PageShell>
      <h1 className="font-display text-4xl text-primary">Cesta</h1>
      <p className="mt-2 text-muted-foreground">
        E-commerce della bottega: paghi in crediti. A casa tua arriva DHL Express 24h; oppure
        consegna in casa di Massimo.
      </p>
      <div className="mt-6">
        <ErrorBanner message={error} />
      </div>
      {lines.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Cesta vuota" body="La vetrina è aperta. Scegli un pezzo.">
            <Link href="/vetrina" className={buttonVariants()}>
              Vai in vetrina
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {lines.map((line) => (
            <div
              key={line.productId}
              className="metal-frame flex flex-col gap-3 rounded-md bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md ring-1 ring-primary/20">
                  <ProductArt imageKey={line.product.imageKey} alt={line.product.name} />
                </div>
                <div>
                <Link href={`/vetrina/${line.product.slug}`} className="font-display text-xl text-primary">
                  {line.product.name}
                </Link>
                <p className="font-ledger text-sm text-muted-foreground">
                  {formatCredits(line.product.priceCredits)} × {line.quantity} ={" "}
                  {formatCredits(line.lineTotal)}
                </p>
                </div>
              </div>
              <form action={updateCartAction} className="flex items-center gap-2">
                <input type="hidden" name="productId" value={line.productId} />
                <input
                  name="quantity"
                  type="number"
                  min={0}
                  max={line.product.stock}
                  defaultValue={line.quantity}
                  className="w-20 rounded-md border border-input bg-background px-2 py-1"
                />
                <SubmitButton size="sm" variant="outline">
                  Aggiorna
                </SubmitButton>
              </form>
            </div>
          ))}
          <div className="border-t border-primary/20 pt-6">
            <p className="font-ledger text-2xl text-ember">{formatCredits(total)}</p>
            {wallet && (
              <p className="text-sm text-muted-foreground">
                Nel portafoglio: {formatCredits(wallet.available)}
                {wallet.available < total ? " — non bastano. Compra crediti." : ""}
              </p>
            )}
            {session?.user ? (
              <CheckoutForm />
            ) : (
              <Link href="/accedi?callbackUrl=/carrello" className={cn(buttonVariants({ size: "lg" }), "mt-4")}>
                Entra per pagare e spedire
              </Link>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
