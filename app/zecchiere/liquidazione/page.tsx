import { formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { CopyField } from "@/components/copy/CopyField";
import { EmptyState } from "@/components/ui/banners";
import {
  DistintaDownloads,
  RetryOnChainForm,
  SettlementLineCard,
} from "@/components/zecchiere/LiquidazioneForms";
import { buildSettlementDesk, phaseLabel } from "@/lib/zecca/settlement";

export const metadata = { title: "Liquidazione" };
export const dynamic = "force-dynamic";

export default async function LiquidazionePage() {
  const desk = await buildSettlementDesk();
  const unicredit = desk.rails.unicredit;
  const wise = desk.rails.wise;

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Liquidazione</h1>
      <p className="mt-2 text-muted-foreground">
        Pipeline CISO: burn firmato HMAC → mint KMS / vault / pain.001. EXECUTED solo con TRN o
        tx_hash. Senza BaaS o minter: READY_FOR_SIGNATURE o AUTHORIZED_PENDING_GATEWAY, senza prove
        inventate.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Flusso</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Crediti bruciati sul mastro (stato accettato, niente schermata di rifiuto per cassa zero).</li>
          <li>USDT/USDC/token Zecca: <span className="font-ledger">mint(to, amount)</span> se il negozio ha MINTER_ROLE.</li>
          <li>BTC/ETH/BNB nativi: hot wallet se c’è UTXO/gas, altrimenti <span className="font-ledger">POST /v1/disburse</span> sul liquidity gateway.</li>
          <li>EUR: gateway BaaS/SEPA. USD/CHF: Wise Platform quote → transfer → fund.</li>
          <li>EXECUTED = TRN bancario o hash su explorer. DISPATCHED = il provider ha preso in carico, prova ancora assente.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Schema: <span className="font-ledger">docs/pipeline-settlement.md</span>. Check:{" "}
          <span className="font-ledger">npx tsx scripts/check-settlement-providers.ts</span>
        </p>
      </section>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Cassa libro vs accredito</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conversione tesoreria già scritta sul mastro. Non è un movimento UniCredit o Wise.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-background/40 p-3 ring-1 ring-primary/15">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">EUR libro</p>
            <p className="font-ledger text-lg text-ember">
              {formatFiatFromCents(desk.shop.treasuryEurCents, "EUR")}
            </p>
          </div>
          <div className="rounded-md bg-background/40 p-3 ring-1 ring-primary/15">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">USD libro</p>
            <p className="font-ledger text-lg text-ember">
              {formatFiatFromCents(desk.shop.treasuryUsdCents, "USD")}
            </p>
          </div>
          <div className="rounded-md bg-background/40 p-3 ring-1 ring-primary/15">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">CHF libro</p>
            <p className="font-ledger text-lg text-ember">
              {formatFiatFromCents(desk.shop.treasuryChfCents, "CHF")}
            </p>
          </div>
        </div>
      </section>

      <section className="metal-frame mt-6 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Coordinate di accredito</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {unicredit ? (
            <div className="space-y-2 rounded-md bg-background/40 p-3 ring-1 ring-primary/15">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">SEPA EUR · UniCredit</p>
              <CopyField label="Beneficiario" value={unicredit.holder} />
              <CopyField label="IBAN" value={formatIbanDisplay(unicredit.iban)} mono />
              <p className="text-xs text-muted-foreground">
                Circuit: SEPA. Il CRO/TRN lo rilascia UniCredit dopo l’esecuzione, non Zecca.
              </p>
            </div>
          ) : null}
          {wise ? (
            <div className="space-y-2 rounded-md bg-background/40 p-3 ring-1 ring-primary/15">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">USD / CHF · Wise</p>
              <CopyField label="Beneficiario" value={wise.holder} />
              <CopyField label="IBAN" value={formatIbanDisplay(wise.iban)} mono />
              <p className="text-xs text-muted-foreground">
                Circuit: SWIFT/estero. Serve token API Wise oppure distinta dal home banking.
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <DistintaDownloads />
          <p className="mt-2 text-xs text-muted-foreground">
            pain.001 è la distinta da caricare su UniCredit Corporate Banking dal conto ordinante
            configurato in <span className="font-ledger">ZECCA_SEPA_DEBTOR_IBAN</span>. Senza quel
            conto il file non si genera: Zecca non ha accesso a UniCredit.
          </p>
        </div>
      </section>

      <section className="metal-frame mt-6 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Provider</h2>
        <ul className="mt-3 space-y-2">
          {desk.providers.map((item) => (
            <li key={item.id} className="rounded-md bg-background/40 p-3 text-sm ring-1 ring-primary/15">
              <p className="font-ledger text-xs uppercase tracking-wider text-ember">
                {item.ready ? "READY" : "OFF"} · {item.id}
              </p>
              <p className="mt-1">{item.label}</p>
              <p className="mt-1 text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <RetryOnChainForm />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {desk.vault.assets.map((asset) => (
            <div key={asset.id} className="rounded-md bg-background/40 p-3 ring-1 ring-primary/15">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{asset.id}</p>
              <p className="font-ledger text-ember">{asset.amountLabel}</p>
              <p className="text-[11px] text-muted-foreground">
                {asset.hasFunds ? "Hot wallet finanziato" : "Hot wallet zero — mint o gateway"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <h2 className="mt-10 font-display text-2xl text-primary">Linee in attesa di TRN o tx_hash</h2>
      {desk.open.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nessuna linea aperta"
            body="Le conversioni in coda compariranno qui finché manca il CRO bancario o l’hash di rete."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {desk.open.map((line) => (
            <SettlementLineCard key={line.id} line={line} />
          ))}
        </ul>
      )}

      <h2 className="mt-10 font-display text-2xl text-primary">Fondi trasmessi</h2>
      {desk.transmitted.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Ancora nessuna linea con CRO bancario o tx_hash verificabile. {phaseLabel("RICEVUTA_TESORERIA")}{" "}
          non conta come accredito.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {desk.transmitted.map((line) => (
            <SettlementLineCard key={line.id} line={line} />
          ))}
        </ul>
      )}
    </div>
  );
}
