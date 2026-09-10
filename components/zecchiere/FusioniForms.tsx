"use client";

import { useActionState, useState } from "react";
import {
  markSepaDisposedAction,
  resolveCashoutAction,
  sendUsdcAction,
  treasuryConvertAction,
  treasuryCryptoWithdrawAction,
  type InternalWithdrawState,
} from "@/actions/admin";
import { CopyField } from "@/components/copy/CopyField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCashoutValue, formatCredits, formatEurFromCents, formatFiatFromCents, formatUsdFromCents } from "@/lib/format";
import { maskIban } from "@/lib/iban";
import { destinationInstruction } from "@/lib/payout";
import { CRYPTO_ASSETS, isValidWalletAddress, walletNetworkLabel } from "@/lib/wallet";
import { isUsdcCashoutNetwork } from "@/lib/settlement/circle-ref";
import { housePayoutByIban } from "@/lib/zecca/house-accounts";
import type { InternalCryptoWallet, TreasuryCryptoAsset } from "@/lib/zecca/convert";
import { isShopSendableNetwork } from "@/lib/evm-send";

const CRYPTO_CHOICES = CRYPTO_ASSETS.filter((asset) =>
  isShopSendableNetwork(asset.id),
) as { id: TreasuryCryptoAsset; label: string; ticker: string; hint: string }[];

const chip =
  "metal-frame relative z-20 flex cursor-pointer items-start gap-2 rounded-md bg-background/40 px-3 py-2 text-sm has-[:checked]:bg-primary/15 has-[:checked]:text-primary has-[:checked]:ring-1 has-[:checked]:ring-primary/40";

