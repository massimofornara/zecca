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
  const queued = status === "QUEUED";

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">
        {queued ? "Prelievo accettato" : pending ? "Prelievo aperto" : "Ricevuta ufficiale"}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl text-primary">
          {queued
            ? "In coda di liquidazione"
            : pending
              ? "Prelievo da chiudere"
              : "Accredito registrato"}
        </h1>
        {pending ? null : <PrintButton>Stampa ricevuta</PrintButton>}
      </div>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {queued
          ? "Prelievo accettato. I crediti sono bruciati. Ricevuta Zecca emessa; la liquidazione on-chain procede in coda."
          : pending
            ? proof.payoutKind === "WALLET"
              ? "I crediti sono in deposito. Alla conferma il negozio accetta il payout verso il wallet indicato."
              : "I crediti sono in deposito. Incolla qui il CRO UniCredit/Wise dopo il bonifico."
            : "I crediti sono usciti dal portafoglio. Questa ricevuta è il documento del libro mastro."}
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
        {pending && house && proof.payoutKind !== "WALLET" ? (
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
            Massimo conferma: il negozio invia al wallet indicato. Tu ricevi, senza firmare.
          </p>
        ) : null}
        {queued || !pending ? (
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
