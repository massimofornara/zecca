import { PageShell } from "@/components/layout/SiteChrome";

export const metadata = { title: "Avvertenze" };

export default function AvvertenzePage() {
  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Libro, non zecca di Stato</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Avvertenze</h1>
      <div className="mt-6 max-w-2xl space-y-4 text-muted-foreground">
        <p>
          Zecca è un registro di crediti e una bottega. Massimo Fornara conia i crediti nel libro
          mastro. Quei crediti <strong>non sono moneta a corso legale</strong> e non sostituiscono
          euro, banconote o depositi bancari.
        </p>
        <p>
          Gli euro veri, se arrivano, passano da Stripe (ingressi con carta) e dal conto della casa
          (uscite IBAN). In prelievo crypto i crediti si convertono nella valuta scelta e il negozio
          crea la transazione: MetaMask, Trust Wallet o l’exchange ricevono, senza firmare. Questo
          sito non è una banca e non è la Banca d’Italia.
        </p>
        <p>
          In modalità dimostrativa nessun pagamento si muove. Per i fondi veri servono le chiavi
          Stripe, un sito in HTTPS e il tuo home banking.
        </p>
        <p>
          Coniare crediti non crea una riserva. Il rapporto di copertura (euro Stripe sul circolante)
          sta in Tesoreria. Puoi chiedere un prelievo verso IBAN o wallet: il bonifico lo esegue
          Massimo a mano; la crypto, se il wallet del negozio è caricato, parte da Zecca e genera un
          hash reale sulla rete. Un off-ramp verso il pubblico resta un prodotto regolamentato
          (AML, eventuale IMEL, MiCA).
        </p>
      </div>
    </PageShell>
  );
}
