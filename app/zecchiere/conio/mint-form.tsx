"use client";

import { useActionState } from "react";
import { mintAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function MintForm() {
  const [state, action] = useActionState(mintAction, null);

  return (
    <form action={action} className="metal-frame space-y-4 rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Indica <strong>qualsiasi quantità positiva</strong>: i crediti nascono in tesoreria. Coniare
        <strong> non</strong> crea euro in banca né USDC. Per pagare un cliente in USDC il wallet
        Circle deve già avere USDC su Base.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="amount">Quantità da coniare (libera)</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder="Es. 2500"
          required
          className="font-ledger text-lg"
        />
        <p className="text-xs text-muted-foreground">Scrivi tu l’importo. Nessun pacchetto obbligatorio.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Nota sul lotto (facoltativa)</Label>
        <Textarea id="note" name="note" placeholder="Es. Terzo conio di settembre" rows={3} />
      </div>
      <SubmitButton>Conia in tesoreria</SubmitButton>
    </form>
  );
}
