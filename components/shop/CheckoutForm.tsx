"use client";

import { useActionState } from "react";
import { checkoutCartAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner } from "@/components/ui/banners";

export function CheckoutForm() {
  const [state, action] = useActionState(async () => checkoutCartAction(), null);
  return (
    <form action={action}>
      <ErrorBanner message={state?.error} />
      <div className="mt-2">
        <SubmitButton>Paga in crediti</SubmitButton>
      </div>
    </form>
  );
}
