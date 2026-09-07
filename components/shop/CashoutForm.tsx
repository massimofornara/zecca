"use client";

import { useActionState, useState } from "react";
import { requestCashoutAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents } from "@/lib/format";
import { WALLET_NETWORKS } from "@/lib/wallet";

export function CashoutForm({
  available,
  eurCentsPerCredit,
}: {
  available: number;
  percent?: number;
  eurCentsPerCredit: number;
}) {
  const [state, action] = useActionState(requestCashoutAction, null);
  const [kind, setKind] = useState<"IBAN" | "WALLET">("IBAN");
  const disabled = available <= 0;

  return (
    <form action={action} className="metal-frame space-y-4 rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Chiunque abbia crediti può chiedere il prelievo: fino a {formatCredits(available)} (
        {formatEurFromCents(available * eurCentsPerCredit)}). Massimo invia dal suo conto o dal suo
        wallet. Zecca registra la richiesta, non muove i soldi da sola.
      </p>
      <input type="hidden" name="payoutKind" value={kind} />
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm">Dove vuoi ricevere</legend>
        <label className="metal-frame flex cursor-pointer items-center gap-2 rounded-md bg-background/40 px-3 py-2 text-sm">
          <input
            type="radio"
            name="payoutKindUi"
            checked={kind === "IBAN"}
            onChange={() => setKind("IBAN")}
          />
          Conto bancario (IBAN)
        </label>
        <label className="metal-frame flex cursor-pointer items-center gap-2 rounded-md bg-background/40 px-3 py-2 text-sm">
          <input
            type="radio"
            name="payoutKindUi"
            checked={kind === "WALLET"}
            onChange={() => setKind("WALLET")}
          />
          Wallet crypto
        </label>
      </fieldset>
      <label className="block text-sm">
        Crediti da prelevare
        <Input
          name="credits"
          type="number"
          min={1}
          max={Math.max(available, 1)}
          defaultValue={Math.min(available, 20) || 1}
          disabled={disabled}
          className="mt-1 max-w-xs"
        />
      </label>
      {kind === "IBAN" ? (
        <>
          <label className="block text-sm">
            Intestatario del conto
            <Input
              name="ibanHolder"
              required
              disabled={disabled}
              className="mt-1 max-w-md"
              placeholder="Nome e cognome"
            />
          </label>
          <label className="block text-sm">
            IBAN
            <Input
              name="iban"
              required
              disabled={disabled}
              className="mt-1 max-w-md font-ledger"
              placeholder="IT00 X000 0000 0000 0000 0000 000"
              autoComplete="off"
            />
          </label>
        </>
      ) : (
        <>
          <label className="block text-sm">
            Rete
            <select
              name="walletNetwork"
              required
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
              required
              disabled={disabled}
              className="mt-1 max-w-xl font-ledger"
              placeholder="0x… / bc1… / T…"
              autoComplete="off"
            />
          </label>
        </>
      )}
      <SubmitButton disabled={disabled}>
        {disabled ? "Nessun credito da prelevare" : "Chiedi il prelievo al zecchiere"}
      </SubmitButton>
    </form>
  );
}
