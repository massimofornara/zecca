import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { PageShell } from "@/components/layout/SiteChrome";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { totals } from "@/lib/zecca/ledger";
import { formatCredits } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const [productCount, stats] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    totals(),
  ]);

  return (
    <PageShell>
      <section className="relative overflow-hidden pb-8 pt-4 md:pt-10">
        <p className="text-xs uppercase tracking-[0.35em] text-primary/80">San Rocco al Forno · Liguria</p>
        <Wordmark size="lg" className="mt-4" />
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Massimo Fornara conia i crediti (non euro di banca). Tu li compri — in demo o, se Stripe è
          acceso, in euro veri — li spendi in bottega su oggetti veri della casa, e puoi chiedere di
          prelevare i crediti verso un conto o un wallet. Zecca non dispone i pagamenti: lo fa il
          zecchiere.
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
        <Step n="02" title="La bottega" body="I crediti comprano oggetti veri della casa: olio, miele, caffè, sapone, lana. Ogni spesa di oggi scalda la Forgia del Giorno." />
        <Step n="03" title="Il prelievo" body="Chiunque abbia crediti può chiedere euro verso IBAN o wallet. Massimo invia dalla sua banca o dal suo wallet." />
      </section>

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
