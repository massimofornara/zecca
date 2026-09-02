"use client";

import { useActionState, useState } from "react";
import { mintAction } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LOTS = [10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 2_000_000_000];

export function MintForm() {
  const [state, action] = useActionState(mintAction, null);
  const [amount, setAmount] = useState(1_000_000_000);

  return (
    <form action={action} className="metal-frame space-y-4 rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Conio aperto: niente tetto di politica. Un colpo può arrivare a oltre due miliardi di crediti.
        Sono metallo di registro, non euro di banca.
      </p>
      <div className="flex flex-wrap gap-2">
        {LOTS.map((lot) => (
          <button
            key={lot}
            type="button"
            onClick={() => setAmount(lot)}
            className={`rounded-md px-3 py-1.5 text-sm ring-1 ${
              amount === lot ? "bg-primary/20 text-primary ring-primary" : "ring-primary/30 text-muted-foreground"
            }`}
          >
            {lot.toLocaleString("it-IT")} cr
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="amount">Crediti da coniare</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Nota sul lotto</Label>
        <Textarea id="note" name="note" placeholder="Es. Conio aperto della casa" rows={3} />
      </div>
      <SubmitButton>Conia in tesoreria</SubmitButton>
    </form>
  );
}
