import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { PageShell } from "@/components/layout/SiteChrome";
import { ProductCard } from "@/components/shop/ProductCard";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { totals } from "@/lib/zecca/ledger";
import { formatCredits } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const [productCount, featured, stats] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.product.findMany({
      where: { active: true },
      include: { supplier: true },
      orderBy: { priceCredits: "asc" },
      take: 6,
    }),
    totals(),
  ]);

  return (
    <PageShell>
      <section className="relative overflow-hidden pb-8 pt-4 md:pt-10">
        <p className="text-xs uppercase tracking-[0.35em] text-primary/80">San Rocco al Forno · Liguria</p>
        <Wordmark size="lg" className="mt-4" />
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Massimo Fornara conia i crediti (non euro di banca). Tu li compri — in demo o, se Stripe è
          acceso, in euro veri — li spendi in bottega su decine di pezzi di massima fattura, te li
          fai spedire a casa — il produttore imballa, DHL parte da solo, non Massimo — e puoi
          prelevare i crediti verso un conto o un wallet. Per la crypto il negozio invia dal proprio
          wallet: MetaMask, Trust Wallet o l’exchange ricevono, senza firmare.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/vetrina" className={cn(buttonVariants({ size: "lg" }), "px-5")}>
            Entra in vetrina
          </Link>
          <Link href="/accedi" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "px-5")}>
            Accedi alla zecca
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Step n="01" title="Il conio" body="Solo il zecchiere può far nascere i crediti. Entrano in tesoreria, non in un portafoglio a caso." />
        <Step n="02" title="Il negozio" body="Decine di pezzi, corsie e fornitori diversi. Chi produce imballa; al pagamento Zecca prenota DHL Express 24h dalla sede di quell’azienda. Massimo non tocca i colli." />
        <Step n="03" title="Il prelievo" body="Chiunque abbia crediti può chiedere euro, dollari o crypto verso IBAN o wallet. La crypto parte dal wallet del negozio: chi riceve non firma. Il bonifico IBAN lo dispone Massimo dalla banca." />
      </section>

      {featured.length > 0 && (
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Bottega</p>
              <h2 className="mt-1 font-display text-3xl text-primary">In vetrina adesso</h2>
            </div>
            <Link href="/vetrina" className={cn(buttonVariants({ variant: "outline" }), "px-4")}>
              Tutti i {productCount} pezzi
            </Link>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <section className="paper mt-12 rounded-md px-6 py-8 md:px-10">
        <h2 className="font-display text-3xl">Non è un punteggio a vita</h2>
        <p className="mt-3 max-w-2xl opacity-85">
          La fedeltà si misura in un solo giorno. A mezzanotte romana la forgia si raffredda. Domani si
          ricomincia. Il zecchiere, invece, fonde quando vuole: la tesoreria è sua.
        </p>
        <dl className="mt-8 grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] opacity-60">Crediti in tesoreria</dt>
            <dd className="font-ledger text-2xl">{formatCredits(stats.treasury)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] opacity-60">Pezzi in vetrina</dt>
            <dd className="font-ledger text-2xl">{productCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] opacity-60">Coniati in tutto</dt>
            <dd className="font-ledger text-2xl">{formatCredits(stats.minted)}</dd>
          </div>
        </dl>
      </section>
    </PageShell>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article className="metal-frame rounded-md bg-card/70 p-5">
      <p className="font-ledger text-xs text-primary">{n}</p>
      <h2 className="mt-2 font-display text-2xl text-primary">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </article>
  );
}
