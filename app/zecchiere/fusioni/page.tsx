import { PendingCashoutCard, TreasuryConvertForm } from "@/components/zecchiere/FusioniForms";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { EmptyState } from "@/components/ui/banners";
import { formatCredits, formatEurFromCents, formatFiatFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { treasuryBalance } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";

export const metadata = { title: "Fusioni" };

export default async function FusioniPage() {
  const [pending, closed, treasury, settings] = await Promise.all([
    prisma.cashoutRequest.findMany({
      where: { status: { in: ["PENDING", "QUEUED"] } },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    }),
    prisma.cashoutRequest.findMany({
      where: { status: { in: ["PAID", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: true },
    }),
    treasuryBalance(),
    getSettings(),
  ]);

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Fusioni</h1>
      <p className="mt-2 text-muted-foreground">
        I crediti di tesoreria diventano euro, dollari, franchi svizzeri e crypto. Alla conferma
        crypto i crediti si bruciano e il payout verso MetaMask, Trust Wallet o exchange viene
        accettato — mint EVM se il contratto Zecca è attivo, altrimenti coda di liquidazione con
        ricevuta Zecca. Il bonifico IBAN lo disponi tu da UniCredit o Wise, poi chiudi con il CRO.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Conversione in cassa e invio crypto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          I crediti ancora in tesoreria ({formatCredits(treasury)}) possono diventare euro, dollari
          o crypto. Per la crypto indica il wallet: alla conferma i crediti si bruciano e il
          prelievo viene accettato.
        </p>
        <TreasuryConvertForm
          treasury={treasury}
          eurCentsPerCredit={settings.eurCentsPerCredit}
          usdCentsPerCredit={settings.usdCentsPerCredit}
          chfCentsPerCredit={settings.chfCentsPerCredit}
        />
      </section>

      <h2 className="mt-10 font-display text-2xl text-primary">Coda clienti</h2>
      {pending.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Coda vuota" body="Nessuna fusione in attesa. Quando un cliente chiede, arriva qui." />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {pending.map((r) => (
            <PendingCashoutCard
              key={r.id}
              id={r.id}
              name={r.isTreasury ? `Wallet interno ${r.walletNetwork ?? "crypto"}` : (r.user?.name ?? "Cliente")}
              email={r.user?.email ?? ""}
              credits={r.credits}
              eurCents={r.eurCents}
              usdCents={r.usdCents}
              chfCents={r.chfCents}
              currency={r.currency}
              payoutKind={r.payoutKind}
              iban={r.iban}
              ibanHolder={r.ibanHolder}
              walletAddress={r.walletAddress}
              walletNetwork={r.walletNetwork}
              createdLabel={formatRomeDate(r.createdAt)}
              status={r.status}
              receiptKind={r.receiptKind}
              receiptRef={r.receiptRef}
              receiptHash={r.receiptHash}
              receiptUrl={r.receiptUrl}
            />
          ))}
        </ul>
      )}

      <h2 className="mt-10 font-display text-2xl text-primary">Chiuse</h2>
      <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
        {closed.map((r) => (
          <li key={r.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>
                {r.isTreasury ? `Wallet interno ${r.walletNetwork ?? ""}` : r.user?.name} · {formatCredits(r.credits)}
                {r.status === "PAID"
                  ? r.currency === "USD"
                    ? ` → ${formatFiatFromCents(r.usdCents, "USD")}`
                    : r.currency === "CHF"
                      ? ` → ${formatFiatFromCents(r.chfCents, "CHF")}`
                      : ` → ${formatEurFromCents(r.eurCents)}`
                  : ""}
              </span>
              <span className="uppercase tracking-wider text-primary">
                {r.status === "PAID" ? "Pagata" : "Rifiutata"}
              </span>
            </div>
            {r.status === "PAID" ? (
              <CashoutReceipt
                cashoutId={r.id}
                receiptKind={r.receiptKind}
                receiptRef={r.receiptRef}
                receiptUrl={r.receiptUrl}
                receiptHash={r.receiptHash}
                walletNetwork={r.walletNetwork}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
