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
}: {
  cashoutId: string;
  payoutKind: string;
  proofToken?: string | null;
}) {
  const [state, action] = useActionState(resolveCashoutAction, null as ResolveCashoutState | null);
  const isWallet = payoutKind === "WALLET";
  const closed = Boolean(state?.ok && state.status === "PAID");

  return (
    <form action={action} noValidate className="mt-3 space-y-2">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      {closed ? (
        <CashoutReceipt
          cashoutId={state?.receiptId ?? cashoutId}
          receiptKind={state?.receiptKind ?? null}
          receiptRef={state?.receiptRef ?? null}
          receiptUrl={state?.receiptUrl ?? null}
          receiptHash={state?.receiptHash ?? null}
          walletNetwork={state?.walletNetwork}
          proofToken={state?.proofToken}
        />
      ) : (
        <>
          <input type="hidden" name="cashoutId" value={cashoutId} />
          <input type="hidden" name="payoutKind" value={isWallet ? "WALLET" : "IBAN"} />
          {proofToken ? <input type="hidden" name="proofToken" value={proofToken} /> : null}
          <input type="hidden" name={isWallet ? "payoutConfirm" : "sepaConfirm"} value="on" />
          <label className="block text-sm">
            {isWallet ? "Hash di rete (se lo hai già)" : "CRO / riferimento bonifico (ricevuta)"}
            <Input
              name="receipt"
              required={!isWallet}
              autoComplete="off"
              className="mt-1 font-ledger"
              placeholder={isWallet ? "0x… oppure lascia vuoto e cerca sulla rete" : "CRO UniCredit o ID Wise, non ZECCA/…"}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {isWallet
              ? "Zecca non inventa l’hash: lo legge su Etherscan, Blockscout, BscScan o Mempool dopo che l’invio è sulla rete."
              : "Deve essere il CRO del bonifico già disposto da te. Zecca non entra in UniCredit né in Wise."}
          </p>
          <div className="flex flex-wrap gap-2">
            {isWallet ? (
              <SubmitButton size="sm" formNoValidate name="action" value="search">
                Cerca hash su Etherscan / BscScan / Blockscout
              </SubmitButton>
            ) : null}
            <SubmitButton size="sm" formNoValidate name="action" value="pay">
              {isWallet ? "Registra hash e chiudi" : "Registra CRO e chiudi"}
            </SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}
