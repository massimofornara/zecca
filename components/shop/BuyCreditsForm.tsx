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
  demoEnabled,
  treasury,
}: {
  eurCentsPerCredit: number;
  stripeEnabled: boolean;
  demoEnabled: boolean;
  treasury: number;
}) {
  const [state, action] = useActionState(demoBuyCreditsAction, null);
  const [credits, setCredits] = useState(50);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const eur = formatEurFromCents(credits * eurCentsPerCredit);

  async function stripePay() {
    setStripeError(null);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (data.url) window.location.href = data.url;
    else setStripeError(data.error ?? "Stripe non disponibile.");
  }

  return (
    <div className="metal-frame rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error || stripeError} />
      <OkBanner message={state?.ok} />
      {stripeEnabled ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          Pagamenti veri attivi: gli euro entrano sul conto Stripe della zecca. I crediti restano un
          registro interno.
        </p>
      ) : (
        <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm">
          Ora sei in modalità dimostrativa: nessun euro reale si muove. Per i fondi veri il zecchiere
          imposta <span className="font-ledger">STRIPE_SECRET_KEY</span> e il webhook nel{" "}
          <span className="font-ledger">.env</span>.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
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
      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          Crediti da comprare
          <Input
            name="credits"
            type="number"
            min={1}
            value={credits}
            onChange={(e) => setCredits(Number(e.target.value))}
            className="mt-1 max-w-xs"
            form="buy-credits-demo"
          />
        </label>
        <p className="font-ledger text-xl text-ember">{eur}</p>
        <div className="flex flex-wrap gap-3">
          {stripeEnabled && (
            <button
              type="button"
              onClick={stripePay}
              className="h-9 rounded-lg bg-primary px-4 text-sm text-primary-foreground"
            >
              Paga in euro veri (Stripe)
            </button>
          )}
          {demoEnabled && (
            <form id="buy-credits-demo" action={action}>
              <input type="hidden" name="credits" value={credits} />
              <SubmitButton variant={stripeEnabled ? "outline" : "default"}>
                {stripeEnabled ? "Paga in demo" : "Paga in demo (subito)"}
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
