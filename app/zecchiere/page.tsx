import Link from "next/link";
import { formatCredits, formatEurFromCents, formatFiatFromCents } from "@/lib/format";
import { totals } from "@/lib/zecca/ledger";
import { prisma } from "@/lib/db";
import { loyalToday } from "@/lib/zecca/forge";
import { getLiveReport } from "@/lib/live";
import { formatReserveRatio, getReserveReport } from "@/lib/zecca/reserves";
import { getSettings } from "@/lib/zecca/settings";
import { getShopNetworkVault } from "@/lib/zecca/shop-vault";
import { TreasuryConvertForm } from "@/components/zecchiere/FusioniForms";

export const metadata = { title: "Tesoreria" };

export default async function TesoreriaPage() {
  const [flow, pending, loyal, reserve, settings, live, vault] = await Promise.all([
    totals(),
    prisma.cashoutRequest.count({ where: { status: "PENDING" } }),
    loyalToday(),
    getReserveReport(),
    getSettings(),
    getLiveReport(),
    getShopNetworkVault(),
  ]);

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Casa della zecca</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Tesoreria</h1>
      <p className="mt-2 text-muted-foreground">
        Tesoreria crediti e cassa EUR/USD sono il libro. I bitcoin (e l’ETH) che Massimo invia al
        wallet di destinazione sono solo quelli della <strong>cassa di rete</strong>, visibili su
        Mempool e Etherscan. Il prelievo parte da lì: chi riceve non firma.
      </p>

      <section className="metal-frame mt-6 rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Cassa di rete (prelievo crypto)</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Massimo usa questo saldo on-chain in <Link href="/fusione" className="underline hover:text-primary">Prelievo</Link>:
          in pochi secondi parte verso il wallet indicato. Convertire crediti in tesoreria non
          aumenta questi numeri.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Bitcoin</p>
            <p className="font-ledger text-xl text-ember">{vault.btcLabel}</p>
            {vault.btcAddress ? (
              <p className="mt-1 break-all font-ledger text-xs text-muted-foreground">{vault.btcAddress}</p>
            ) : null}
            {vault.btcExplorer ? (
              <a href={vault.btcExplorer} className="mt-1 inline-block text-xs underline hover:text-primary" target="_blank" rel="noreferrer">
                Mempool / Blockstream
              </a>
            ) : null}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ethereum</p>
            <p className="font-ledger text-xl">{vault.ethLabel}</p>
            {vault.evmAddress ? (
              <p className="mt-1 break-all font-ledger text-xs text-muted-foreground">{vault.evmAddress}</p>
            ) : null}
            {vault.ethExplorer ? (
              <a href={vault.ethExplorer} className="mt-1 inline-block text-xs underline hover:text-primary" target="_blank" rel="noreferrer">
                Etherscan
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="metal-frame mt-6 rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Stato fondi</p>
        <p className="mt-1 font-display text-2xl text-primary">
          {live.readyForLive
            ? "Bonifico SEPA attivo"
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

      <section className="metal-frame mt-6 rounded-md bg-card p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Copertura riserve</p>
        <p className="mt-1 font-display text-2xl text-primary">
          {reserve.fullyReserved ? "Coperta" : "Scoperta"} · {formatReserveRatio(reserve.reserveRatio)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Rapporto tra euro incassati (bonifico SEPA confermato, o Stripe se lo usi) e i crediti già nei portafogli (passività). Il conio in
          tesoreria non è riserva: è inventario.
          <a href="/avvertenze" className="underline hover:text-primary">
            Avvertenze
          </a>
          .
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Circolante</p>
            <p className="font-ledger">{formatCredits(reserve.outstandingCredits)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Passività nominali</p>
            <p className="font-ledger">{formatEurFromCents(reserve.liabilityCents)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Riserva euro incassati</p>
            <p className="font-ledger">{formatEurFromCents(reserve.stripeEurCents)}</p>
          </div>
        </div>
      </section>

      <section className="paper mt-6 rounded-md p-6">
        <h2 className="font-display text-2xl">Da fittizio a reale — cosa resta a te</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            In <strong>Versamenti</strong> indica l’IBAN vero della zecca (il conto Unicredit o
            quello della ditta). I clienti lo vedono quando comprano crediti.
          </li>
          <li>
            Il cliente dispone un bonifico SEPA con la causale <span className="font-ledger">ZECCA-XXXXXX</span>.
            Tu confronti importo e causale in banca, poi premi «Accredita i crediti». Nessun webhook.
          </li>
          <li>
            Le fusioni in uscita: copia IBAN e importo, disponi il SEPA dal tuo home banking, poi
            spunta «Ho disposto il bonifico».
          </li>
          <li>
            Stripe resta facoltativo (carte). Non serve per muovere euro.
          </li>
          <li>
            Se vendi in Italia, parla col commercialista (Partita IVA, scontrini, privacy). I crediti
            non sono euro di banca: coniare non crea denaro.
          </li>
        </ol>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Coin label="Crediti in tesoreria" value={formatCredits(flow.treasury)} accent />
        <Coin label="Euro in tesoreria (negozio)" value={formatEurFromCents(flow.treasuryEurCents)} />
        <Coin label="Dollari in tesoreria (negozio)" value={formatFiatFromCents(flow.treasuryUsdCents, "USD")} />
        <Coin label="Coniati" value={formatCredits(flow.minted)} />
        <Coin label="Nei portafogli" value={formatCredits(flow.inWallets)} />
        <Coin label="Euro da vendite (stima)" value={formatEurFromCents(flow.eurNetCents)} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        La cassa negozio EUR/USD cresce solo con la conversione dei crediti di tesoreria. La stima
        da vendite è un flusso a parte (carte/demo meno fusioni clienti).
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Converti crediti in cassa</h2>
        <TreasuryConvertForm
          treasury={flow.treasury}
          eurCentsPerCredit={settings.eurCentsPerCredit}
          usdCentsPerCredit={settings.usdCentsPerCredit}
        />
      </section>

      <section className="paper mt-10 rounded-md p-6">
        <h2 className="font-display text-2xl">Flusso di denaro</h2>
        <p className="mt-1 text-sm opacity-75">
          Cassa negozio (da conversione) e flusso vendite/fusioni clienti restano distinti.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">Cassa negozio EUR</p>
            <p className="font-ledger text-2xl">{formatEurFromCents(flow.treasuryEurCents)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">Cassa negozio USD</p>
            <p className="font-ledger text-2xl">{formatFiatFromCents(flow.treasuryUsdCents, "USD")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">Vendite EUR (stima)</p>
            <p className="font-ledger text-2xl">{formatEurFromCents(flow.eurNetCents)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">Crediti in tesoreria</p>
            <p className="font-ledger text-2xl">{formatCredits(flow.treasury)}</p>
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
