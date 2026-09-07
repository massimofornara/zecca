"use client";

import { useActionState } from "react";
import { checkoutCartAction } from "@/actions/shop";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { CASA_MASSIMO } from "@/lib/shipping";
import { DHL_EXPRESS_24H_CREDITS } from "@/lib/dhl";
import { formatCredits } from "@/lib/format";

export type LastAddress = {
  shipName: string;
  shipStreet: string;
  shipCity: string;
  shipPostal: string;
  shipPhone: string;
};

export function CheckoutForm({ lastAddress }: { lastAddress?: LastAddress | null }) {
  const [state, action] = useActionState(checkoutCartAction, null);
  return (
    <form action={action} className="mt-4 w-full max-w-xl space-y-4">
      <ErrorBanner message={state?.error} />
      <p className="text-sm text-muted-foreground">
        Paga in crediti. Il produttore imballa e <strong>DHL Express 24h</strong> ritira dalla sua
        sede. Massimo non tocca il collo. «A casa di Massimo» è solo la destinazione: spedisce
        comunque il fornitore.
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
          <span className="mt-1 block font-ledger">0 cr · il fornitore spedisce lì</span>
        </label>
      </div>

      <div className="block space-y-3 peer-checked/massimo:hidden">
        <label className="block text-sm">
          Chi riceve
          <Input
            name="shipName"
            className="mt-1"
            placeholder="Nome e cognome"
            defaultValue={lastAddress?.shipName}
          />
        </label>
        <label className="block text-sm">
          Via e numero
          <Input
            name="shipStreet"
            className="mt-1"
            placeholder="Via Roma 12"
            defaultValue={lastAddress?.shipStreet}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            CAP
            <Input
              name="shipPostal"
              className="mt-1 font-ledger"
              placeholder="18012"
              defaultValue={lastAddress?.shipPostal}
            />
          </label>
          <label className="block text-sm">
            Città
            <Input name="shipCity" className="mt-1" placeholder="Genova" defaultValue={lastAddress?.shipCity} />
          </label>
        </div>
        <label className="block text-sm">
          Telefono (per DHL)
          <Input
            name="shipPhone"
            className="mt-1 font-ledger"
            placeholder="+39 333 0000000"
            defaultValue={lastAddress?.shipPhone}
          />
        </label>
      </div>

      <div className="hidden rounded-md bg-background/40 p-3 text-sm text-muted-foreground peer-checked/massimo:block">
        <p className="font-medium text-foreground">Destinazione: casa di Massimo</p>
        <p className="mt-1">Il fornitore spedisce qui. Massimo riceve, non imballa.</p>
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

      <SubmitButton>Paga: spedisce il fornitore</SubmitButton>
    </form>
  );
}
