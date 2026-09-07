"use client";

import { useActionState } from "react";
import { checkoutCartAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { CASA_MASSIMO } from "@/lib/shipping";
import { DHL_EXPRESS_24H_CREDITS } from "@/lib/dhl";
import { formatCredits } from "@/lib/format";

export function CheckoutForm() {
  const [state, action] = useActionState(checkoutCartAction, null);
  return (
    <form action={action} className="mt-4 w-full max-w-xl space-y-4">
      <ErrorBanner message={state?.error} />
      <p className="text-sm text-muted-foreground">
        E-commerce della bottega: paghi in crediti, il collo parte con{" "}
        <strong>DHL Express 24h</strong> da San Rocco al Forno. Consegna in casa di Massimo: niente
        corriere.
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
          A casa mia · DHL Express 24h
          <span className="mt-1 block font-ledger text-ember">
            + {formatCredits(DHL_EXPRESS_24H_CREDITS)}
          </span>
        </label>
        <label
          htmlFor="ship-massimo"
          className="metal-frame cursor-pointer rounded-md bg-background/40 px-3 py-2 text-sm peer-checked/massimo:bg-primary/15 peer-checked/massimo:text-primary peer-checked/massimo:ring-1 peer-checked/massimo:ring-primary/40"
        >
          A casa di Massimo
          <span className="mt-1 block font-ledger">0 cr</span>
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
        <label className="block text-sm">
          Telefono (per DHL)
          <Input name="shipPhone" className="mt-1 font-ledger" placeholder="+39 333 0000000" />
        </label>
      </div>

      <div className="hidden rounded-md bg-background/40 p-3 text-sm text-muted-foreground peer-checked/massimo:block">
        <p className="font-medium text-foreground">Casa della Zecca · ritiro in sede</p>
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

      <SubmitButton>Paga e spedisci con DHL Express 24h</SubmitButton>
    </form>
  );
}
