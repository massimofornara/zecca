"use client";

import { useActionState, useMemo, useState } from "react";
import { requestCashoutAction } from "@/actions/shop";
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
  "metal-frame relative z-10 cursor-pointer rounded-md bg-background/40 px-3 py-2 text-sm has-[:checked]:bg-primary/15 has-[:checked]:text-primary has-[:checked]:ring-1 has-[:checked]:ring-primary/40";

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
  const [state, action] = useActionState(requestCashoutAction, null);
  const [credits, setCredits] = useState(
    house ? (available > 0 ? available : 10_000) : Math.min(Math.max(available, 1), 20),
  );
  const [payoutKind, setPayoutKind] = useState<"IBAN" | "WALLET">("IBAN");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [accountId, setAccountId] = useState<HousePayoutAccount["id"]>("unicredit");
  const [cryptoId, setCryptoId] = useState<(typeof CRYPTO_ASSETS)[number]["id"]>("USDT");
  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const noCredits = available <= 0;
  const selected = HOUSE_PAYOUT_ACCOUNTS.find((account) => account.id === accountId) ?? HOUSE_PAYOUT_ACCOUNTS[0];
  const crypto = cryptoAsset(cryptoId) ?? CRYPTO_ASSETS[2];
  const eurLabel = formatEurFromCents(amount * eurCentsPerCredit);
  const usdLabel = formatUsdFromCents(amount * usdCentsPerCredit);
  const preview = useMemo(() => {
    if (payoutKind === "WALLET") return `${usdLabel} in ${crypto.ticker}`;
    return currency === "USD" ? usdLabel : eurLabel;
  }, [payoutKind, currency, eurLabel, usdLabel, crypto.ticker]);

  function pickCurrency(next: "EUR" | "USD") {
    setCurrency(next);
    if (house) setAccountId(housePayoutForCurrency(next).id);
  }

  return (
    <form action={action} className="metal-frame relative z-10 space-y-4 rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        {house
          ? `${houseName ?? "La casa"} indica i crediti, poi banca o crypto. I pulsanti cambiano la finestra; il valore si aggiorna subito.`
          : "Scegli bonifico o crypto, indica i crediti e la destinazione. Zecca registra la richiesta, non muove i soldi da sola."}
      </p>
      {noCredits ? (
        <p className="text-sm text-ember">
          {house
            ? "Il portafoglio è a zero: premi Genera e preleva — i crediti nascono e la richiesta parte subito."
            : `Non hai crediti da prelevare (disponibili: ${formatCredits(available)}). Premi il pulsante per andare a comprarli.`}
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
            className="sr-only"
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
            className="sr-only"
          />
          Wallet crypto
        </label>
      </div>

      <label className="block text-sm">
        Crediti da prelevare
        <Input
          name="credits"
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
          <input type="hidden" name="currency" value={currency} />
          <div className="flex flex-wrap gap-2">
            <label className={chip}>
              <input
                type="radio"
                name="currencyChoice"
                value="EUR"
                checked={currency === "EUR"}
                onChange={() => pickCurrency("EUR")}
                className="sr-only"
              />
              Euro
            </label>
            <label className={chip}>
              <input
                type="radio"
                name="currencyChoice"
                value="USD"
                checked={currency === "USD"}
                onChange={() => pickCurrency("USD")}
                className="sr-only"
              />
              Dollari
            </label>
          </div>
          {house ? (
            <>
              <input type="hidden" name="houseAccount" value={accountId} />
              <input type="hidden" name="iban" value={selected.iban} />
              <input type="hidden" name="ibanHolder" value={selected.holder} />
              <p className="text-sm">Conto della casa</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {HOUSE_PAYOUT_ACCOUNTS.map((account) => (
                  <label
                    key={account.id}
                    className={`${chip} py-3 ${accountId === account.id ? "bg-primary/15 text-primary ring-1 ring-primary/40" : ""}`}
                  >
                    <input
                      type="radio"
                      name="houseAccountChoice"
                      value={account.id}
                      checked={accountId === account.id}
                      onChange={() => {
                        setAccountId(account.id);
                        setCurrency(account.preferredCurrency);
                      }}
                      className="sr-only"
                    />
                    <span className="block font-display text-base">{account.bank}</span>
                    <span className="mt-1 block font-ledger text-xs">
                      {formatIbanDisplay(account.iban)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {account.holder} · {account.preferredCurrency === "USD" ? "Dollari" : "Euro"}
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm">
                Intestatario del conto
                <Input name="ibanHolder" className="mt-1 max-w-md" placeholder="Nome e cognome" />
              </label>
              <label className="block text-sm">
                IBAN
                <Input
                  name="iban"
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
          <input type="hidden" name="currency" value="USD" />
          <input type="hidden" name="walletNetwork" value={cryptoId} />
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {CRYPTO_ASSETS.filter((asset) => asset.id !== "OTHER").map((asset) => (
              <label
                key={asset.id}
                className={`${chip} py-3 ${cryptoId === asset.id ? "bg-primary/15 text-primary ring-1 ring-primary/40" : ""}`}
              >
                <input
                  type="radio"
                  name="cryptoChoice"
                  value={asset.id}
                  checked={cryptoId === asset.id}
                  onChange={() => setCryptoId(asset.id)}
                  className="sr-only"
                />
                <span className="block font-display text-base">{asset.ticker}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{asset.label}</span>
                <span className="mt-1 block font-ledger text-xs text-ember">{usdLabel}</span>
              </label>
            ))}
          </div>
          <label className="block text-sm">
            Wallet che riceve {crypto.ticker}
            <Input
              name="walletAddress"
              className="mt-1 max-w-xl font-ledger"
              placeholder={crypto.hint}
              autoComplete="off"
            />
          </label>
          <p className="text-xs text-muted-foreground">{crypto.hint}. Indirizzo esatto, senza spazi.</p>
        </fieldset>
      )}

      <SubmitButton disabled={amount <= 0}>
        {house
          ? noCredits || amount > available
            ? "Genera e preleva"
            : payoutKind === "WALLET"
              ? `Chiedi ${crypto.ticker} al wallet indicato`
              : `Bonifico su ${selected.bank}`
          : noCredits || amount > available
            ? "Compra crediti, poi preleva"
            : payoutKind === "WALLET"
              ? `Chiedi ${crypto.ticker} al wallet indicato`
              : "Chiedi il bonifico all’IBAN indicato"}
      </SubmitButton>
    </form>
  );
}
