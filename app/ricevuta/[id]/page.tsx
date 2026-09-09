import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { PrintButton } from "@/components/shop/PrintButton";
import { CopyField } from "@/components/copy/CopyField";
import { formatCashoutValue, formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { walletNetworkLabel } from "@/lib/wallet";
import { housePayoutLabel } from "@/lib/zecca/house-accounts";
import { isHouseEmail } from "@/lib/zecca/house";

export const metadata = { title: "Ricevuta di prelievo" };
export const dynamic = "force-dynamic";

export default async function RicevutaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/ricevuta");
  const { id } = await params;
  const cashout = await prisma.cashoutRequest.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!cashout || cashout.status !== "PAID") notFound();

  const house = isHouseEmail(session.user.email) || session.user.role === "ADMIN";
  if (!house && cashout.userId !== session.user.id) notFound();

  const destination =
    cashout.payoutKind === "WALLET"
      ? `${walletNetworkLabel(cashout.walletNetwork)} ${cashout.walletAddress ?? ""}`
      : `${cashout.ibanHolder ?? ""} · ${housePayoutLabel(cashout.iban) ?? cashout.iban ?? ""}`;

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Ricevuta ufficiale</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl text-primary">Accredito registrato</h1>
        <PrintButton>Stampa ricevuta</PrintButton>
      </div>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        I crediti sono usciti dal portafoglio. Questa ricevuta è il documento del libro mastro.
        L’hash sotto è SHA-256 del documento. Un hash Ethereum o Bitcoin lo produce solo il wallet
        quando l’invio è già confermato sulla rete: Zecca non lo inventa.
      </p>

      <section className="metal-frame mt-8 space-y-4 rounded-md bg-card p-5 md:p-7">
        <CopyField label="Numero prelievo" value={cashout.id} mono />
        <p className="font-ledger text-xl text-ember">
          {formatCredits(cashout.credits)} → {formatCashoutValue(cashout)}
        </p>
        <p className="text-sm">{destination}</p>
        <p className="text-xs text-muted-foreground">
          {cashout.user?.name} · {formatRomeDate(cashout.resolvedAt ?? cashout.createdAt)}
        </p>
        {cashout.receiptHash ? (
          <CopyField label="Hash ricevuta Zecca (SHA-256)" value={cashout.receiptHash} mono />
        ) : null}
        <CashoutReceipt
          cashoutId={cashout.id}
          receiptKind={cashout.receiptKind}
          receiptRef={cashout.receiptRef}
          receiptUrl={cashout.receiptUrl}
          receiptHash={cashout.receiptHash}
          walletNetwork={cashout.walletNetwork}
        />
      </section>
    </PageShell>
  );
}
