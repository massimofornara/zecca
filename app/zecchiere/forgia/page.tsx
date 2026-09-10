import { saveForgeSettingsForm } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSettings } from "@/lib/zecca/settings";
import { percentFromBps } from "@/lib/zecca/forge-fees";

export const metadata = { title: "Forgia" };

export default async function ForgiaSettingsPage() {
  const settings = await getSettings();
  const tiers = settings.forgeTiers;

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-4xl text-primary">Regola la forgia</h1>
      <p className="mt-2 text-muted-foreground">
        Il tasso in euro, dollari e franchi svizzeri è indipendente (1 cr = X EUR, 1 cr = Y USD, 1
        cr = Z CHF). Il prelievo USDC su Base riusa il tasso USD: 1 USDC = 1 USD di libro. Lo{" "}
        <strong>spread di conversione</strong> (percentuale per € / $ / CHF / USDC) resta in
        tesoreria a libro: solo il netto va in cassa. Sotto: commissione di prelievo USDC (fissa +
        %) trattenuta nel SCA Circle, e policy del gateway crypto. Il conio non crea USDC.
      </p>
      <form action={saveForgeSettingsForm} className="mt-8 space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="eurPerCredit">Euro per un credito</Label>
          <Input
            id="eurPerCredit"
            name="eurPerCredit"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={(settings.eurCentsPerCredit / 100).toFixed(2)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="usdPerCredit">Dollari USA per un credito</Label>
          <Input
            id="usdPerCredit"
            name="usdPerCredit"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={(settings.usdCentsPerCredit / 100).toFixed(2)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Predefinito: 1 cr = 1,00 EUR, 1 cr = 1,08 USD, 1 cr = 0,94 CHF. Non è un cambio
            derivato: li imposti tu.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chfPerCredit">Franchi svizzeri per un credito</Label>
          <Input
            id="chfPerCredit"
            name="chfPerCredit"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={(settings.chfCentsPerCredit / 100).toFixed(2)}
            required
          />
        </div>
        <div className="space-y-4 border-t border-primary/15 pt-6">
          <p className="text-sm uppercase tracking-[0.2em] text-primary/80">Spread di conversione</p>
          <p className="text-sm text-muted-foreground">
            Percentuale trattenuta in tesoreria (libro) quando converti crediti in cassa € / $ / CHF
            / USDC. Il resto entra in cassa negozio. Non è un invio Circle e non crea token.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Spread euro (%)
              <Input
                name="spreadPctEur"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={percentFromBps(settings.spreadBpsEur).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
            <label className="text-sm">
              Spread dollari (%)
              <Input
                name="spreadPctUsd"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={percentFromBps(settings.spreadBpsUsd).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
            <label className="text-sm">
              Spread franchi (%)
              <Input
                name="spreadPctChf"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={percentFromBps(settings.spreadBpsChf).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
            <label className="text-sm">
              Spread USDC (%)
              <Input
                name="spreadPctUsdc"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={percentFromBps(settings.spreadBpsUsdc).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
          </div>
        </div>
        <div className="space-y-4 border-t border-primary/15 pt-6">
          <p className="text-sm uppercase tracking-[0.2em] text-primary/80">Commissione prelievo USDC</p>
          <p className="text-sm text-muted-foreground">
            Fissa + percentuale, scalate dall’importo inviato. La commissione resta nel wallet
            Circle SCA (non viene trasferita). Il gas lo sponsorizza il negozio tramite Gas Station
            (addebitato sul conto Circle), non il destinatario.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Commissione fissa (USDC)
              <Input
                name="usdcWithdrawFeeFlat"
                type="number"
                step="0.01"
                min={0}
                defaultValue={(settings.usdcWithdrawFeeFlatCents / 100).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
            <label className="text-sm">
              Commissione percentuale (%)
              <Input
                name="usdcWithdrawFeePct"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={percentFromBps(settings.usdcWithdrawFeeBps).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
          </div>
        </div>
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-primary/80">Soglie (spesa odierna)</p>
          {tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <label className="text-xs">
                Min
                <Input name={`tier${i}_min`} type="number" defaultValue={tier.minSpent} className="mt-1" />
              </label>
              <label className="text-xs">
                Max (vuoto = ∞)
                <Input
                  name={`tier${i}_max`}
                  type="number"
                  defaultValue={tier.maxSpent ?? ""}
                  className="mt-1"
                />
              </label>
              <label className="text-xs">
                % forgiato
                <Input name={`tier${i}_percent`} type="number" defaultValue={tier.percent} className="mt-1" />
              </label>
            </div>
          ))}
        </div>

        <div className="space-y-4 border-t border-primary/15 pt-6">
          <p className="text-sm uppercase tracking-[0.2em] text-primary/80">Gateway di prelievo crypto</p>
          <p className="text-sm text-muted-foreground">
            Valgono sull’uscita on-chain (Punto 3). Il burn dei crediti resta un fatto di libro: non
            conia satoshi né ether e non scrive hash su Mempool o Etherscan.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Massimale per singolo invio (USD)
              <Input
                name="withdrawMaxUsdPerTx"
                type="number"
                step="0.01"
                min={0.01}
                defaultValue={(settings.withdrawMaxUsdCentsPerTx / 100).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
            <label className="text-sm">
              Massimale giornaliero (USD)
              <Input
                name="withdrawMaxUsdPerDay"
                type="number"
                step="0.01"
                min={0.01}
                defaultValue={(settings.withdrawMaxUsdCentsPerDay / 100).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
            <label className="text-sm">
              Prelievi crypto massimi per ora
              <Input
                name="withdrawMaxCountPerHour"
                type="number"
                min={1}
                step={1}
                defaultValue={settings.withdrawMaxCountPerHour}
                className="mt-1 font-ledger"
                required
              />
            </label>
            <label className="text-sm">
              Soglia minima (USD, 0 = nessuna)
              <Input
                name="withdrawMinUsd"
                type="number"
                step="0.01"
                min={0}
                defaultValue={(settings.withdrawMinUsdCents / 100).toFixed(2)}
                className="mt-1 font-ledger"
                required
              />
            </label>
          </div>
          <label className="block text-sm">
            Whitelist destinazioni (un indirizzo per riga)
            <Textarea
              name="withdrawWhitelist"
              rows={5}
              defaultValue={settings.withdrawWhitelist.join("\n")}
              className="mt-1 font-ledger"
              placeholder={"bc1q…\n0x…"}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              MetaMask, Trust Wallet, IBAN crypto degli exchange. Vuota e senza blocco: restano
              ammessi tutti gli indirizzi validi.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="withdrawWhitelistEnforced"
              defaultChecked={settings.withdrawWhitelistEnforced}
              className="mt-1"
            />
            <span>
              Blocca le destinazioni fuori whitelist. Senza spunta la lista è solo un promemoria.
            </span>
          </label>
        </div>
        <SubmitButton>Salva regole</SubmitButton>
      </form>
    </div>
  );
}
