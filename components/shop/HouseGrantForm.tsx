"use client";

import { useActionState, useMemo, useState } from "react";
import { grantHouseCreditsAction } from "@/actions/house";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents, formatUsdFromCents } from "@/lib/format";

const PACKS = [50, 100, 1_000, 10_000, 100_000];

export function HouseGrantForm({
  eurCentsPerCredit,
  usdCentsPerCredit,
}: {
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
}) {
  const [state, action] = useActionState(grantHouseCreditsAction, null);
  const [credits, setCredits] = useState(100);

  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const eur = useMemo(
    () => formatEurFromCents(amount * eurCentsPerCredit),
    [amount, eurCentsPerCredit],
  );
  const usd = useMemo(
    () => formatUsdFromCents(amount * usdCentsPerCredit),
    [amount, usdCentsPerCredit],
  );

  return (
    <form action={action} className="metal-frame space-y-4 rounded-md bg-card p-5 md:p-7">
      <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Casa Fornara</p>
      <h2 className="font-display text-2xl text-primary">Genera crediti senza pagare</h2>
      <p className="text-sm text-muted-foreground">
        Questa email può scrivere la quantità e i crediti nascono nel portafoglio. Nessun bonifico,
        nessuna carta. Poi prelevi il valore in euro o in dollari verso l’IBAN che indichi.
      </p>
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <div className="flex flex-wrap gap-2">
        {PACKS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCredits(n)}
            className={`rounded-md px-3 py-1.5 text-sm ring-1 ring-primary/25 ${
              credits === n ? "bg-primary/20 text-primary" : "bg-background/40"
            }`}
          >
            {formatCredits(n)}
          </button>
        ))}
      </div>
      <label className="block text-sm">
        Quantità
        <Input
          name="credits"
          type="number"
          min={1}
          value={credits || ""}
          onChange={(e) => setCredits(Number(e.target.value))}
          className="mt-1 max-w-xs font-ledger"
        />
      </label>
      <p className="font-ledger text-ember">
        {formatCredits(amount)} → {eur} · {usd}
      </p>
      <SubmitButton disabled={amount <= 0}>Genera crediti</SubmitButton>
    </form>
  );
}
