"use client";

import { useActionState, useMemo, useState } from "react";
import { requestCashoutAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents, formatUsdFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { CRYPTO_ASSETS, cryptoAsset } from "@/lib/wallet";
import {
  HOUSE_PAYOUT_ACCOUNTS,
  housePayoutForCurrency,
  type HousePayoutAccount,
} from "@/lib/zecca/house-accounts";

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
  const [credits, setCredits] = useState(Math.min(available, 20) || 1);
  const [payoutKind, setPayoutKind] = useState<"IBAN" | "WALLET">("IBAN");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [accountId, setAccountId] = useState<HousePayoutAccount["id"]>("unicredit");
  const [cryptoId, setCryptoId] = useState<(typeof CRYPTO_ASSETS)[number]["id"]>("USDT");
  const disabled = available <= 0;
  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const selected = HOUSE_PAYOUT_ACCOUNTS.find((account) => account.id === accountId) ?? HOUSE_PAYOUT_ACCOUNTS[0];
  const crypto = cryptoAsset(cryptoId) ?? CRYPTO_ASSETS[2];
  const eurLabel = formatEurFromCents(amount * eurCentsPerCredit);
  const usdLabel = formatUsdFromCents(amount * usdCentsPerCredit);
  const preview = useMemo(() => {
    if (payoutKind === "WALLET") {
      return `${usdLabel} in ${crypto.ticker}`;
    }
    return currency === "USD" ? usdLabel : eurLabel;
  }, [payoutKind, currency, eurLabel, usdLabel, crypto.ticker]);

  function pickCurrency(next: "EUR" | "USD") {
    setCurrency(next);
    if (house) setAccountId(housePayoutForCurrency(next).id);
  }

  return (
    <form action={action} className="metal-frame space-y-4 rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        {house
          ? `${houseName ?? "La casa"} indica i crediti da prelevare. In banca: UniCredit (euro) o Wise (dollari). In crypto: scegli la moneta e il wallet; la finestra mostra il valore da inviare.`
          : "Chiunque abbia crediti può chiedere il prelievo: fino a " +
            formatCredits(available) +
            ". Scegli bonifico o crypto. Zecca registra la richiesta, non muove i soldi da sola."}
      </p>

      <p className="text-sm">Dove vuoi ricevere</p>
      <input type="hidden" name="payoutKind" value={payoutKind} />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPayoutKind("IBAN")}
          className={`metal-frame rounded-md px-3 py-2 text-left text-sm ${
            payoutKind === "IBAN" ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-background/40"
          }`}
        >
          Conto bancario (IBAN)
        </button>
        <button
          type="button"
          onClick={() => {
            setPayoutKind("WALLET");
            setCurrency("USD");
          }}
          className={`metal-frame rounded-md px-3 py-2 text-left text-sm ${
            payoutKind === "WALLET" ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-background/40"
          }`}
        >
          Wallet crypto
        </button>
      </div>

      <label className="block text-sm">
        Crediti da prelevare
        <Input
          name="credits"
          type="number"
          min={1}
          max={Math.max(available, 1)}
          value={disabled ? "" : amount || ""}
          onChange={(e) => setCredits(Number(e.target.value))}
          disabled={disabled}
          className="mt-1 max-w-xs"
        />
      </label>

      <section className="rounded-md bg-background/50 p-4 ring-1 ring-primary/20">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Valore del prelievo</p>
        <p className="mt-2 font-ledger text-xl text-ember">
          {formatCredits(amount)} → {preview}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {payoutKind === "WALLET"
            ? `${eurLabel} oppure ${usdLabel} da inviare in ${crypto.label} al wallet indicato. Zecca non spedisce crypto da sola.`
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
            <button
              type="button"
              onClick={() => pickCurrency("EUR")}
              className={`metal-frame rounded-md px-3 py-2 text-sm ${
                currency === "EUR" ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-background/40"
              }`}
            >
              Euro
            </button>
            <button
              type="button"
              onClick={() => pickCurrency("USD")}
              className={`metal-frame rounded-md px-3 py-2 text-sm ${
                currency === "USD" ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-background/40"
              }`}
            >
              Dollari
            </button>
          </div>
          {house ? (
            <>
              <input type="hidden" name="houseAccount" value={accountId} />
              <input type="hidden" name="iban" value={selected.iban} />
              <input type="hidden" name="ibanHolder" value={selected.holder} />
              <p className="text-sm">Conto della casa</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {HOUSE_PAYOUT_ACCOUNTS.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setAccountId(account.id);
                      setCurrency(account.preferredCurrency);
                    }}
                    className={`metal-frame rounded-md px-3 py-3 text-left text-sm ${
                      accountId === account.id
                        ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                        : "bg-background/40"
                    }`}
                  >
                    <span className="block font-display text-base">{account.bank}</span>
                    <span className="mt-1 block font-ledger text-xs">
                      {formatIbanDisplay(account.iban)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {account.holder} · {account.preferredCurrency === "USD" ? "Dollari" : "Euro"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm">
                Intestatario del conto
                <Input
                  name="ibanHolder"
                  disabled={disabled}
                  className="mt-1 max-w-md"
                  placeholder="Nome e cognome"
                />
              </label>
              <label className="block text-sm">
                IBAN
                <Input
                  name="iban"
                  disabled={disabled}
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
              <button
                key={asset.id}
                type="button"
                disabled={disabled}
                onClick={() => setCryptoId(asset.id)}
                className={`metal-frame rounded-md px-3 py-3 text-left text-sm ${
                  cryptoId === asset.id
                    ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                    : "bg-background/40"
                }`}
              >
                <span className="block font-display text-base">{asset.ticker}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{asset.label}</span>
                <span className="mt-1 block font-ledger text-xs text-ember">
                  {amount > 0 ? `${usdLabel}` : "—"}
                </span>
              </button>
            ))}
          </div>
          <label className="block text-sm">
            Wallet che riceve {crypto.ticker}
            <Input
              name="walletAddress"
              disabled={disabled}
              className="mt-1 max-w-xl font-ledger"
              placeholder={crypto.hint}
              autoComplete="off"
            />
          </label>
          <p className="text-xs text-muted-foreground">{crypto.hint}. Indirizzo esatto, senza spazi.</p>
        </fieldset>
      )}

      <SubmitButton disabled={disabled}>
        {disabled
          ? "Nessun credito da prelevare"
          : payoutKind === "WALLET"
            ? `Chiedi ${crypto.ticker} al wallet indicato`
            : house
              ? `Bonifico su ${selected.bank}`
              : "Chiedi il bonifico all’IBAN indicato"}
      </SubmitButton>
    </form>
  );
}
