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
          Gli euro veri, se arrivano, passano da Stripe (ingressi con carta) e dal conto del
          zecchiere (uscite SEPA). Questo sito non è una banca, non è la Banca d’Italia, non dispone
          bonifici e non può inventare fondi sul tuo IBAN.
        </p>
        <p>
          In modalità dimostrativa nessun pagamento si muove. Per i fondi veri servono le chiavi
          Stripe, un sito in HTTPS e il tuo home banking.
        </p>
      </div>
    </PageShell>
  );
}
