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
          Gli euro veri, se arrivano, passano da Stripe (ingressi con carta) e dal conto o dal wallet
          del zecchiere (uscite). Questo sito non è una banca, non è la Banca d’Italia, non dispone
          bonifici e non invia crypto da sola.
        </p>
        <p>
          In modalità dimostrativa nessun pagamento si muove. Per i fondi veri servono le chiavi
          Stripe, un sito in HTTPS e il tuo home banking.
        </p>
        <p>
          Coniare crediti non crea una riserva. Il rapporto di copertura (euro Stripe sul circolante)
          sta in Tesoreria. Puoi chiedere un prelievo verso IBAN o wallet: Massimo lo esegue a mano.
          Un off-ramp automatico (hot wallet, exchange, token ERC-20 rimborsabile) è un prodotto
          regolamentato (AML, eventuale IMEL, MiCA): non è incluso in questo sito.
        </p>
      </div>
    </PageShell>
  );
}
