"use client";

import { useActionState } from "react";
import { checkoutCartAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { CASA_MASSIMO } from "@/lib/shipping";

export function CheckoutForm() {
  const [state, action] = useActionState(checkoutCartAction, null);
  return (
    <form action={action} className="mt-4 w-full max-w-xl space-y-4">
      <ErrorBanner message={state?.error} />
      <p className="text-sm text-muted-foreground">
        Paga in crediti. Poi il collo parte verso casa tua o verso casa di Massimo a San Rocco al
        Forno. Zecca non è un corriere: il zecchiere imballa e spedisce.
      </p>

      <p className="text-sm">Dove lo spediamo</p>
      <input
        id="ship-customer"
        type="radio"
        name="shipTo"
        value="CUSTOMER"
        defaultChecked
        className="peer/customer sr-only"
      />
      <input
        id="ship-massimo"
        type="radio"
        name="shipTo"
        value="MASSIMO"
        className="peer/massimo sr-only"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label
          htmlFor="ship-customer"
          className="metal-frame cursor-pointer rounded-md bg-background/40 px-3 py-2 text-sm peer-checked/customer:bg-primary/15 peer-checked/customer:text-primary peer-checked/customer:ring-1 peer-checked/customer:ring-primary/40"
        >
          A casa mia
        </label>
        <label
          htmlFor="ship-massimo"
          className="metal-frame cursor-pointer rounded-md bg-background/40 px-3 py-2 text-sm peer-checked/massimo:bg-primary/15 peer-checked/massimo:text-primary peer-checked/massimo:ring-1 peer-checked/massimo:ring-primary/40"
        >
          A casa di Massimo
        </label>
      </div>

      <div className="block space-y-3 peer-checked/massimo:hidden">
        <label className="block text-sm">
          Chi riceve
          <Input name="shipName" className="mt-1" placeholder="Nome e cognome" />
        </label>
        <label className="block text-sm">
          Via e numero
          <Input name="shipStreet" className="mt-1" placeholder="Via Roma 12" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            CAP
            <Input name="shipPostal" className="mt-1 font-ledger" placeholder="18012" />
          </label>
          <label className="block text-sm">
            Città
            <Input name="shipCity" className="mt-1" placeholder="Genova" />
          </label>
        </div>
      </div>

      <div className="hidden rounded-md bg-background/40 p-3 text-sm text-muted-foreground peer-checked/massimo:block">
        <p className="font-medium text-foreground">Casa della Zecca</p>
        <p>
          {CASA_MASSIMO.name}
          <br />
          {CASA_MASSIMO.street}
          <br />
          {CASA_MASSIMO.postal} {CASA_MASSIMO.city}
        </p>
      </div>

      <label className="block text-sm">
        Nota per il collo
        <Input name="shipNote" className="mt-1" placeholder="Campanello, piano, orario…" />
      </label>

      <SubmitButton>Paga in crediti e spedisci</SubmitButton>
    </form>
  );
}