export function TreasuryConvertForm({
  treasury,
  eurCentsPerCredit,
  usdCentsPerCredit,
  chfCentsPerCredit,
}: {
  treasury: number;
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
  chfCentsPerCredit: number;
}) {
  const [state, action] = useActionState(
    treasuryConvertAction,
    null as InternalWithdrawState | null,
  );
  const [creditsEur, setCreditsEur] = useState(50);
  const [creditsUsd, setCreditsUsd] = useState(50);
  const [creditsChf, setCreditsChf] = useState(50);
  const [creditsBtc, setCreditsBtc] = useState(10);
  const [creditsEth, setCreditsEth] = useState(10);
  const [creditsUsdt, setCreditsUsdt] = useState(10);
  const [creditsUsdc, setCreditsUsdc] = useState(10);
  const [creditsBnb, setCreditsBnb] = useState(10);
  const [walletBtc, setWalletBtc] = useState("");
  const [walletEvm, setWalletEvm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const previewEur = formatFiatFromCents((creditsEur > 0 ? creditsEur : 0) * eurCentsPerCredit, "EUR");
  const previewUsd = formatFiatFromCents((creditsUsd > 0 ? creditsUsd : 0) * usdCentsPerCredit, "USD");
  const previewChf = formatFiatFromCents((creditsChf > 0 ? creditsChf : 0) * chfCentsPerCredit, "CHF");
  const payouts = state?.payouts?.length ? state.payouts : state?.receiptId
    ? [
        {
          receiptId: state.receiptId,
          receiptKind: state.receiptKind,
          receiptRef: state.receiptRef,
          receiptUrl: state.receiptUrl,
          receiptHash: state.receiptHash,
          walletNetwork: state.walletNetwork,
          walletAddress: state.walletAddress,
          proofToken: state.proofToken,
          status: state.status,
          payoutKind: state.payoutKind,
        },
      ]
    : [];
  const accepted = payouts.length > 0 || Boolean(state?.ok && !state.error);
  const delivered = payouts.some((payout) => payout.status === "PAID");

  if (accepted) {
    return (
      <div className="mt-4 space-y-3">
        {delivered ? (
          <OkBanner message={state?.ok} />
        ) : (
          <OkBanner message={state?.ok || "Autorizzato. In attesa del gateway (pain.001 / minter / vault). Nessun CRO e nessun hash inventati."} />
        )}
        {payouts.map((payout) => (
          <div key={payout.receiptId}>
            <p className="text-sm text-muted-foreground">
              {payout.payoutKind === "IBAN" ? "IBAN" : payout.walletNetwork} ·{" "}
              <span className="font-ledger">{payout.walletAddress}</span>
              {payout.status === "PAID"
                ? " · EXECUTED"
                : payout.receiptKind === "READY_FOR_SIGNATURE"
                  ? " · READY_FOR_SIGNATURE"
                  : " · AUTHORIZED_PENDING_GATEWAY"}
            </p>
            <CashoutReceipt
              cashoutId={payout.receiptId}
              receiptKind={payout.receiptKind ?? null}
              receiptRef={payout.receiptRef ?? null}
              receiptUrl={payout.receiptUrl ?? null}
              receiptHash={payout.receiptHash ?? null}
              walletNetwork={payout.walletNetwork}
              proofToken={payout.proofToken}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        const needsBtc = creditsBtc > 0;
        const needsEvm = creditsEth > 0 || creditsUsdt > 0 || creditsUsdc > 0 || creditsBnb > 0;
        if (needsBtc && !isValidWalletAddress(walletBtc, "BTC")) {
          event.preventDefault();
          setFormError("Indica un indirizzo Bitcoin valido.");
          return;
        }
        if (needsEvm && !isValidWalletAddress(walletEvm, "ETH")) {
          event.preventDefault();
          setFormError("Indica un indirizzo EVM valido (MetaMask / Trust Wallet).");
        }
      }}
    >
      <ErrorBanner message={formError || state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Euro, dollari e franchi: burn a libro e stato READY_FOR_SIGNATURE (pain.001 ISO 20022) o
        AUTHORIZED_PENDING_GATEWAY. Crypto: mint on-chain se il KMS firma; altrimenti istruzione
        autorizzata in attesa di vault. EXECUTED solo con TRN o tx_hash reali.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Crediti → euro (cassa)
          <Input
            name="creditsEur"
            type="number"
            min={0}
            value={creditsEur || ""}
            onChange={(e) => setCreditsEur(Number(e.target.value))}
            className="mt-1 font-ledger"
          />
          <span className="mt-1 block font-ledger text-ember">{previewEur}</span>
        </label>
        <label className="text-sm">
          Crediti → dollari (cassa)
          <Input
            name="creditsUsd"
            type="number"
            min={0}
            value={creditsUsd || ""}
            onChange={(e) => setCreditsUsd(Number(e.target.value))}
            className="mt-1 font-ledger"
          />
          <span className="mt-1 block font-ledger text-ember">{previewUsd}</span>
        </label>
        <label className="text-sm">
          Crediti → franchi (cassa)
          <Input
            name="creditsChf"
            type="number"
            min={0}
            value={creditsChf || ""}
            onChange={(e) => setCreditsChf(Number(e.target.value))}
            className="mt-1 font-ledger"
          />
          <span className="mt-1 block font-ledger text-ember">{previewChf}</span>
        </label>
      </div>
      <div className="space-y-3 rounded-md bg-background/40 p-4 ring-1 ring-primary/15">
        <p className="text-sm font-medium">Crediti → crypto (tutte le reti)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["BTC", creditsBtc, setCreditsBtc],
              ["ETH", creditsEth, setCreditsEth],
              ["USDT", creditsUsdt, setCreditsUsdt],
              ["USDC", creditsUsdc, setCreditsUsdc],
              ["BNB", creditsBnb, setCreditsBnb],
            ] as const
          ).map(([asset, value, setter]) => (
            <label key={asset} className="text-sm">
              {asset}
              <Input
                name={`credits${asset}`}
                type="number"
                min={0}
                value={value || ""}
                onChange={(e) => setter(Number(e.target.value))}
                className="mt-1 font-ledger"
              />
              <span className="mt-1 block font-ledger text-xs text-ember">
                {formatUsdFromCents((value > 0 ? value : 0) * usdCentsPerCredit)}
              </span>
            </label>
          ))}
        </div>
        <label className="block text-sm">
          Wallet Bitcoin
          <Input
            name="walletBtc"
            value={walletBtc}
            onChange={(e) => {
              setWalletBtc(e.target.value);
              setFormError(null);
            }}
            className="mt-1 font-ledger"
            placeholder="bc1…"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          Wallet EVM (ETH, USDT, USDC, BNB — MetaMask / Trust Wallet)
          <Input
            name="walletEvm"
            value={walletEvm}
            onChange={(e) => {
              setWalletEvm(e.target.value);
              setFormError(null);
            }}
            className="mt-1 font-ledger"
            placeholder="0x…"
            autoComplete="off"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Disponibili: {formatCredits(treasury)}. Tasso: 1 cr = {formatEurFromCents(eurCentsPerCredit)}{" "}
        · 1 cr = {formatFiatFromCents(usdCentsPerCredit, "USD")} · 1 cr ={" "}
        {formatFiatFromCents(chfCentsPerCredit, "CHF")}
      </p>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Conversione in corso…">Conferma</SubmitButton>
        <SubmitButton name="executeAll" value="on" pendingLabel="Prelievi in corso…">
          Genera e preleva tutto
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        «Genera e preleva tutto» tenta in pochi secondi mint, vault, SEPA Instant e Wise. Se i
        binari sono spenti i destinatari non ricevono nulla.
      </p>
    </form>
  );
}

export function InternalCryptoWithdrawForm({
  wallets,
  usdCentsPerCredit,
}: {
  wallets: InternalCryptoWallet[];
  usdCentsPerCredit: number;
}) {
  const [state, action] = useActionState(
    treasuryCryptoWithdrawAction,
    null as InternalWithdrawState | null,
  );
  const funded = wallets.filter((wallet) => wallet.remainingCredits > 0);
  const [asset, setAsset] = useState<TreasuryCryptoAsset>(funded[0]?.asset ?? "BTC");
  const [credits, setCredits] = useState(funded[0]?.remainingCredits ?? 0);
  const [walletAddress, setWalletAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const selected = wallets.find((wallet) => wallet.asset === asset) ?? wallets[0];
  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const usdLabel = formatUsdFromCents(amount * usdCentsPerCredit);
  const delivered = Boolean(state?.receiptId && state.status === "PAID");
  const attempted = Boolean(state?.receiptId && (state.status === "PAID" || state.status === "QUEUED"));

  function pickAsset(next: TreasuryCryptoAsset) {
    setAsset(next);
    const wallet = wallets.find((item) => item.asset === next);
    setCredits(wallet?.remainingCredits ?? 0);
    setFormError(null);
  }

  if (attempted && state?.receiptId) {
    return (
      <div className="mt-4 space-y-3">
        {delivered ? (
          <OkBanner message={state.ok} />
        ) : (
          <OkBanner message={state.ok || "Autorizzato. AUTHORIZED_PENDING_GATEWAY."} />
        )}
        <p className="text-sm text-muted-foreground">
          Destinazione <span className="font-ledger">{state.walletAddress}</span>.
          {delivered
            ? " Hash di rete sulla ricevuta."
            : " Istruzione firmata a libro. Mint on-chain quando il KMS e il contratto rispondono."}
        </p>
        <CashoutReceipt
          cashoutId={state.receiptId}
          receiptKind={state.receiptKind ?? null}
          receiptRef={state.receiptRef ?? null}
          receiptUrl={state.receiptUrl ?? null}
          receiptHash={state.receiptHash ?? null}
          walletNetwork={state.walletNetwork}
          proofToken={state.proofToken}
        />
      </div>
    );
  }

  if (funded.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        I wallet interni sono vuoti. Converti crediti di tesoreria in BTC, ETH, USDT, USDC o BNB
        indicando il wallet nel form di conversione, poi preleva da qui se resta saldo.
      </p>
    );
  }

  return (
    <form
      action={action}
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        if (!isValidWalletAddress(walletAddress, asset)) {
          event.preventDefault();
          setFormError(`Indirizzo non valido per ${selected?.label ?? asset}.`);
        }
      }}
    >
      <ErrorBanner message={formError || state?.error} />
      <OkBanner message={state?.ok} />
      <input type="hidden" name="cryptoAsset" value={asset} />
      <input type="hidden" name="confirmed" value="on" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {wallets.map((wallet) => {
          return (
            <label key={wallet.asset} className={chip}>
              <input
                type="radio"
                className="mt-1"
                checked={asset === wallet.asset}
                disabled={wallet.remainingCredits <= 0}
                onChange={() => pickAsset(wallet.asset)}
              />
              <span>
                <span className="block">{wallet.label}</span>
                <span className="block font-ledger text-xs text-ember">{wallet.amountLabel}</span>
                <span className="block text-xs text-muted-foreground">
                  Libro {formatCredits(wallet.remainingCredits)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Crediti da prelevare
          <Input
            name="credits"
            type="number"
            min={1}
            max={selected?.remainingCredits ?? 0}
            value={amount || ""}
            onChange={(e) => setCredits(Number(e.target.value))}
            className="mt-1 font-ledger"
          />
          <span className="mt-1 block font-ledger text-ember">
            {usdLabel} in {selected?.ticker}
          </span>
        </label>
        <label className="text-sm">
          Wallet di destinazione (MetaMask, Trust Wallet, exchange)
          <Input
            name="walletAddress"
            value={walletAddress}
            onChange={(e) => {
              setWalletAddress(e.target.value);
              setFormError(null);
            }}
            className="mt-1 font-ledger"
            placeholder={CRYPTO_CHOICES.find((item) => item.id === asset)?.hint}
            autoComplete="off"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Alla conferma i crediti si bruciano e il negozio tenta l’invio verso {selected?.ticker} in
        pochi secondi. Senza vault o minter i fondi non partono.
      </p>
      <SubmitButton pendingLabel="Conversione in corso…">Conferma prelievo</SubmitButton>
    </form>
  );
}

export function PendingCashoutCard({
  id,
  name,
  email,
  credits,
  eurCents,
  usdCents,
  chfCents = 0,
  currency,
  payoutKind,
  iban,
  ibanHolder,
  ibanBic,
  walletAddress,
  walletNetwork,
  walletChain,
  createdLabel,
  status = "PENDING",
  receiptKind,
  receiptRef,
  receiptHash,
  receiptUrl,
}: {
  id: string;
  name: string;
  email: string;
  credits: number;
  eurCents: number;
  usdCents: number;
  chfCents?: number;
  currency: string;
  payoutKind: string;
  iban: string | null;
  ibanHolder: string | null;
  ibanBic?: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  walletChain?: string | null;
  createdLabel: string;
  status?: string;
  receiptKind?: string | null;
  receiptRef?: string | null;
  receiptHash?: string | null;
  receiptUrl?: string | null;
}) {
  const [payState, payAction] = useActionState(resolveCashoutAction, null);
  const [rejectState, rejectAction] = useActionState(resolveCashoutAction, null);
  const [disposeState, disposeAction] = useActionState(markSepaDisposedAction, null);
  const [usdcState, usdcAction] = useActionState(sendUsdcAction, null);
  const amountLabel = formatCashoutValue({ currency, eurCents, usdCents, chfCents });

  const dest = destinationInstruction({
    payoutKind,
    holder: ibanHolder,
    iban,
    bic: ibanBic,
    walletAddress,
    walletNetwork,
    currency,
    eurCents,
    usdCents,
    chfCents,
    cashoutId: id,
  });
  const isWallet = dest?.kind === "WALLET";
  const usdcOut = isWallet && isUsdcCashoutNetwork(walletNetwork);
  const isUsd = currency === "USD";
  const isChf = currency === "CHF";
  const houseBank = housePayoutByIban(iban, currency);

  return (
    <li className="metal-frame rounded-md bg-card p-4">
      <p>
        {name} <span className="text-muted-foreground">({email})</span>
      </p>
      <p className="font-ledger text-ember">
        {formatCredits(credits)} → {amountLabel}
        {isWallet
          ? ` · ${walletNetworkLabel(walletNetwork)}`
          : houseBank
            ? ` · ${houseBank.bank} · ${houseBank.preferredCurrency}`
            : isUsd
              ? " · IBAN · USD"
              : isChf
                ? " · IBAN · CHF"
                : " · IBAN · EUR"}
      </p>
      <p className="text-xs text-muted-foreground">{createdLabel}</p>
      {status === "QUEUED" ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            Prelievo autorizzato. READY_FOR_SIGNATURE o AUTHORIZED_PENDING_GATEWAY: non è un CRO e
            non è un tx_hash. Liquidazione ritenta il gateway senza inventare prove.
          </p>
          <CashoutReceipt
            cashoutId={id}
            receiptKind={receiptKind ?? null}
            receiptRef={receiptRef ?? null}
            receiptUrl={receiptUrl ?? null}
            receiptHash={receiptHash ?? null}
            walletNetwork={walletNetwork}
          />
        </div>
      ) : null}

      {dest?.kind === "IBAN" && ibanHolder ? (
        <div className="mt-4 space-y-3 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Da incollare in banca</p>
          {houseBank ? <CopyField label="Banca" value={houseBank.bank} /> : null}
          <CopyField label="Beneficiario" value={ibanHolder} />
          <CopyField label="IBAN" value={dest.ibanDisplay} mono />
          {iban ? <CopyField label="IBAN mascherato (libro)" value={maskIban(iban)} mono /> : null}
          {ibanBic ? <CopyField label="BIC" value={ibanBic} mono /> : null}
          <CopyField label="Importo" value={dest.amountLabel ?? amountLabel} mono />
          <CopyField label="Causale" value={dest.causal} mono />
          <CopyField label="Tutto il blocco" value={dest.text} />
          <p className="text-xs text-muted-foreground">
            Il bonifico lo disponi tu da UniCredit o Wise. Stripe, se lo usi, versa solo sul conto
            bancario collegato al tuo account Stripe: non accredita l’IBAN del cliente.
          </p>
        </div>
      ) : dest?.kind === "WALLET" && walletAddress ? (
        <div className="mt-4 space-y-3 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">
            {usdcOut ? "USDC su Base (Circle)" : "Destinazione: il negozio invia qui"}
          </p>
          <CopyField label="Crypto" value={walletNetworkLabel(walletNetwork)} />
          {walletChain ? <CopyField label="Catena" value={walletChain} mono /> : null}
          <CopyField label="Indirizzo che riceve" value={walletAddress} mono />
          <CopyField label="Importo" value={dest.amountLabel ?? amountLabel} mono />
          <CopyField label="Riferimento" value={dest.causal} mono />
          <p className="text-xs text-muted-foreground">
            {usdcOut
              ? "1 USDC = 1 USD di libro, rete Base mainnet (chain 8453). Con CIRCLE_API_KEY + CIRCLE_WALLET_ID + CIRCLE_ENTITY_SECRET l’invio parte in automatico. Questo pulsante ritenta se Circle ha rifiutato o mancavano le env."
              : "MetaMask, Trust Wallet e gli exchange ricevono. Non devono firmare."}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-destructive">
          Manca la destinazione: non pagare finché il cliente non indica IBAN o wallet.
        </p>
      )}

      <ErrorBanner message={payState?.error || rejectState?.error || disposeState?.error || usdcState?.error} />
      <OkBanner message={payState?.ok || rejectState?.ok || disposeState?.ok || usdcState?.ok} />

      {isWallet ? (
        status === "QUEUED" ? null : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {usdcOut ? (
            <form action={usdcAction} className="w-full space-y-2 sm:w-auto">
              <input type="hidden" name="cashoutId" value={id} />
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" name="usdcConfirm" value="on" className="mt-0.5" required />
                Invio USDC nativo su Base dal wallet Circle del negozio. Non è un mint Zecca Gasless.
              </label>
              <SubmitButton size="sm" pendingLabel="Invio USDC…">
                Invia USDC
              </SubmitButton>
            </form>
          ) : null}
          <form action={rejectAction}>
            <input type="hidden" name="cashoutId" value={id} />
            <input type="hidden" name="action" value="reject" />
            <SubmitButton size="sm" variant="outline">
              Annulla
            </SubmitButton>
          </form>
        </div>
        )
      ) : (
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <form action={disposeAction} className="w-full space-y-2 sm:w-auto">
          <input type="hidden" name="cashoutId" value={id} />
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="sepaDisposedConfirm" value="on" className="mt-0.5" required />
            {isUsd
              ? "Ho disposto il bonifico in dollari dalla mia banca verso questo IBAN. Non è un CRO e non è un payout Stripe."
              : isChf
                ? "Ho disposto il bonifico in franchi dalla mia banca verso questo IBAN. Non è un CRO e non è un payout Stripe."
                : "Ho disposto il bonifico SEPA dalla mia banca verso questo IBAN. Non è un CRO e non è un payout Stripe."}
          </label>
          <SubmitButton size="sm" pendingLabel="Registrazione…">
            Segna bonifico disposto
          </SubmitButton>
        </form>
        <form action={payAction} noValidate className="w-full space-y-2 sm:w-auto">
          <input type="hidden" name="cashoutId" value={id} />
          <input type="hidden" name="payoutKind" value="IBAN" />
          <label className="block text-sm">
            CRO / riferimento bonifico (facoltativo, se lo hai)
            <Input
              name="receipt"
              required
              autoComplete="off"
              className="mt-1 max-w-xl font-ledger"
              placeholder="CRO o end-to-end ID"
            />
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="sepaConfirm" value="on" className="mt-0.5" required />
            {isUsd
              ? "Ho il CRO del bonifico in dollari già disposto."
              : isChf
                ? "Ho il CRO del bonifico in franchi già disposto."
                : "Ho il CRO UniCredit del bonifico SEPA già disposto."}
          </label>
          <SubmitButton size="sm" formNoValidate name="action" value="pay">
            Chiudi prelievo con CRO
          </SubmitButton>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="cashoutId" value={id} />
          <input type="hidden" name="action" value="reject" />
          <SubmitButton size="sm" variant="outline">
            Rifiuta
          </SubmitButton>
        </form>
      </div>
      )}
    </li>
  );
}
