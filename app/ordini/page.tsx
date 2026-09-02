import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { EmptyState, OkBanner } from "@/components/ui/banners";
import { formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Ordini" };

export default async function OrdiniPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/ordini");
  const { ok } = await searchParams;
  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: true } } },
  });

  return (
    <PageShell>
      <h1 className="font-display text-4xl text-primary">Ordini</h1>
      <div className="mt-4">
        {ok && <OkBanner message="Ordine pagato in crediti. La forgia di oggi ha preso calore." />}
      </div>
      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nessun ordine" body="La vetrina aspetta.">
            <Link href="/vetrina" className={buttonVariants()}>
              Vai in vetrina
            </Link>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="metal-frame rounded-md bg-card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-ledger text-sm text-muted-foreground">
                  #{order.id.slice(-6).toUpperCase()} · {formatRomeDate(order.createdAt)}
                </p>
                <p className="font-ledger text-ember">{formatCredits(order.totalCredits)}</p>
              </div>
              <ul className="mt-3 text-sm text-muted-foreground">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity} × {item.product.name} ({formatCredits(item.unitCredits)})
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
