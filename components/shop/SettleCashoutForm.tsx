"use client";

import { useActionState } from "react";
import { resolveCashoutAction, type ResolveCashoutState } from "@/actions/admin";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { isShopSendableNetwork } from "@/lib/evm-send";

export function SettleCashoutForm({
  cashoutId,
  payoutKind,
  proofToken,
  walletAddress,
  walletNetwork,
  usdCents,
  shopAddress,
}: {
  cashoutId: string;
  payoutKind: string;
  proofToken?: string | null;
  walletAddress?: string | null;
  walletNetwork?: string | null;
  usdCents?: number;
  shopAddress?: string | null;
}) {
  const [state, action] = useActionState(resolveCashoutAction, null as ResolveCashoutState | null);
  const isWallet = payoutKind === "WALLET";
  const shopSend = isWallet && isShopSendableNetwork(walletNetwork);
  const closed = Boolean(state?.ok && state.status === "PAID");

  return (
    <div className="mt-3 space-y-3">
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
          {shopSend ? (
            <form action={action} className="space-y-2">
              <input type="hidden" name="cashoutId" value={cashoutId} />
              <input type="hidden" name="payoutKind" value="WALLET" />
              {proofToken ? <input type="hidden" name="proofToken" value={proofToken} /> : null}
              <p className="text-sm text-muted-foreground">
                Dopo la conferma il negozio trasmette dal proprio wallet verso{" "}
                <span className="font-ledger text-foreground">{walletAddress}</span>. MetaMask, Trust
                Wallet o l’exchange ricevono: non firmi transazioni e non dai consensi.
                {shopAddress ? (
                  <>
                    {" "}
                    Cassa negozio: <span className="font-ledger">{shopAddress}</span>
                    {(usdCents ?? 0) > 0
                      ? ` · ${(usdCents! / 100).toFixed(2)} USD in ${walletNetwork}`
                      : null}
                    .
                  </>
                ) : (
                  " Serve ZECCA_EVM_PRIVATE_KEY sul server, con saldo reale."
                )}
              </p>
              <SubmitButton size="sm" name="action" value="shopPay" pendingLabel="Invio sulla rete…">
                Conferma: il negozio invia e genera l’hash
              </SubmitButton>
            </form>
          ) : isWallet ? (
            <p className="text-sm text-muted-foreground">
              Bitcoin e Tron non partono dal wallet EVM del negozio. Scegli ETH, USDT, USDC o BNB
              perché chi riceve non debba fare nulla.
            </p>
          ) : null}
          <form action={action} noValidate className="space-y-2">
            <input type="hidden" name="cashoutId" value={cashoutId} />
            <input type="hidden" name="payoutKind" value={isWallet ? "WALLET" : "IBAN"} />
            {proofToken ? <input type="hidden" name="proofToken" value={proofToken} /> : null}
            <input type="hidden" name={isWallet ? "payoutConfirm" : "sepaConfirm"} value="on" />
            <label className="block text-sm">
              {isWallet ? "Hash già sulla rete (solo se l’invio è già partito)" : "CRO / riferimento bonifico (ricevuta)"}
              <Input
                name="receipt"
                required={!isWallet}
                autoComplete="off"
                className="mt-1 font-ledger"
                placeholder={isWallet ? "0x… facoltativo" : "CRO UniCredit o ID Wise, non ZECCA/…"}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {isWallet
                ? "L’hash lo crea la rete dopo l’invio del negozio. Non lo inventa Zecca e non lo firma chi riceve."
                : "Deve essere il CRO del bonifico già disposto da te. Zecca non entra in UniCredit né in Wise."}
            </p>
            <div className="flex flex-wrap gap-2">
              {isWallet ? (
                <SubmitButton size="sm" variant="outline" formNoValidate name="action" value="search">
                  Cerca hash su Etherscan / BscScan / Blockscout
                </SubmitButton>
              ) : null}
              <SubmitButton size="sm" formNoValidate name="action" value="pay" variant={isWallet ? "outline" : "default"}>
                {isWallet ? "Registra hash e chiudi" : "Registra CRO e chiudi"}
              </SubmitButton>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
