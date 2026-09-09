"use client";

import { useActionState } from "react";
import { resolveCashoutAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";

export function SettleCashoutForm({
  cashoutId,
  payoutKind,
}: {
  cashoutId: string;
  payoutKind: string;
}) {
  const [state, action] = useActionState(resolveCashoutAction, null);
  const isWallet = payoutKind === "WALLET";

  return (
    <form action={action} noValidate className="mt-3 space-y-2">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <input type="hidden" name="cashoutId" value={cashoutId} />
      <input type="hidden" name="action" value="pay" />
      <input type="hidden" name="payoutKind" value={isWallet ? "WALLET" : "IBAN"} />
      <input type="hidden" name={isWallet ? "payoutConfirm" : "sepaConfirm"} value="on" />
      <label className="block text-sm">
        {isWallet ? "Hash reale della transazione (ricevuta)" : "CRO / riferimento bonifico (ricevuta)"}
        <Input
          name="receipt"
          required
          autoComplete="off"
          className="mt-1 font-ledger"
          placeholder={isWallet ? "0x… hash già confermato sulla rete" : "CRO o end-to-end ID"}
        />
      </label>
      {isWallet ? (
        <p className="text-xs text-muted-foreground">
          Deve esistere sulla rete e andare al wallet di questo prelievo. Un hash inventato viene rifiutato.
        </p>
      ) : null}
      <SubmitButton size="sm" formNoValidate>
        {isWallet ? "Registra hash e chiudi" : "Registra CRO e chiudi"}
      </SubmitButton>
    </form>
  );
}
