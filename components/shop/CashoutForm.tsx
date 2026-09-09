"use client";

import { useActionState, useMemo, useState } from "react";
import { requestCashoutAction, type CashoutActionState } from "@/actions/shop";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents, formatUsdFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { CRYPTO_ASSETS, cryptoAsset } from "@/lib/wallet";
import { LEDGER_INT_MAX } from "@/lib/zecca/amount";
import {
  HOUSE_PAYOUT_ACCOUNTS,
  housePayoutForCurrency,
  type HousePayoutAccount,
} from "@/lib/zecca/house-accounts";

const chip =
  "metal-frame relative z-20 flex cursor-pointer items-start gap-2 rounded-md bg-background/40 px-3 py-2 text-sm has-[:checked]:bg-primary/15 has-[:checked]:text-primary has-[:checked]:ring-1 has-[:checked]:ring-primary/40";

export function CashoutForm({
  available,
  eurCentsPerCredit,
  usdCentsPerCredit,
  house = false,
  houseName,
}: {
  available: number;
  percent?: number;
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
  house?: boolean;
  houseName?: string | null;
}) {
  const [state, action] = useActionState(requestCashoutAction, null as CashoutActionState | null);
  const [phase, setPhase] = useState<"edit" | "confirm">("edit");
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [credits, setCredits] = useState(
    house ? (available > 0 ? available : 10_000) : Math.min(Math.max(available, 1), 20),
  );
  const [payoutKind, setPayoutKind] = useState<"IBAN" | "WALLET">("IBAN");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [accountId, setAccountId] = useState<HousePayoutAccount["id"]>("unicredit");
  const [cryptoId, setCryptoId] = useState<(typeof CRYPTO_ASSETS)[number]["id"]>("USDT");
  const [walletAddress, setWalletAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const [ibanHolder, setIbanHolder] = useState("");
  const [iban, setIban] = useState("");
  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const needsGrant = house && (available <= 0 || amount > available);
  const selected = HOUSE_PAYOUT_ACCOUNTS.find((account) => account.id === accountId) ?? HOUSE_PAYOUT_ACCOUNTS[0];
  const crypto = cryptoAsset(cryptoId) ?? CRYPTO_ASSETS[2];
  const eurLabel = formatEurFromCents(amount * eurCentsPerCredit);
  const usdLabel = formatUsdFromCents(amount * usdCentsPerCredit);
  const preview = useMemo(() => {
    if (payoutKind === "WALLET") return `${usdLabel} in ${crypto.ticker}`;
    return currency === "USD" ? usdLabel : eurLabel;
  }, [payoutKind, currency, eurLabel, usdLabel, crypto.ticker]);
  const done = Boolean(state?.receiptId && !state.error && state.receiptId !== dismissedId);

  function pickCurrency(next: "EUR" | "USD") {
    setCurrency(next);
    if (house) setAccountId(housePayoutForCurrency(next).id);
  }

  function openConfirm() {
    if (amount <= 0) return;
    if (payoutKind === "WALLET" && house && txHash.trim().length < 16) return;
    setPhase("confirm");
  }

  if (done && state?.receiptId) {
    return (
      <div className="metal-frame relative z-20 space-y-4 rounded-md bg-card p-5 md:p-7">
        <OkBanner message={state.ok} />
        <h2 className="font-display text-2xl text-primary">Prelievo confermato</h2>
        <p className="text-sm text-muted-foreground">
          La schermata resta qui. Ricevuta e hash sono sotto: puoi copiarli o stamparli.
        </p>
        <p className="font-ledger text-xl text-ember">
          {formatCredits(amount)} → {preview}
        </p>
        <CashoutReceipt
          cashoutId={state.receiptId}
          receiptKind={state.receiptKind ?? null}
          receiptRef={state.receiptRef ?? null}
          receiptUrl={state.receiptUrl ?? null}
          receiptHash={state.receiptHash ?? null}
          walletNetwork={state.walletNetwork}
        />
        <button
          type="button"
          className="relative z-30 cursor-pointer text-sm text-ember underline-offset-2 hover:underline"
          onClick={() => {
            setDismissedId(state.receiptId ?? null);
            setPhase("edit");
            setTxHash("");
          }}
        >
          Preleva ancora
        </button>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <form action={action} noValidate className="metal-frame relative z-20 space-y-4 rounded-md bg-card p-5 md:p-7">
        <ErrorBanner message={state?.error} />
        <h2 className="font-display text-2xl text-primary">Conferma ricevuta e hash</h2>
        <p className="text-sm text-muted-foreground">
          Controlla destinazione e prova. Il prelievo parte solo dopo questa conferma. Non si chiude la pagina.
        </p>
        <section className="space-y-2 rounded-md bg-background/50 p-4 ring-1 ring-primary/20">
          <p className="font-ledger text-xl text-ember">
            {formatCredits(amount)} → {preview}
          </p>
          <p className="text-sm">
            {payoutKind === "WALLET"
              ? `${crypto.label} · ${walletAddress || "wallet da indicare"}`
              : house
                ? `${selected.bank} · ${formatIbanDisplay(selected.iban)} · ${selected.holder}`
                : `${ibanHolder || "intestatario"} · ${iban || "IBAN"}`}
          </p>
          {payoutKind === "WALLET" ? (
            <p className="break-all font-ledger text-sm text-ember">{txHash || "Manca l’hash di rete"}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Dopo la conferma ricevi il riferimento bancario ZECCA/… e l’hash SHA-256 della ricevuta.
            </p>
          )}
        </section>
        <input type="hidden" name="credits" value={amount} />
        <input type="hidden" name="payoutKind" value={payoutKind} />
        <input type="hidden" name="currency" value={payoutKind === "WALLET" ? "USD" : currency} />
        <input type="hidden" name="houseAccount" value={accountId} />
        <input type="hidden" name="iban" value={house ? selected.iban : iban} />
        <input type="hidden" name="ibanHolder" value={house ? selected.holder : ibanHolder} />
        <input type="hidden" name="walletNetwork" value={cryptoId} />
        <input type="hidden" name="walletAddress" value={walletAddress} />
        <input type="hidden" name="receipt" value={txHash} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmed" value="on" required className="mt-1 size-4 accent-primary" />
          Confermo destinazione, ricevuta e hash. Esegui il prelievo.
        </label>
        <div className="flex flex-wrap gap-3">
          <SubmitButton formNoValidate className="relative z-30 cursor-pointer">
            {house
              ? needsGrant
                ? "Confermo: genera e preleva"
                : "Confermo e preleva"
              : "Confermo la richiesta"}
          </SubmitButton>
          <button
            type="button"
            className="relative z-30 cursor-pointer text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setPhase("edit")}
          >
            Indietro
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="metal-frame relative z-20 space-y-4 rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <p className="text-sm text-muted-foreground">
        {house
          ? `${houseName ?? "La casa"} prepara il prelievo. Alla conferma successiva escono i crediti, con ricevuta e hash.`
          : "Scegli bonifico o crypto. Alla schermata dopo confermi, poi parte la richiesta."}
      </p>
      {available <= 0 ? (
        <p className="text-sm text-ember">
          {house
            ? "Portafoglio a zero: dopo la conferma i crediti vengono generati e prelevati."
            : `Non hai crediti da prelevare (disponibili: ${formatCredits(available)}).`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Disponibili: {formatCredits(available)}</p>
      )}

      <p className="text-sm">Dove vuoi ricevere</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={chip}>
          <input
            type="radio"
            name="payoutKind"
            value="IBAN"
            checked={payoutKind === "IBAN"}
            onChange={() => setPayoutKind("IBAN")}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          Conto bancario (IBAN)
        </label>
        <label className={chip}>
          <input
            type="radio"
            name="payoutKind"
            value="WALLET"
            checked={payoutKind === "WALLET"}
            onChange={() => {
              setPayoutKind("WALLET");
              setCurrency("USD");
            }}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          Wallet crypto
        </label>
      </div>

      <label className="block text-sm">
        Crediti da prelevare
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          max={house ? LEDGER_INT_MAX : available > 0 ? available : undefined}
          value={amount || ""}
          onChange={(e) => setCredits(Number(e.target.value))}
          className="mt-1 max-w-xs font-ledger"
        />
      </label>

      <section className="rounded-md bg-background/50 p-4 ring-1 ring-primary/20">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Valore del prelievo</p>
        <p className="mt-2 font-ledger text-xl text-ember">
          {formatCredits(amount)} → {preview}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {payoutKind === "WALLET"
            ? `${eurLabel} oppure ${usdLabel} da inviare in ${crypto.label} al wallet indicato.`
            : `Bonifico ${currency === "USD" ? "in dollari" : "in euro"}${
                house ? ` su ${selected.bank}` : ""
              }. Tasso: 1 cr = ${formatEurFromCents(eurCentsPerCredit)} · 1 cr = ${formatUsdFromCents(usdCentsPerCredit)}.`}
        </p>
      </section>

      {payoutKind === "IBAN" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm">Valuta del bonifico</legend>
          <div className="flex flex-wrap gap-2">
            <label className={chip}>
              <input
                type="radio"
                checked={currency === "EUR"}
                onChange={() => pickCurrency("EUR")}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              Euro
            </label>
            <label className={chip}>
              <input
                type="radio"
                checked={currency === "USD"}
                onChange={() => pickCurrency("USD")}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              Dollari
            </label>
          </div>
          {house ? (
            <>
              <p className="text-sm">Conto della casa</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {HOUSE_PAYOUT_ACCOUNTS.map((account) => (
                  <label key={account.id} className={`${chip} py-3`}>
                    <input
                      type="radio"
                      checked={accountId === account.id}
                      onChange={() => {
                        setAccountId(account.id);
                        setCurrency(account.preferredCurrency);
                      }}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-display text-base">{account.bank}</span>
                      <span className="mt-1 block font-ledger text-xs">
                        {formatIbanDisplay(account.iban)}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {account.holder} · {account.preferredCurrency === "USD" ? "Dollari" : "Euro"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm">
                Intestatario del conto
                <Input
                  value={ibanHolder}
                  onChange={(e) => setIbanHolder(e.target.value)}
                  className="mt-1 max-w-md"
                  placeholder="Nome e cognome"
                />
              </label>
              <label className="block text-sm">
                IBAN
                <Input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  className="mt-1 max-w-md font-ledger"
                  placeholder="IT00 X000 0000 0000 0000 0000 000"
                  autoComplete="off"
                />
              </label>
            </>
          )}
        </fieldset>
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-sm">Crypto da inviare</legend>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {CRYPTO_ASSETS.filter((asset) => asset.id !== "OTHER").map((asset) => (
              <label key={asset.id} className={`${chip} py-3`}>
                <input
                  type="radio"
                  checked={cryptoId === asset.id}
                  onChange={() => setCryptoId(asset.id)}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block font-display text-base">{asset.ticker}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{asset.label}</span>
                  <span className="mt-1 block font-ledger text-xs text-ember">{usdLabel}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="block text-sm">
            Wallet che riceve {crypto.ticker}
            <Input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="mt-1 max-w-xl font-ledger"
              placeholder={crypto.hint}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            Hash reale della transazione (ricevuta)
            <Input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              className="mt-1 max-w-xl font-ledger"
              placeholder="0x… hash già confermato sulla rete"
              autoComplete="off"
            />
          </label>
        </fieldset>
      )}

      <button
        type="button"
        onClick={openConfirm}
        className="relative z-30 inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        {payoutKind === "WALLET" ? "Controlla hash e conferma" : "Controlla ricevuta e conferma"}
      </button>
    </div>
  );
}
