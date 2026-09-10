"use client";

import { useActionState } from "react";
import { refreshCircleBalanceAction } from "@/actions/admin";
import { CopyField } from "@/components/copy/CopyField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import type { UsdcCassaSnapshot } from "@/lib/zecca/usdc-cassa";

export function CircleCassaCard({ cassa }: { cassa: UsdcCassaSnapshot }) {
  const [state, action] = useActionState(refreshCircleBalanceAction, null);
  const mismatch = cassa.shortfallUsdCents > 0;

  return (
    <section className="metal-frame mt-8 rounded-md bg-card p-5">
      <h2 className="font-display text-2xl text-primary">Cassa USDC reale (Circle SCA)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Convertire crediti aggiorna solo il libro. I prelievi verso MetaMask, Trust o Kraken partono
        solo se questo wallet ha USDC nativo su Base. Il gas è sponsorizzato dal negozio tramite
        Circle Gas Station (addebitato sul conto Circle). La commissione di prelievo resta nel SCA.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Libro USDC</p>
          <p className="font-ledger text-lg text-ember">{cassa.bookLabel}</p>
          <p className="text-xs text-muted-foreground">{cassa.bookCredits.toLocaleString("it-IT")} cr convertiti</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Wallet Circle (on-chain)</p>
          <p className="font-ledger text-lg text-ember">{cassa.chainLabel}</p>
          <p className="text-xs text-muted-foreground">
            {cassa.configured ? "Saldo letto da Circle API" : "Env Circle assenti"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Prelievabile</p>
          <p className="font-ledger text-lg text-ember">
            {(cassa.withdrawableUsdCents / 100).toLocaleString("it-IT", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            USDC
          </p>
          <p className="text-xs text-muted-foreground">min(libro, catena − commissione SCA)</p>
        </div>
      </div>
      {cassa.feeFlatUsdCents > 0 || cassa.feeBps > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Commissione prelievo (Forgia): {(cassa.feeFlatUsdCents / 100).toLocaleString("it-IT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          USDC fissa + {(cassa.feeBps / 100).toLocaleString("it-IT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          %. Resta nel SCA; il netto massimo inviabile è{" "}
          {(cassa.withdrawableUsdCents / 100).toLocaleString("it-IT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          USDC.
        </p>
      ) : null}
      {mismatch ? (
        <p className="mt-4 rounded-md bg-ember/10 px-3 py-2 text-sm text-ember ring-1 ring-ember/30">
          Libro USDC {cassa.bookLabel} ma wallet Circle {cassa.chainLabel} — deposita la differenza
          ({(cassa.shortfallUsdCents / 100).toFixed(2)} USDC) sul SCA prima dei prelievi.
        </p>
      ) : null}
      {cassa.chainError ? <ErrorBanner message={cassa.chainError} /> : null}
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <div className="mt-4 space-y-3">
        <p className="text-sm font-medium">Allinea / ricarica cassa</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>In Circle Console: Gas Station su Base, policy default attiva.</li>
          <li>
            Deposita USDC nativo Base sul SCA del negozio (non ETH, non un altro token).
          </li>
          <li>Premi «Aggiorna saldo Circle». Poi preleva verso MetaMask, Trust o deposito Kraken/MEXC Base.</li>
        </ol>
        <CopyField label="Indirizzo SCA (Base USDC)" value={cassa.shopAddress} mono />
        <form action={action}>
          <SubmitButton size="sm" pendingLabel="Lettura Circle…">
            Aggiorna saldo Circle
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
