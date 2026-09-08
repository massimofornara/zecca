"use client";

import { useActionState } from "react";
import { confirmBonificoAction, saveShopBankAction } from "@/actions/admin";
import { CopyField } from "@/components/copy/CopyField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCredits, formatEurFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";

export function ShopBankForm({
  iban,
  holder,
  bankName,
}: {
  iban: string;
  holder: string;
  bankName: string;
}) {
  const [state, action] = useActionState(saveShopBankAction, null);
  return (
    <form action={action} className="mt-4 space-y-3">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <div className="space-y-1.5">
        <Label htmlFor="holder">Intestatario</Label>
        <Input id="holder" name="holder" defaultValue={holder} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="iban">IBAN della zecca</Label>
        <Input id="iban" name="iban" defaultValue={iban ? formatIbanDisplay(iban) : ""} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bankName">Banca (facoltativo)</Label>
        <Input id="bankName" name="bankName" defaultValue={bankName} />
      </div>
      <SubmitButton>Salva conto</SubmitButton>
    </form>
  );
}

export function PendingBonificoCard({
  id,
  name,
  email,
  credits,
  eurCents,
  reference,
  createdLabel,
}: {
  id: string;
  name: string;
  email: string;
  credits: number;
  eurCents: number;
  reference: string;
  createdLabel: string;
}) {
  const [state, action] = useActionState(confirmBonificoAction, null);
  return (
    <div className="metal-frame rounded-md bg-card p-4">
      <ErrorBanner message={state?.error} />
      <OkBanner message={state?.ok} />
      <p className="font-display text-xl text-primary">{name}</p>
      <p className="text-sm text-muted-foreground">
        {email} · {createdLabel}
      </p>
      <p className="mt-2 font-ledger text-ember">
        {formatCredits(credits)} · {formatEurFromCents(eurCents)}
      </p>
      <div className="mt-3">
        <CopyField label="Causale da trovare in banca" value={reference} mono />
      </div>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="purchaseId" value={id} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="bankConfirm" className="mt-1" />
          Ho visto questo importo sul conto della zecca. Zecca non interroga la banca.
        </label>
        <SubmitButton>Accredita i crediti</SubmitButton>
      </form>
    </div>
  );
}
