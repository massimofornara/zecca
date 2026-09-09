"use client";

import { useActionState } from "react";
import { resolveCashoutAction, type ResolveCashoutState } from "@/actions/admin";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";

export function SettleCashoutForm({
  cashoutId,
  payoutKind,
  proofToken,
  walletAddress,
  walletNetwork,
  usdCents,
  initialError,
}: {
  cashoutId: string;
  payoutKind: string;
  proofToken?: string | null;
  walletAddress?: string | null;
  walletNetwork?: string | null;
  usdCents?: number;
  initialError?: string;
}) {
  const [state, action] = useActionState(resolveCashoutAction, null as ResolveCashoutState | null);
  const isWallet = payoutKind === "WALLET";
  const closed = Boolean(state?.ok && (state.status === "PAID" || state.status === "QUEUED"));

  return (
    <div className="mt-3 space-y-3">
      <ErrorBanner message={closed ? undefined : state?.error || initialError} />
      <OkBanner message={state?.ok} />
      {closed ? (
        <CashoutReceipt
          cashoutId={state?.receiptId ?? cashoutId}
          receiptKind={state?.receiptKind ?? null}
          receiptRef={state?.receiptRef ?? null}
          receiptUrl={state?.receiptUrl ?? null}
          receiptHash={state?.receiptHash ?? null}
          walletNetwork={state?.walletNetwork ?? walletNetwork}
          proofToken={state?.proofToken}
        />
      ) : isWallet ? (
        <p className="text-sm text-muted-foreground">
          Prelievo verso <span className="font-ledger text-foreground">{walletAddress}</span>
          {usdCents ? ` · ${(usdCents / 100).toFixed(2)} USD in ${walletNetwork}` : ""}.
          I crediti sono già bruciati. La ricevuta Zecca è sul libro.
        </p>
      ) : (
        <form action={action} noValidate className="space-y-2">
          <input type="hidden" name="cashoutId" value={cashoutId} />
          <input type="hidden" name="payoutKind" value="IBAN" />
          {proofToken ? <input type="hidden" name="proofToken" value={proofToken} /> : null}
          <input type="hidden" name="sepaConfirm" value="on" />
          <label className="block text-sm">
            CRO / riferimento bonifico (ricevuta)
            <Input
              name="receipt"
              required
              autoComplete="off"
              className="mt-1 font-ledger"
              placeholder="CRO UniCredit o ID Wise, non ZECCA/…"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Deve essere il CRO del bonifico già disposto da te. Zecca non entra in UniCredit né in Wise.
          </p>
          <SubmitButton size="sm" formNoValidate name="action" value="pay">
            Registra CRO e chiudi
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
