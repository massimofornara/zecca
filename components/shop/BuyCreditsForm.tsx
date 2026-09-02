"use client";

import { useActionState, useState } from "react";
import { demoBuyCreditsAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatEurFromCents } from "@/lib/format";

const PACKS = [25, 50, 100, 150, 300];

export function BuyCreditsForm({
  eurCentsPerCredit,
  stripeEnabled,
  treasury,
}: {
  eurCentsPerCredit: number;
  stripeEnabled: boolean;
  treasury: number;
}) {
  const [state, action] = useActionState(demoBuyCreditsAction, null);
  const [credits, setCredits] = useState(50);
  const eur = formatEurFromCents(credits * eurCentsPerCredit);

  async function stripePay() {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (data.url) window.location.href = data.url;
    else alert(data.error ?? "Stripe non disponibile.");
  }

  return (
    <div className="metal-frame rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Tesoreria disponibile:{" "}
        <span className="font-ledger text-foreground">{treasury.toLocaleString("it-IT")} cr</span>. Tasso: 1
        credito = {formatEurFromCents(eurCentsPerCredit)}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {PACKS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setCredits(p)}
            className={`rounded-md px-3 py-1.5 text-sm ring-1 ${
              credits === p ? "bg-primary/20 text-primary ring-primary" : "ring-primary/30 text-muted-foreground"
            }`}
          >
            {p} cr
          </button>
        ))}
      </div>
      <form action={action} className="mt-5 space-y-4">
        <label className="block text-sm">
          Crediti da comprare
          <Input
            name="credits"
            type="number"
            min={1}
            value={credits}
            onChange={(e) => setCredits(Number(e.target.value))}
            className="mt-1 max-w-xs"
          />
        </label>
        <p className="font-ledger text-xl text-ember">{eur}</p>
        <div className="flex flex-wrap gap-3">
          <SubmitButton>Paga in demo (subito)</SubmitButton>
          {stripeEnabled && (
            <button
              type="button"
              onClick={stripePay}
              className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
            >
              Paga con Stripe
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
