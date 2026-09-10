"use client";

import { useActionState, useMemo, useState } from "react";
import { requestCashoutAction, type CashoutActionState } from "@/actions/shop";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SettleCashoutForm } from "@/components/shop/SettleCashoutForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents, formatFiatFromCents, formatUsdFromCents } from "@/lib/format";
import { formatIbanDisplay, isItalianIban, isValidBic } from "@/lib/iban";
import { CIRCLE_USDC_CHAIN, isUsdcCashoutNetwork } from "@/lib/settlement/circle-ref";
import { CRYPTO_ASSETS, cryptoAsset, isValidWalletAddress } from "@/lib/wallet";
import { LEDGER_INT_MAX } from "@/lib/zecca/amount";
import { type FiatCurrency } from "@/lib/zecca/fiat";
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
  chfCentsPerCredit,
  house = false,
  houseName,
  circleReady = false,
  usdcWithdrawableCents = 0,
  usdcBookLabel,
  usdcChainLabel,
}: {
  available: number;
  percent?: number;
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
  chfCentsPerCredit: number;
  house?: boolean;
  houseName?: string | null;
  circleReady?: boolean;
  usdcWithdrawableCents?: number;
  usdcBookLabel?: string;
  usdcChainLabel?: string;
}) {
  const [state, action] = useActionState(requestCashoutAction, null as CashoutActionState | null);
  const [phase, setPhase] = useState<"edit" | "confirm">("edit");
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [credits, setCredits] = useState(
    house ? (available > 0 ? available : 10_000) : Math.min(Math.max(available, 1), 20),
  );
  const [payoutKind, setPayoutKind] = useState<"IBAN" | "WALLET">("IBAN");
  const [currency, setCurrency] = useState<FiatCurrency>("EUR");
  const [accountId, setAccountId] = useState<HousePayoutAccount["id"]>("unicredit");
  const [cryptoId, setCryptoId] = useState<(typeof CRYPTO_ASSETS)[number]["id"]>(house ? "USDT" : "USDC");
  const [walletAddress, setWalletAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [ibanHolder, setIbanHolder] = useState("");
  const [iban, setIban] = useState("");
  const [ibanBic, setIbanBic] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const needsGrant = house && (available <= 0 || amount > available);
  const selected = HOUSE_PAYOUT_ACCOUNTS.find((account) => account.id === accountId) ?? HOUSE_PAYOUT_ACCOUNTS[0];
  const customerAssets = CRYPTO_ASSETS.filter((asset) => asset.id !== "OTHER" && asset.id !== "ZECCA");
  const listedAssets = house
    ? CRYPTO_ASSETS.filter((asset) => asset.id !== "OTHER")
    : [...customerAssets.filter((asset) => asset.id === "USDC"), ...customerAssets.filter((asset) => asset.id !== "USDC")];
  const crypto = cryptoAsset(cryptoId) ?? CRYPTO_ASSETS.find((asset) => asset.id === "USDC") ?? CRYPTO_ASSETS[2];
  const customerUsdc = !house && isUsdcCashoutNetwork(cryptoId);
  const eurLabel = formatEurFromCents(amount * eurCentsPerCredit);
  const usdLabel = formatUsdFromCents(amount * usdCentsPerCredit);
  const chfLabel = formatFiatFromCents(amount * chfCentsPerCredit, "CHF");
  const preview = useMemo(() => {
    if (payoutKind === "WALLET") return `${usdLabel} in ${crypto.ticker}`;
    if (currency === "USD") return usdLabel;
    if (currency === "CHF") return chfLabel;
    return eurLabel;
  }, [payoutKind, currency, eurLabel, usdLabel, chfLabel, crypto.ticker]);
  const done = Boolean(
    state?.receiptId &&
      state.receiptId !== dismissedId,
  );
  const queued = Boolean(
    done &&
      (state?.status === "QUEUED" ||
        state?.receiptKind === "QUEUED_FOR_SETTLEMENT" ||
        state?.receiptKind === "AUTHORIZED_PENDING_GATEWAY" ||
        state?.receiptKind === "READY_FOR_SIGNATURE"),
  );
  const pending = Boolean(done && !queued && (state?.pending || state?.status === "PENDING"));
  const delivered = Boolean(done && state?.status === "PAID");

  function pickCurrency(next: FiatCurrency) {
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
    } else if (!house) {
      if (ibanHolder.trim().length < 2) {
        setFormError("Indica l’intestatario del conto.");
        return;
      }
      if (!isItalianIban(iban)) {
        setFormError("Per il bonifico in euro indica un IBAN italiano (IT, 27 caratteri).");
        return;
      }
      if (ibanBic.trim() && !isValidBic(ibanBic)) {
        setFormError("BIC non valido. Lascia vuoto oppure usa 8 o 11 caratteri (es. UNCRITMM).");
        return;
      }
    }
    setFormError(null);
    setPhase("confirm");
  }

  if (done && state?.receiptId) {
    return (
      <div className="metal-frame relative z-20 space-y-4 rounded-md bg-card p-5 md:p-7">
        <ErrorBanner message={pending && house ? undefined : state.error} />
        <OkBanner message={state.ok} />
        <h2 className="font-display text-2xl text-primary">
          {delivered ? "Fondi trasmessi" : queued ? "Autorizzato, in attesa del gateway" : pending ? "Prelievo aperto" : "Prelievo registrato"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {delivered
            ? "Il destinatario ha una prova di rete o di banca sulla ricevuta."
            : queued
            ? "Istruzione contabile firmata (HMAC). Fiat: READY_FOR_SIGNATURE / pain.001. Crypto nativa: AUTHORIZED_PENDING_GATEWAY. EXECUTED solo con TRN o tx_hash reali."
            : pending
            ? payoutKind === "WALLET"
              ? customerUsdc
                ? "I crediti sono in deposito. L’invio automatico Circle non è partito: la richiesta resta aperta. Massimo può ritentare da Fusioni."
                : "I crediti sono in deposito. Alla conferma il negozio tenta l’invio in pochi secondi."
              : house
                ? "La richiesta è attiva. Copia i dati, invia da banca, poi incolla il CRO qui sotto per chiuderla."
                : "Richiesta aperta. Massimo dispone il bonifico SEPA dal suo conto verso il tuo IBAN. Stripe non accredita te."
            : "CRO sotto chiude il prelievo nel libro."}
        </p>
        <p className="font-ledger text-xl text-ember">
          {formatCredits(amount)} → {preview}
        </p>
        {pending && state.instruction ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background/50 p-3 font-ledger text-xs ring-1 ring-primary/20">
            {state.instruction}
          </pre>
        ) : null}
        {queued ? (
          <CashoutReceipt
            cashoutId={state.receiptId}
            receiptKind={state.receiptKind ?? null}
            receiptRef={state.receiptRef ?? null}
            receiptUrl={state.receiptUrl ?? null}
            receiptHash={state.receiptHash ?? null}
            walletNetwork={state.walletNetwork}
            proofToken={state.proofToken}
          />
        ) : pending ? (
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
                initialError={state.error}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {customerUsdc
                  ? circleReady
                    ? "Se l’invio automatico non è partito, Massimo ritenta «Invia USDC» in Fusioni. Tu non firmi."
                    : "Wallet Circle non configurato. Massimo può ritentare da Fusioni quando le env ci sono. Tu non firmi."
                  : "Massimo conferma: il negozio invia al wallet che hai indicato. Tu ricevi, senza firmare."}
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
          {house
            ? "Questa conferma apre il prelievo. Crypto: il negozio tenta l’invio. IBAN: il bonifico resta da UniCredit o Wise."
            : payoutKind === "WALLET"
              ? customerUsdc
                ? circleReady
                  ? "I crediti diventano USDC al tasso libro (1 USDC = 1 USD). Alla conferma il negozio invia su Base a MetaMask, Trust o un deposito exchange. Tu non firmi e non paghi il gas."
                  : "I crediti diventano USDC al tasso libro (1 USDC = 1 USD). Senza wallet Circle configurato la richiesta resta aperta; Massimo può ritentare da Fusioni. Tu non firmi."
                : "Indichi solo il wallet che riceve. Il negozio invia: tu non firmi."
              : "Massimo dispone il bonifico SEPA dal suo conto verso il tuo IBAN italiano. Stripe, se usato, paga solo il conto bancario collegato a Stripe di Massimo: non accredita te."}
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
                : `${ibanHolder || "intestatario"} · ${iban || "IBAN"}${ibanBic ? ` · BIC ${ibanBic}` : ""}`}
          </p>
          {payoutKind === "WALLET" ? (
            <p className="text-sm text-muted-foreground">
              {customerUsdc
                ? circleReady
                  ? `I crediti diventano ${preview} su Base e partono dal wallet Circle del negozio. Tu non paghi il gas.`
                  : `I crediti diventano ${preview} su Base. Senza Circle la richiesta resta aperta; da Fusioni si può ritentare «Invia USDC».`
                : `I crediti diventano ${preview} e si bruciano sul libro. Il prelievo viene accettato verso il wallet indicato: chi riceve non firma.`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {house
                ? "Per far arrivare i soldi su questo IBAN devi disporre tu il bonifico da un conto con saldo reale. Poi incolla il CRO della banca, non un codice ZECCA/…"
                : "Massimo esegue il SEPA fuori da questa app (home banking). Un payout Stripe non arriva su questo IBAN."}
            </p>
          )}
        </section>
        <input type="hidden" name="credits" value={amount} />
        <input type="hidden" name="payoutKind" value={payoutKind} />
        <input type="hidden" name="currency" value={payoutKind === "WALLET" ? "USD" : house ? currency : "EUR"} />
        <input type="hidden" name="houseAccount" value={accountId} />
        <input type="hidden" name="iban" value={house ? selected.iban : iban} />
        <input type="hidden" name="ibanHolder" value={house ? selected.holder : ibanHolder} />
        <input type="hidden" name="ibanBic" value={house ? "" : ibanBic} />
        <input type="hidden" name="walletNetwork" value={cryptoId} />
        <input type="hidden" name="walletChain" value={isUsdcCashoutNetwork(cryptoId) ? CIRCLE_USDC_CHAIN : ""} />
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
          {house
            ? payoutKind === "WALLET"
              ? "Ho capito: i crediti si convertono nella crypto scelta, si bruciano e il prelievo viene accettato. Chi riceve non firma."
              : "Ho capito: Zecca non accredita questi conti. Il bonifico lo faccio io da UniCredit o Wise."
            : payoutKind === "WALLET"
              ? customerUsdc
                ? circleReady
                  ? "Ho capito: chiedo USDC su Base verso il mio 0x. Il negozio invia; io non firmo e non pago il gas."
                  : "Ho capito: chiedo USDC su Base. Senza wallet Circle la richiesta resta aperta. Io non firmo."
                : "Ho capito: indico solo il wallet che riceve. Non firmo transazioni e non do consensi."
              : "Ho capito: Massimo dispone il SEPA dalla sua banca verso il mio IBAN. Stripe non accredita me."}
        </label>
        <div className="flex flex-wrap gap-3">
          <SubmitButton formNoValidate className="relative z-30 cursor-pointer">
            {house
              ? needsGrant
                ? payoutKind === "WALLET"
                  ? "Conferma"
                  : "Apri la richiesta (genera crediti)"
                : payoutKind === "WALLET"
                  ? "Conferma"
                  : "Apri la richiesta"
              : payoutKind === "WALLET"
                ? "Conferma"
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
          ? payoutKind === "WALLET"
            ? `${houseName ?? "La casa"} genera i crediti, li converte nella crypto scelta e alla conferma il prelievo viene accettato. MetaMask, Trust Wallet o l’exchange ricevono: non firmano.`
            : `${houseName ?? "La casa"} indica destinazione. I crediti escono dal portafoglio solo come richiesta: UniCredit e Wise non vengono accreditati da questo sito.`
          : payoutKind === "WALLET"
            ? customerUsdc
              ? circleReady
                ? usdcWithdrawableCents <= 0
                  ? `USDC su Base: cassa prelevabile ${usdcBookLabel ?? "0"} a libro / ${usdcChainLabel ?? "n.d."} on-chain. Senza deposito Circle l’invio resta aperto. Tu non firmi.`
                  : "USDC su Base: incolla l’indirizzo MetaMask, Trust o il deposito USDC Base di Kraken/MEXC. Prelievo limitato al min(cassa libro, saldo Circle). Tu non firmi e non paghi il gas."
                : "USDC su Base mainnet: 1 credito = 1 USD di libro. Wallet Circle non configurato: la richiesta resta aperta. Tu non firmi."
              : "Indica il wallet che riceve. Massimo conferma l’invio dalla coda Fusioni. Tu non firmi nulla."
            : "Bonifico in euro su IBAN italiano. Massimo dispone il SEPA dal suo conto. Stripe non versa sul tuo IBAN."}
      </p>
      {available <= 0 ? (
        <p className="text-sm text-ember">
          {house
            ? "Portafoglio a zero: dopo la conferma i crediti vengono generati, bruciati e il prelievo verso il wallet indicato viene accettato."
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
            onChange={() => {
              setPayoutKind("IBAN");
              if (!house) setCurrency("EUR");
            }}
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
            ? `${eurLabel} oppure ${usdLabel} verso ${crypto.label} al wallet indicato.`
            : `Bonifico ${
                currency === "USD" ? "in dollari" : currency === "CHF" ? "in franchi svizzeri" : "in euro"
              }${house ? ` su ${selected.bank}` : ""}. Tasso: 1 cr = ${formatEurFromCents(eurCentsPerCredit)} · 1 cr = ${formatUsdFromCents(usdCentsPerCredit)} · 1 cr = ${formatFiatFromCents(chfCentsPerCredit, "CHF")}.`}
        </p>
      </section>

      {payoutKind === "IBAN" ? (
        <fieldset className="space-y-3">
          {house ? (
            <>
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
            <label className={chip}>
              <input
                type="radio"
                checked={currency === "CHF"}
                onChange={() => pickCurrency("CHF")}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              Franchi svizzeri
            </label>
          </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bonifico in euro (SEPA) verso IBAN italiano. Massimo lo dispone dalla banca.
            </p>
          )}
          {house ? (
            <>
              <p className="text-sm">Conto della casa</p>
              <div className="grid gap-2 sm:grid-cols-3">
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
                        {account.holder} ·{" "}
                        {account.preferredCurrency === "USD"
                          ? "Dollari"
                          : account.preferredCurrency === "CHF"
                            ? "Franchi"
                            : "Euro"}
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
                IBAN italiano
                <Input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  className="mt-1 max-w-md font-ledger"
                  placeholder="IT00 X000 0000 0000 0000 0000 000"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                BIC (facoltativo)
                <Input
                  value={ibanBic}
                  onChange={(e) => setIbanBic(e.target.value)}
                  className="mt-1 max-w-md font-ledger"
                  placeholder="UNCRITMM"
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
            {listedAssets.map((asset) => (
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
            {customerUsdc
              ? "Indirizzo 0x su Base (MetaMask, Trust, Kraken o MEXC — deposito USDC Base)"
              : `Wallet che riceve ${crypto.label} (non deve firmare)`}
            <Input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="mt-1 max-w-xl font-ledger"
              placeholder={crypto.hint}
              autoComplete="off"
            />
          </label>
          <p className="text-sm text-muted-foreground">
            {customerUsdc
              ? circleReady
                ? `Destinazione: ${preview} su Base (MetaMask, Trust o deposito exchange). Alla conferma parte dal negozio; tu non paghi il gas.`
                : `Destinazione: ${preview} su Base. Senza CIRCLE_* su Vercel la richiesta resta aperta.`
              : `Destinazione: ${preview}. Alla conferma i crediti restano in deposito finché Massimo conferma l’invio.`}
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
