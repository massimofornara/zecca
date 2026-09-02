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
      <div className="space-y-1.5">
        <Label htmlFor="amount">Crediti da coniare</Label>
        <Input id="amount" name="amount" type="number" min={1} defaultValue={500} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Nota sul lotto</Label>
        <Textarea id="note" name="note" placeholder="Es. Secondo conio di settembre" rows={3} />
      </div>
      <SubmitButton>Conia in tesoreria</SubmitButton>
    </form>
  );
}
