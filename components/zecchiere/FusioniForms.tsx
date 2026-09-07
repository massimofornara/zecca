"use client";

import { useActionState, useMemo, useState } from "react";
import { resolveCashoutAction, treasuryConvertAction } from "@/actions/admin";
import { CopyField } from "@/components/copy/CopyField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents, formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { sepaInstruction } from "@/lib/sepa";

export function TreasuryConvertForm({
  treasury,
  eurCentsPerCredit,
  usdCentsPerCredit,
}: {
  treasury: number;
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
}) {
  const [state, action] = useActionState(treasuryConvertAction, null);
  const [creditsEur, setCreditsEur] = useState(0);
  const [creditsUsd, setCreditsUsd] = useState(0);

  const previewEur = useMemo(() => {
    const amount = creditsEur > 0 ? Math.floor(creditsEur) : 0;
    return formatFiatFromCents(amount * eurCentsPerCredit, "EUR");
  }, [creditsEur, eurCentsPerCredit]);

  const previewUsd = useMemo(() => {
    const amount = creditsUsd > 0 ? Math.floor(creditsUsd) : 0;
    return formatFiatFromCents(amount * usdCentsPerCredit, "USD");
  }, [creditsUsd, usdCentsPerCredit]);

  return (
    <form action={action} className="mt-4 space-y-4">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Questa conversione aggiorna la <strong>cassa contabile del negozio</strong>: i crediti escono
        dalla tesoreria, euro e dollari entrano nei rispettivi pentolini. Non accredita
        automaticamente un conto bancario. Bonifici e Stripe restano un passo a parte.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Crediti → euro (negozio)
          <Input
            name="creditsEur"
            type="number"
            min={0}
            value={creditsEur || ""}
            onChange={(e) => setCreditsEur(Number(e.target.value))}
            className="mt-1 font-ledger"
            placeholder="0"
          />
          <span className="mt-1 block font-ledger text-ember">{previewEur}</span>
        </label>
        <label className="text-sm">
          Crediti → dollari (negozio)
          <Input
            name="creditsUsd"
            type="number"
            min={0}
            value={creditsUsd || ""}
            onChange={(e) => setCreditsUsd(Number(e.target.value))}
            className="mt-1 font-ledger"
            placeholder="0"
          />
          <span className="mt-1 block font-ledger text-ember">{previewUsd}</span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Disponibili: {formatCredits(treasury)}. Tasso: 1 cr = {formatEurFromCents(eurCentsPerCredit)}{" "}
        · 1 cr = {formatFiatFromCents(usdCentsPerCredit, "USD")}
      </p>
      <SubmitButton>Converti in cassa negozio</SubmitButton>
    </form>
  );
}

export function PendingCashoutCard({
  id,
  name,
  email,
  credits,
  eurCents,
  iban,
  ibanHolder,
  createdLabel,
}: {
  id: string;
  name: string;
  email: string;
  credits: number;
  eurCents: number;
  iban: string | null;
  ibanHolder: string | null;
  createdLabel: string;
}) {
  const [payState, payAction] = useActionState(resolveCashoutAction, null);
  const [rejectState, rejectAction] = useActionState(resolveCashoutAction, null);

  const sepa =
    iban && ibanHolder
      ? sepaInstruction({ holder: ibanHolder, iban, eurCents, cashoutId: id })
      : null;

  return (
    <li className="metal-frame rounded-md bg-card p-4">
      <p>
        {name} <span className="text-muted-foreground">({email})</span>
      </p>
      <p className="font-ledger text-ember">
        {formatCredits(credits)} → {formatEurFromCents(eurCents)}
      </p>
      <p className="text-xs text-muted-foreground">{createdLabel}</p>

      {sepa && iban && ibanHolder ? (
        <div className="mt-4 space-y-3 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Da incollare in banca</p>
          <CopyField label="Beneficiario" value={ibanHolder} />
          <CopyField label="IBAN" value={formatIbanDisplay(iban)} mono />
          <CopyField label="Importo" value={formatEurFromCents(eurCents)} mono />
          <CopyField label="Causale" value={sepa.causal} mono />
          <CopyField label="Tutto il blocco" value={sepa.text} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-destructive">Manca l’IBAN: non pagare finché il cliente non lo indica.</p>
      )}

      <ErrorBanner message={payState?.error || rejectState?.error} />
      <OkBanner message={payState?.ok || rejectState?.ok} />

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <form action={payAction} className="space-y-2">
          <input type="hidden" name="cashoutId" value={id} />
          <input type="hidden" name="action" value="pay" />
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="sepaConfirm" value="on" className="mt-0.5" required />
            Ho disposto il bonifico SEPA da un conto a mio nome verso questo IBAN.
          </label>
          <SubmitButton size="sm">Conferma bonifico eseguito</SubmitButton>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="cashoutId" value={id} />
          <input type="hidden" name="action" value="reject" />
          <SubmitButton size="sm" variant="outline">
            Rifiuta
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
