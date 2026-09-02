"use client";

import { useActionState } from "react";
import { requestCashoutAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCredits, formatEurFromCents } from "@/lib/format";

export function CashoutForm({
  forged,
  percent,
  eurCentsPerCredit,
}: {
  forged: number;
  percent: number;
  eurCentsPerCredit: number;
}) {
  const [state, action] = useActionState(requestCashoutAction, null);
  const disabled = forged <= 0;

  return (
    <form action={action} className="metal-frame space-y-4 rounded-md bg-card p-5 md:p-7">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Oggi è forgiato il {percent}% del portafoglio: puoi chiedere fino a {formatCredits(forged)} (
        {formatEurFromCents(forged * eurCentsPerCredit)}).
      </p>
      <label className="block text-sm">
        Crediti da fondere
        <Input
          name="credits"
          type="number"
          min={1}
          max={Math.max(forged, 1)}
          defaultValue={Math.min(forged, 20) || 1}
          disabled={disabled}
          className="mt-1 max-w-xs"
        />
      </label>
      <SubmitButton disabled={disabled}>
        {disabled ? "Forgia ancora fredda" : "Invia al zecchiere"}
      </SubmitButton>
    </form>
  );
}
