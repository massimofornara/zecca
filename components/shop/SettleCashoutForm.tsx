"use client";

import { useActionState } from "react";
import { resolveCashoutAction, type ResolveCashoutState } from "@/actions/admin";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SendCryptoHashButton } from "@/components/shop/SendCryptoHashButton";
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
}: {
  cashoutId: string;
  payoutKind: string;
  proofToken?: string | null;
  walletAddress?: string | null;
  walletNetwork?: string | null;
  usdCents?: number;
}) {
  const [state, action] = useActionState(resolveCashoutAction, null as ResolveCashoutState | null);
  const isWallet = payoutKind === "WALLET";
  const closed = Boolean(state?.ok && state.status === "PAID");

  function submitHash(hash: string) {
    const data = new FormData();
    data.set("cashoutId", cashoutId);
    data.set("action", "pay");
    data.set("payoutKind", "WALLET");
    data.set("payoutConfirm", "on");
    data.set("receipt", hash);
    if (proofToken) data.set("proofToken", proofToken);
    action(data);
  }

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
          walletNetwork={state?.walletNetwork ?? walletNetwork}
          proofToken={state?.proofToken}
        />
      ) : (
        <>
          <input type="hidden" name="cashoutId" value={cashoutId} />
          <input type="hidden" name="payoutKind" value={isWallet ? "WALLET" : "IBAN"} />
          {proofToken ? <input type="hidden" name="proofToken" value={proofToken} /> : null}
          <input type="hidden" name={isWallet ? "payoutConfirm" : "sepaConfirm"} value="on" />
          {isWallet && walletAddress && walletNetwork && (usdCents ?? 0) > 0 ? (
            <SendCryptoHashButton
              walletAddress={walletAddress}
              walletNetwork={walletNetwork}
              usdCents={usdCents ?? 0}
              disabled={Boolean(state?.ok)}
              onHash={submitHash}
            />
          ) : null}
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
              ? "L’hash reale lo crea la rete dopo l’invio (Etherscan, BscScan, Blockscout). Zecca non lo inventa."
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
