"use client";

import { useActionState } from "react";
import { settleQueuedCashoutsAction, resolveCashoutAction, transmitAllFundsAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { CopyField } from "@/components/copy/CopyField";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SettlementLine } from "@/lib/zecca/settlement";

function phaseLabel(phase: SettlementLine["phase"]) {
  if (phase === "FONDI_TRASMESSI") return "EXECUTED · fondi trasmessi";
  if (phase === "INVIATO_AL_PROVIDER") return "Inviato al provider";
  if (phase === "READY_FOR_SIGNATURE") return "READY_FOR_SIGNATURE";
  if (phase === "AUTHORIZED_PENDING_GATEWAY") return "AUTHORIZED_PENDING_GATEWAY";
  return "Ricevuta tesoreria (libro)";
}

export function RetryOnChainForm() {
  const [state, action] = useActionState(transmitAllFundsAction, null);
  const [retryState, retryAction] = useActionState(settleQueuedCashoutsAction, null);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-2">
        <ErrorBanner message={state?.error} />
        <OkBanner message={state?.ok} />
        <SubmitButton pendingLabel="Trasmissione in corso…">Trasmetti tutti i fondi</SubmitButton>
        <p className="text-xs text-muted-foreground">
          Tenta ogni linea aperta in pochi secondi: mint/transfer, SEPA Instant, Wise. Senza cassa
          di rete o banca collegata i fondi non partono: nessun CRO e nessun hash inventato.
        </p>
      </form>
      <form action={retryAction} className="space-y-2">
        <ErrorBanner message={retryState?.error} />
        <OkBanner message={retryState?.ok} />
        <SubmitButton size="sm" variant="outline" pendingLabel="Ritentativo in corso…">
          Solo crypto on-chain
        </SubmitButton>
      </form>
    </div>
  );
}

export function AttachBankRefForm({
  cashoutId,
  currency,
}: {
  cashoutId: string;
  currency: string;
}) {
  const [state, action] = useActionState(resolveCashoutAction, null);
  const closed = Boolean(state?.ok && state.status === "PAID");
  return (
    <div className="mt-3 space-y-2">
      <ErrorBanner message={closed ? undefined : state?.error} />
      <OkBanner message={state?.ok} />
      {closed ? (
        <CashoutReceipt
          cashoutId={state?.receiptId ?? cashoutId}
          receiptKind={state?.receiptKind ?? null}
          receiptRef={state?.receiptRef ?? null}
          receiptUrl={state?.receiptUrl ?? null}
          receiptHash={state?.receiptHash ?? null}
        />
      ) : (
        <form action={action} noValidate className="space-y-2">
          <input type="hidden" name="cashoutId" value={cashoutId} />
          <input type="hidden" name="payoutKind" value="IBAN" />
          <input type="hidden" name="sepaConfirm" value="on" />
          <label className="block text-sm">
            CRO UniCredit / ID Wise
            <Input
              name="receipt"
              required
              autoComplete="off"
              className="mt-1 font-ledger"
              placeholder="Solo il riferimento della banca, non ZECCA/…"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {currency === "EUR"
              ? "Dopo il SEPA da UniCredit Corporate o home banking."
              : "Dopo la distinta Wise. Un codice ZECCA/… viene rifiutato."}
          </p>
          <SubmitButton size="sm" formNoValidate name="action" value="pay">
            Allega TRN e marca fondi trasmessi
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function SettlementLineCard({ line }: { line: SettlementLine }) {
  const transmitted = line.phase === "FONDI_TRASMESSI";
  return (
    <li className="metal-frame rounded-md bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-ledger text-ember">
            {line.asset} · {line.amountLabel}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{line.destination}</p>
          <p className="text-xs text-muted-foreground">{line.destinationDetail}</p>
        </div>
        <Badge variant={transmitted ? "default" : "outline"}>{phaseLabel(line.phase)}</Badge>
      </div>
      {line.bookRef ? (
        <div className="mt-3">
          <CopyField
            label={line.phase === "INVIATO_AL_PROVIDER" ? "Rif. provider" : "Ricevuta tesoreria"}
            value={line.bookRef}
            mono
          />
        </div>
      ) : null}
      {line.bankOrChainRef ? (
        <div className="mt-2">
          <CopyField
            label={line.rail === "WALLET" ? "tx_hash" : "CRO / TRN"}
            value={line.bankOrChainRef}
            mono
          />
        </div>
      ) : null}
      {line.explorerUrl ? (
        <a
          href={line.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-ember underline-offset-2 hover:underline"
        >
          Apri sull’explorer
        </a>
      ) : null}
      {line.blocker ? <p className="mt-3 text-sm text-muted-foreground">{line.blocker}</p> : null}
      {line.rail === "IBAN" && !transmitted ? (
        <AttachBankRefForm cashoutId={line.id} currency={line.currency} />
      ) : null}
    </li>
  );
}

export function DistintaDownloads() {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href="/api/liquidazione/pain001"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}
      >
        Scarica pain.001 UniCredit (EUR)
      </a>
      <a
        href="/api/liquidazione/csv"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}
      >
        Scarica distinta CSV
      </a>
    </div>
  );
}
