"use client";

import { useActionState, useMemo, useState } from "react";
import { requestCashoutAction, type CashoutActionState } from "@/actions/shop";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SettleCashoutForm } from "@/components/shop/SettleCashoutForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents, formatUsdFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { CRYPTO_ASSETS, cryptoAsset, isValidWalletAddress } from "@/lib/wallet";
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
  const [bankRef, setBankRef] = useState("");
  const [ibanHolder, setIbanHolder] = useState("");
  const [iban, setIban] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
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
  const pending = Boolean(done && (state?.pending || state?.status === "PENDING"));

  function pickCurrency(next: "EUR" | "USD") {
    setCurrency(next);
    if (house) setAccountId(housePayoutForCurrency(next).id);
  }

  function openConfirm() {
    if (amount <= 0) {
      setFormError("Indica i crediti da prelevare.");
      return;
    }
    if (payoutKind === "WALLET") {
      if (!isValidWalletAddress(walletAddress, cryptoId)) {
        setFormError(`Indirizzo non valido per ${crypto.label}. Controlla rete e wallet.`);
        return;
      }
    }
    setFormError(null);
    setPhase("confirm");
  }

  if (done && state?.receiptId) {
    return (
      <div className="metal-frame relative z-20 space-y-4 rounded-md bg-card p-5 md:p-7">
        <OkBanner message={state.ok} />
        <h2 className="font-display text-2xl text-primary">
          {pending ? "Prelievo aperto" : "Prelievo registrato"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {pending
            ? payoutKind === "WALLET"
              ? "La richiesta è aperta. Esegui l’invio dal wallet: la rete crea l’hash su Etherscan, BscScan o Blockscout."
              : "La richiesta è attiva. Copia i dati, invia da banca o wallet, poi incolla CRO o hash qui sotto per chiuderla."
            : "CRO o hash sotto chiudono il prelievo nel libro. Non sono un accredito creato dal sito."}
        </p>
        <p className="font-ledger text-xl text-ember">
          {formatCredits(amount)} → {preview}
        </p>
        {pending && state.instruction ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background/50 p-3 font-ledger text-xs ring-1 ring-primary/20">
            {state.instruction}
          </pre>
        ) : null}
        {pending ? (
          <>
            <p className="text-sm text-muted-foreground">
              Chiudi il prelievo su questa stessa schermata. Non serve cambiare pagina.
            </p>
            {house ? (
              <SettleCashoutForm
                cashoutId={state.receiptId}
                payoutKind={state.payoutKind ?? payoutKind}
                proofToken={state.proofToken}
                walletAddress={walletAddress}
                walletNetwork={cryptoId}
                usdCents={amount * usdCentsPerCredit}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Massimo chiude la richiesta dopo il bonifico o l’invio crypto.
              </p>
            )}
          </>
        ) : (
          <CashoutReceipt
            cashoutId={state.receiptId}
            receiptKind={state.receiptKind ?? null}
            receiptRef={state.receiptRef ?? null}
            receiptUrl={state.receiptUrl ?? null}
            receiptHash={state.receiptHash ?? null}
            walletNetwork={state.walletNetwork}
            proofToken={state.proofToken}
          />
        )}
        <button
          type="button"
          className="relative z-30 cursor-pointer text-sm text-ember underline-offset-2 hover:underline"
          onClick={() => {
            setDismissedId(state.receiptId ?? null);
            setPhase("edit");
            setTxHash("");
            setBankRef("");
          }}
        >
          Altra richiesta
        </button>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <form action={action} noValidate className="metal-frame relative z-20 space-y-4 rounded-md bg-card p-5 md:p-7">
        <ErrorBanner message={state?.error} />
        <h2 className="font-display text-2xl text-primary">Conferma destinazione</h2>
        <p className="text-sm text-muted-foreground">
          Questa conferma non muove euro, dollari né crypto. Il sito non entra in UniCredit, Wise o nei wallet.
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
            <p className="text-sm text-muted-foreground">
              Invia {preview} a questo wallet. L’hash di rete lo crea il wallet dopo l’invio: lo registri al
              passo successivo, non ora.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Per far arrivare i soldi su questo IBAN devi disporre tu il bonifico da un conto con saldo
              reale. Poi incolla il CRO della banca, non un codice ZECCA/…
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
        <input type="hidden" name="receipt" value={payoutKind === "WALLET" ? txHash : bankRef} />
        {payoutKind === "IBAN" && house ? (
          <label className="block text-sm">
            CRO UniCredit o ID Wise del bonifico già disposto (facoltativo)
            <Input
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              className="mt-1 max-w-xl font-ledger"
              placeholder="CRO della banca, non ZECCA/…"
              autoComplete="off"
            />
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="hidden" name="confirmed" value="on" />
          <input type="checkbox" name="ack" value="on" required className="mt-1 size-4 accent-primary" />
          Ho capito: Zecca non accredita questi conti. Il bonifico o l’invio crypto lo faccio io.
        </label>
        <div className="flex flex-wrap gap-3">
          <SubmitButton formNoValidate className="relative z-30 cursor-pointer">
            {house
              ? needsGrant
                ? "Apri la richiesta (genera crediti)"
                : "Apri la richiesta"
              : "Apri la richiesta"}
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
      <ErrorBanner message={state?.error || formError} />
      <p className="text-sm text-muted-foreground">
        {house
          ? `${houseName ?? "La casa"} indica destinazione. I crediti escono dal portafoglio solo come richiesta: UniCredit, Wise e i wallet non vengono accreditati da questo sito.`
          : "Scegli bonifico o crypto. Massimo invia dalla sua banca o dal suo wallet; Zecca non muove i soldi."}
      </p>
      {available <= 0 ? (
        <p className="text-sm text-ember">
          {house
            ? "Portafoglio a zero: dopo la conferma i crediti vengono generati e la richiesta resta aperta. I soldi non partono."
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
                  <span className="block font-display text-base">{asset.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{asset.ticker}</span>
                  <span className="mt-1 block font-ledger text-xs text-ember">{usdLabel}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="block text-sm">
            Wallet che riceve {crypto.label}
            <Input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="mt-1 max-w-xl font-ledger"
              placeholder={crypto.hint}
              autoComplete="off"
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Da inviare: {preview}. L’hash di rete si registra dopo l’invio, sul prelievo aperto.
          </p>
        </fieldset>
      )}

      <button
        type="button"
        onClick={openConfirm}
        className="relative z-30 inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        Controlla destinazione
      </button>
    </div>
  );
}
