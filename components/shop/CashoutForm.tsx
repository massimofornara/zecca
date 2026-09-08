"use client";

import { useActionState, useMemo, useState } from "react";
import { requestCashoutAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents, formatUsdFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { WALLET_NETWORKS } from "@/lib/wallet";
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
}: {
  available: number;
  percent?: number;
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
  house?: boolean;
}) {
  const [state, action] = useActionState(requestCashoutAction, null);
  const [credits, setCredits] = useState(Math.min(available, 20) || 1);
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [accountId, setAccountId] = useState<HousePayoutAccount["id"]>("unicredit");
  const disabled = available <= 0;
  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const preview = useMemo(() => {
    if (currency === "USD") return formatUsdFromCents(amount * usdCentsPerCredit);
    return formatEurFromCents(amount * eurCentsPerCredit);
  }, [amount, currency, eurCentsPerCredit, usdCentsPerCredit]);
  const selected = HOUSE_PAYOUT_ACCOUNTS.find((account) => account.id === accountId) ?? HOUSE_PAYOUT_ACCOUNTS[0];

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
          ? "I crediti della casa escono verso UniCredit (euro) o Wise (dollari). Zecca registra la richiesta: il bonifico lo fai tu dalla banca."
          : "Chiunque abbia crediti può chiedere il prelievo: fino a " +
            formatCredits(available) +
            ". Scegli euro o dollari e l’IBAN che deve ricevere il bonifico. Zecca registra la richiesta, non muove i soldi da sola."}
      </p>

      <p className="text-sm">Dove vuoi ricevere</p>
      <input
        id="payout-iban"
        type="radio"
        name="payoutKind"
        value="IBAN"
        defaultChecked
        className="peer/iban sr-only"
      />
      <input
        id="payout-wallet"
        type="radio"
        name="payoutKind"
        value="WALLET"
        className="peer/wallet sr-only"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label
          htmlFor="payout-iban"
          className="metal-frame cursor-pointer rounded-md bg-background/40 px-3 py-2 text-sm peer-checked/iban:bg-primary/15 peer-checked/iban:text-primary peer-checked/iban:ring-1 peer-checked/iban:ring-primary/40"
        >
          Conto bancario (IBAN)
        </label>
        <label
          htmlFor="payout-wallet"
          className="metal-frame cursor-pointer rounded-md bg-background/40 px-3 py-2 text-sm peer-checked/wallet:bg-primary/15 peer-checked/wallet:text-primary peer-checked/wallet:ring-1 peer-checked/wallet:ring-primary/40"
        >
          Wallet crypto
        </label>
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

      <fieldset className="space-y-2">
        <legend className="text-sm">Valuta del bonifico</legend>
        <div className="flex flex-wrap gap-2">
          <label className="metal-frame flex cursor-pointer items-center gap-2 rounded-md bg-background/40 px-3 py-2 text-sm has-[:checked]:bg-primary/15 has-[:checked]:text-primary has-[:checked]:ring-1 has-[:checked]:ring-primary/40">
            <input
              type="radio"
              name="currency"
              value="EUR"
              checked={currency === "EUR"}
              onChange={() => pickCurrency("EUR")}
              className="accent-primary"
            />
            Euro
          </label>
          <label className="metal-frame flex cursor-pointer items-center gap-2 rounded-md bg-background/40 px-3 py-2 text-sm has-[:checked]:bg-primary/15 has-[:checked]:text-primary has-[:checked]:ring-1 has-[:checked]:ring-primary/40">
            <input
              type="radio"
              name="currency"
              value="USD"
              checked={currency === "USD"}
              onChange={() => pickCurrency("USD")}
              className="accent-primary"
            />
            Dollari
          </label>
        </div>
        <p className="font-ledger text-ember">
          {formatCredits(amount)} → {preview}
        </p>
        <p className="text-xs text-muted-foreground">
          Euro: bonifico SEPA su UniCredit. Dollari: bonifico SWIFT/estero su Wise. Tasso: 1 cr ={" "}
          {formatEurFromCents(eurCentsPerCredit)} · 1 cr = {formatUsdFromCents(usdCentsPerCredit)}.
        </p>
      </fieldset>

      <div className="block space-y-4 peer-checked/wallet:hidden">
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
      </div>

      <div className="hidden space-y-4 peer-checked/wallet:block">
        <label className="block text-sm">
          Rete
          <select
            name="walletNetwork"
            disabled={disabled}
            className="mt-1 h-8 w-full max-w-md rounded-lg border border-input bg-background px-2 text-sm"
            defaultValue="ETH"
          >
            {WALLET_NETWORKS.filter((n) => n.id !== "SEPA").map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Indirizzo del wallet
          <Input
            name="walletAddress"
            disabled={disabled}
            className="mt-1 max-w-xl font-ledger"
            placeholder="0x… / bc1… / T…"
            autoComplete="off"
          />
        </label>
      </div>

      <SubmitButton disabled={disabled}>
        {disabled
          ? "Nessun credito da prelevare"
          : house
            ? `Bonifico su ${selected.bank}`
            : "Chiedi il bonifico all’IBAN indicato"}
      </SubmitButton>
    </form>
  );
}
