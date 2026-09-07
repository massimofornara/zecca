import Link from "next/link";
import { PageShell } from "@/components/layout/SiteChrome";
import { buttonVariants } from "@/components/ui/button";
import { DHL_EXPRESS_24H_CREDITS, isDhlConfigured, isDhlLive } from "@/lib/dhl";
import { formatCredits } from "@/lib/format";
import { CASA_MASSIMO } from "@/lib/shipping";
import { cn } from "@/lib/utils";

export const metadata = { title: "Spedizione DHL Express 24h" };

export default function SpedizionePage() {
  const wired = isDhlConfigured();
  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">E-commerce</p>
      <h1 className="mt-1 font-display text-4xl text-primary">DHL Express 24h</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Oltre a conio, crediti, forgia e prelievo, il negozio è un e-commerce: ricevuta, bolla,
        tracking e DHL Express, ritiro a {CASA_MASSIMO.city}. Destinazione in Italia: 24 ore
        lavorative dopo il ritiro. Costo: {formatCredits(DHL_EXPRESS_24H_CREDITS)}, scalati dal
        portafoglio insieme alla merce.
      </p>
      <ol className="mt-8 max-w-2xl list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>Scegli il pezzo in vetrina e mettilo in cesta.</li>
        <li>Paga in crediti. Indica indirizzo e telefono, oppure casa di Massimo (senza corriere).</li>
        <li>Zecca crea la lettera di vettura DHL e, se il contratto è attivo, prenota il ritiro e chiede l’etichetta.</li>
        <li>Massimo imballa dal banco ordini, stampa la bolla, aggiorna il tracking. DHL ritira. Tu segui la spedizione in Zecca o su DHL.</li>
      </ol>
      <section className="metal-frame mt-8 max-w-2xl rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Contratto corriere</p>
        <p className="mt-2 font-display text-2xl text-primary">
          {wired ? (isDhlLive() ? "DHL live collegato" : "DHL test collegato") : "DHL in preparazione"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {wired
            ? "Le chiavi DHL sono nel server: al checkout la spedizione viene prenotata sull’API Express."
            : "Mancano DHL_API_KEY, DHL_API_SECRET e DHL_ACCOUNT_NUMBER. Senza contratto il negozio prepara comunque tracking e coda: il ritiro vero parte quando Massimo le mette nel .env."}
        </p>
      </section>
      <Link href="/vetrina" className={cn(buttonVariants(), "mt-8 inline-flex")}>
        Vai al negozio
      </Link>
    </PageShell>
  );
}
