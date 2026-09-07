import Link from "next/link";
import { PageShell } from "@/components/layout/SiteChrome";
import { buttonVariants } from "@/components/ui/button";
import { DHL_EXPRESS_24H_CREDITS, isDhlConfigured, isDhlLive } from "@/lib/dhl";
import { formatCredits } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Spedizione dai fornitori" };

export default function SpedizionePage() {
  const wired = isDhlConfigured();
  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">E-commerce</p>
      <h1 className="mt-1 font-display text-4xl text-primary">I fornitori spediscono</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Massimo non imballa e non ha un magazzino di merce. Ogni pezzo lo produce un’azienda: quella
        azienda prepara il collo e DHL Express 24h ritira dalla sua sede. Costo verso casa tua:{" "}
        {formatCredits(DHL_EXPRESS_24H_CREDITS)}. Verso casa di Massimo: 0 cr, ma spedisce comunque
        il fornitore.
      </p>
      <ol className="mt-8 max-w-2xl list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>Scegli il pezzo in vetrina. Vedi chi lo produce e da dove parte.</li>
        <li>Paga in crediti. Indica l’indirizzo, oppure casa di Massimo come destinazione.</li>
        <li>Zecca trasmette l’ordine al fornitore e, se il contratto è attivo, prenota il ritiro DHL dalla sede del produttore.</li>
        <li>Il fornitore imballa. DHL ritira da lì. Tu segui il tracking. Massimo non tocca il collo.</li>
      </ol>
      <section className="metal-frame mt-8 max-w-2xl rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Contratto corriere</p>
        <p className="mt-2 font-display text-2xl text-primary">
          {wired ? (isDhlLive() ? "DHL live collegato" : "DHL test collegato") : "DHL in preparazione"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {wired
            ? "Le chiavi DHL sono nel server: al checkout il ritiro viene prenotato sulla sede del fornitore."
            : "Mancano DHL_API_KEY, DHL_API_SECRET e DHL_ACCOUNT_NUMBER. Senza contratto la lettera di vettura è locale: il ritiro vero parte quando le metti nel .env."}
        </p>
      </section>
      <Link href="/vetrina" className={cn(buttonVariants(), "mt-8 inline-flex")}>
        Vai al negozio
      </Link>
    </PageShell>
  );
}
