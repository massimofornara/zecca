import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/SiteChrome";
import { CopyField } from "@/components/copy/CopyField";
import { PrintButton } from "@/components/shop/PrintButton";
import { prisma } from "@/lib/db";
import { formatRomeDate } from "@/lib/rome-day";
import {
  findGatewayCertificate,
  verifyGatewaySignature,
} from "@/lib/settlement/liquidation-gateway";

export const metadata = { title: "Ricevuta di trasmissione gateway" };
export const dynamic = "force-dynamic";

export default async function RicevutaGatewayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cert = await findGatewayCertificate(id);
  const cashout = cert?.cashoutId
    ? await prisma.cashoutRequest.findUnique({ where: { id: cert.cashoutId } })
    : await prisma.cashoutRequest.findFirst({ where: { receiptRef: id } });
  if (!cert && !cashout) notFound();

  const signed = cert
    ? verifyGatewaySignature(cert)
    : Boolean(cashout?.receiptKind === "GATEWAY_RECEIVED");

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">
        Gateway di liquidazione Zecca
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl text-primary">EXECUTED AND RECEIVED</h1>
        <PrintButton>Stampa ricevuta</PrintButton>
      </div>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Ricevuta di trasmissione firmata dal gateway interno. Non è un hash Mempool, non è un CRO
        UniCredit e non è un ID Wise. Il libro marca la linea ricevuta quando il gateway attesta la
        presa in carico.
      </p>

      <section className="metal-frame mt-8 space-y-4 rounded-md bg-card p-5 md:p-7">
        <p className="font-ledger text-xs uppercase tracking-wider text-ember">
          {signed ? "FIRMA HMAC VALIDA" : "ATTESTAZIONE A LIBRO"} ·{" "}
          {cert?.rail ?? cashout?.walletNetwork ?? cashout?.currency ?? "—"}
        </p>
        <CopyField label="Identificativo trasmissione" value={cert?.id ?? cashout?.receiptRef ?? id} mono />
        {cert ? (
          <>
            <CopyField label="Destinazione" value={cert.destination} mono />
            <CopyField
              label="Importo (centesimi)"
              value={String(cert.amountCents)}
              mono
            />
            <CopyField label="Ricevuto il" value={formatRomeDate(new Date(cert.receivedAt))} />
            <CopyField label="Firma HMAC" value={cert.signature} mono />
            <CopyField label="Hash ricevuta (SHA-256)" value={cert.receiptHash} mono />
            <CopyField label="tx_hash" value="null — non inventato" mono />
            <CopyField label="CRO / TRN / Wise ID" value="null — non inventato" mono />
          </>
        ) : (
          <>
            <CopyField label="Prelievo" value={cashout?.id ?? ""} mono />
            <CopyField label="Hash ricevuta (SHA-256)" value={cashout?.receiptHash ?? ""} mono />
          </>
        )}
        {cashout ? (
          <a
            href={`/ricevuta/${cashout.id}`}
            className="inline-block text-sm text-ember underline-offset-2 hover:underline"
          >
            Apri la ricevuta del prelievo
          </a>
        ) : null}
      </section>
    </PageShell>
  );
}
