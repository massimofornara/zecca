"use client";

import { useActionState, useState } from "react";
import { demoBuyCreditsAction, requestBonificoAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatEurFromCents } from "@/lib/format";

const PACKS = [50, 100, 1_000, 10_000, 100_000, 1_000_000];

export function BuyCreditsForm({
  eurCentsPerCredit,
  stripeEnabled,
  demoEnabled,
  bankReady,
  treasury,
}: {
  eurCentsPerCredit: number;
  stripeEnabled: boolean;
  demoEnabled: boolean;
  bankReady: boolean;
  treasury: number;
}) {
  const [demoState, demoAction] = useActionState(demoBuyCreditsAction, null);
  const [bankState, bankAction] = useActionState(requestBonificoAction, null);
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
      <ErrorBanner message={demoState?.error || bankState?.error || stripeError} />
      <OkBanner message={demoState?.ok} />
      {bankReady ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          Euro veri: bonifico SEPA sul conto della zecca. Nessuna carta, nessun webhook. I crediti
          arrivano quando Massimo vede il versamento.
        </p>
      ) : (
        <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm">
          Il zecchiere deve ancora indicare l’IBAN in <span className="font-ledger">Zecchiere → Versamenti</span>.
          Finché manca, qui resta solo la demo.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Tesoreria aperta: {treasury.toLocaleString("it-IT")} cr già battuti. Se non bastano, la zecca
        conia il resto. Tasso: 1 credito = {formatEurFromCents(eurCentsPerCredit)}.
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
          />
        </label>
        <p className="font-ledger text-xl text-ember">{eur}</p>
        <div className="flex flex-wrap gap-3">
          {bankReady && (
            <form action={bankAction}>
              <input type="hidden" name="credits" value={credits} />
              <SubmitButton>Paga con bonifico SEPA</SubmitButton>
            </form>
          )}
          {stripeEnabled && (
            <button
              type="button"
              onClick={stripePay}
              className="h-9 rounded-lg bg-primary/20 px-4 text-sm text-primary ring-1 ring-primary/40"
            >
              Carta (Stripe)
            </button>
          )}
          {demoEnabled && (
            <form action={demoAction}>
              <input type="hidden" name="credits" value={credits} />
              <SubmitButton variant="outline">Paga in demo (subito, senza euro)</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
