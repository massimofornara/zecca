import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OrderSheet } from "@/components/shop/OrderSheet";
import { PageShell } from "@/components/layout/SiteChrome";
import { OkBanner } from "@/components/ui/banners";
import { PrintButton } from "@/components/shop/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";

const receiptInclude = {
  items: { include: { product: { include: { supplier: true } } } },
  shipments: { include: { items: { include: { product: true } } } },
} as const;

async function findOrderReceipt(id: string) {
  const exact = await prisma.order.findUnique({
    where: { id },
    include: receiptInclude,
  });
  if (exact) return exact;
  const suffix = id.trim().toLowerCase();
  if (suffix.length < 6) return null;
  const matches = await prisma.order.findMany({ include: receiptInclude });
  const hit = matches.filter((row) => row.id.slice(-suffix.length).toLowerCase() === suffix);
  return hit.length === 1 ? hit[0] : null;
}

export default async function OrdinePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/ordini");
  const { id } = await params;
  const order = await findOrderReceipt(id);
  if (!order || (order.userId !== session.user.id && session.user.role !== "ADMIN")) {
    notFound();
  }

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Ricevuta</p>
      <h1 className="mt-1 font-display text-4xl text-primary">
        Ordine #{order.id.slice(-6).toUpperCase()}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Pagato in crediti. Chi produce il pezzo imballa e spedisce. Massimo non prepara colli.
      </p>
      <div className="mt-4">
        <OkBanner message="Ricevuta del negozio. Il collo parte dal fornitore, non dalla casa della zecca." />
      </div>
      <div className="mt-8 max-w-2xl">
        <OrderSheet order={order} />
      </div>
      <div className="no-print mt-6 flex flex-wrap gap-3">
        <PrintButton>Stampa ricevuta</PrintButton>
        <Link href="/ordini" className={buttonVariants({ variant: "ghost" })}>
          Tutti gli ordini
        </Link>
      </div>
    </PageShell>
  );
}
