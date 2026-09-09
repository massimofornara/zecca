import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SettleCashoutForm } from "@/components/shop/SettleCashoutForm";
import { PrintButton } from "@/components/shop/PrintButton";
import { CopyField } from "@/components/copy/CopyField";
import { formatCashoutValue, formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { walletNetworkLabel } from "@/lib/wallet";
import { housePayoutLabel } from "@/lib/zecca/house-accounts";
import { isHouseEmail } from "@/lib/zecca/house";
import {
  cashoutProofStatus,
  proofFromPaidCashout,
  signCashoutProof,
  verifyCashoutProof,
  type CashoutProof,
} from "@/lib/cashout-proof";
import { findRememberedProof } from "@/lib/cashout-proof-store";

export const metadata = { title: "Ricevuta di prelievo" };
export const dynamic = "force-dynamic";

export default async function RicevutaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/ricevuta");
  const { id } = await params;
  const query = await searchParams;
  const house = isHouseEmail(session.user.email) || session.user.role === "ADMIN";

  const row = await prisma.cashoutRequest.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  let proof: CashoutProof | null = null;
  if (row && (house || row.userId === session.user.id)) {
    proof = proofFromPaidCashout({
      ...row,
      userName: row.user?.name ?? session.user.name ?? "Casa",
      status: row.status,
    });
  }
  if (!proof) {
    const fromQuery = verifyCashoutProof(query.p);
    if (fromQuery && fromQuery.id === id && (house || fromQuery.userId === session.user.id)) {
      proof = fromQuery;
    }
  }
  if (!proof) {
    const fromCookie = await findRememberedProof(id, house ? undefined : session.user.id);
    if (fromCookie && fromCookie.id === id && (house || fromCookie.userId === session.user.id)) {
      proof = fromCookie;
    }
  }
  if (!proof) notFound();

  const destination =
    proof.payoutKind === "WALLET"
      ? `${walletNetworkLabel(proof.walletNetwork)} ${proof.walletAddress ?? ""}`
      : `${proof.ibanHolder ?? ""} · ${housePayoutLabel(proof.iban) ?? proof.iban ?? ""}`;
  const token = signCashoutProof(proof);
  const status = cashoutProofStatus(proof);
  const pending = status === "PENDING";

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">
        {pending ? "Prelievo aperto" : "Ricevuta ufficiale"}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl text-primary">
          {pending ? "Prelievo da chiudere" : "Accredito registrato"}
        </h1>
        {pending ? null : <PrintButton>Stampa ricevuta</PrintButton>}
      </div>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {pending
          ? "I crediti sono in deposito. Incolla qui il CRO UniCredit/Wise o l’hash di rete dopo l’invio: così il prelievo si chiude anche se questa pagina gira su un’altra istanza."
          : "I crediti sono usciti dal portafoglio. Questa ricevuta è il documento del libro mastro. L’hash sotto è SHA-256 del documento. Un hash Ethereum o Bitcoin lo produce solo il wallet quando l’invio è già confermato sulla rete: Zecca non lo inventa."}
      </p>

      <section className="metal-frame mt-8 space-y-4 rounded-md bg-card p-5 md:p-7">
        <CopyField label="Numero prelievo" value={proof.id} mono />
        <p className="font-ledger text-xl text-ember">
          {formatCredits(proof.credits)} → {formatCashoutValue(proof)}
        </p>
        <p className="text-sm">{destination}</p>
        <p className="text-xs text-muted-foreground">
          {proof.userName} · {formatRomeDate(new Date(proof.resolvedAt || proof.createdAt))}
        </p>
        {pending && house ? (
          <SettleCashoutForm
            cashoutId={proof.id}
            payoutKind={proof.payoutKind}
            proofToken={token}
            walletAddress={proof.walletAddress}
            walletNetwork={proof.walletNetwork}
            usdCents={proof.usdCents}
          />
        ) : null}
        {pending && !house ? (
          <p className="text-sm text-muted-foreground">
            Massimo chiude la richiesta dopo il bonifico o l’invio crypto.
          </p>
        ) : null}
        {!pending && proof.receiptHash ? (
          <CopyField label="Hash ricevuta Zecca (SHA-256)" value={proof.receiptHash} mono />
        ) : null}
        {!pending ? (
          <CashoutReceipt
            cashoutId={proof.id}
            receiptKind={proof.receiptKind}
            receiptRef={proof.receiptRef}
            receiptUrl={proof.receiptUrl}
            receiptHash={proof.receiptHash}
            walletNetwork={proof.walletNetwork}
            proofToken={token}
          />
        ) : null}
      </section>
    </PageShell>
  );
}
