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
          placeholder={isWallet ? "0x… hash già confermato sulla rete" : "CRO UniCredit o ID Wise, non ZECCA/…"}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {isWallet
          ? "Deve esistere sulla rete e andare al wallet di questo prelievo. Zecca non spedisce crypto."
          : "Deve essere il CRO del bonifico già disposto da te. Zecca non entra in UniCredit né in Wise."}
      </p>
      <SubmitButton size="sm" formNoValidate>
        {isWallet ? "Registra hash e chiudi" : "Registra CRO e chiudi"}
      </SubmitButton>
    </form>
  );
}
