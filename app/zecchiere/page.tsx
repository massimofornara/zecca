import { formatCredits, formatEurFromCents } from "@/lib/format";
import { totals } from "@/lib/zecca/ledger";
import { prisma } from "@/lib/db";
import { loyalToday } from "@/lib/zecca/forge";
import { getLiveReport } from "@/lib/live";

export const metadata = { title: "Tesoreria" };

export default async function TesoreriaPage() {
  const [flow, pending, loyal] = await Promise.all([
    totals(),
    prisma.cashoutRequest.count({ where: { status: "PENDING" } }),
    loyalToday(),
  ]);
  const live = getLiveReport();

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Casa della zecca</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Tesoreria</h1>
      <p className="mt-2 text-muted-foreground">
        Massimo, qui vedi il metallo e il registro. Il conio è aperto: la tesoreria batte i crediti
        che servono. Gli euro veri (Stripe in ingresso, bonifico SEPA in uscita) passano dai tuoi
        conti, non da un motore interno.
      </p>

      <section className="metal-frame mt-6 rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Stato fondi</p>
        <p className="mt-1 font-display text-2xl text-primary">
          {live.readyForLive
            ? "Carte live (Stripe)"
            : live.readyForCardPayments
              ? "Carte in test Stripe"
              : "Dimostrativo"}
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {live.checks.map((c) => (
            <li key={c.id}>
              <span className={c.ok ? "text-ember" : "text-muted-foreground"}>{c.ok ? "●" : "○"}</span>{" "}
              <span className="font-medium">{c.title}</span>
              <span className="block pl-4 text-muted-foreground">{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="paper mt-6 rounded-md p-6">
        <h2 className="font-display text-2xl">Da fittizio a reale — cosa resta a te</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Apri un account su <strong>stripe.com</strong>, verifica l’identità e collega il conto
            bancario su cui vuoi ricevere i pagamenti con carta.
          </li>
          <li>
            Copia nel <span className="font-ledger">.env</span> (mai in chat){" "}
            <span className="font-ledger">STRIPE_SECRET_KEY</span> e{" "}
            <span className="font-ledger">STRIPE_WEBHOOK_SECRET</span>. Prima <span className="font-ledger">sk_test_</span>,
            poi <span className="font-ledger">sk_live_</span>.
          </li>
          <li>
            Pubblica il sito in HTTPS e imposta <span className="font-ledger">AUTH_URL</span> e un{" "}
            <span className="font-ledger">AUTH_SECRET</span> nuovo. Webhook:{" "}
            <span className="font-ledger">/api/stripe/webhook</span> → evento{" "}
            <span className="font-ledger">checkout.session.completed</span>.
          </li>
          <li>
            Le fusioni: apri <strong>Fusioni</strong>, copia IBAN e importo, disponi il SEPA dal tuo
            home banking, poi spunta «Ho disposto il bonifico».
          </li>
          <li>
            Se vendi in Italia, parla col commercialista (Partita IVA, scontrini, privacy). I crediti
            non sono euro di banca: coniare non crea denaro.
          </li>
        </ol>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Coin label="Coniati" value={formatCredits(flow.minted)} />
        <Coin label="Tesoreria" value={formatCredits(flow.treasury)} accent />
        <Coin label="Nei portafogli" value={formatCredits(flow.inWallets)} />
        <Coin label="Spesi in bottega" value={formatCredits(flow.spentOnGoods)} />
        <Coin label="Fusi in euro" value={formatCredits(flow.cashedOut)} />
        <Coin label="In fusione (attesa)" value={formatCredits(flow.inEscrow)} />
      </div>

      <section className="paper mt-10 rounded-md p-6">
        <h2 className="font-display text-2xl">Flusso di denaro</h2>
        <p className="mt-1 text-sm opacity-75">Euro entrati dalla vendita di crediti, euro usciti dalle fusioni.</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">EUR in</p>
            <p className="font-ledger text-2xl">{formatEurFromCents(flow.eurInCents)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">EUR out</p>
            <p className="font-ledger text-2xl">{formatEurFromCents(flow.eurOutCents)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">Saldo cassa</p>
            <p className="font-ledger text-2xl">{formatEurFromCents(flow.eurNetCents)}</p>
          </div>
        </div>
        <Bar inCents={flow.eurInCents} outCents={flow.eurOutCents} />
      </section>

      <p className="mt-8 text-sm text-muted-foreground">
        Fusioni in coda: <span className="font-ledger text-ember">{pending}</span>
        {" · "}
        Fedeli oggi: <span className="font-ledger text-ember">{loyal.filter((l) => l.fedele).length}</span>
      </p>
    </div>
  );
}

function Coin({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="metal-frame rounded-md bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-ledger text-xl ${accent ? "text-ember" : ""}`}>{value}</p>
    </div>
  );
}

function Bar({ inCents, outCents }: { inCents: number; outCents: number }) {
  const max = Math.max(inCents, outCents, 1);
  return (
    <div className="mt-6 space-y-3">
      <div>
        <p className="mb-1 text-xs">Entrate</p>
        <div className="h-3 rounded-sm bg-black/20">
          <div
            className="h-3 rounded-sm bg-primary"
            style={{ width: `${(inCents / max) * 100}%` }}
          />
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs">Uscite</p>
        <div className="h-3 rounded-sm bg-black/20">
          <div
            className="h-3 rounded-sm bg-ember"
            style={{ width: `${(outCents / max) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
