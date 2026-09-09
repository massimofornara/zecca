import { PendingCashoutCard, TreasuryConvertForm } from "@/components/zecchiere/FusioniForms";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { EmptyState } from "@/components/ui/banners";
import { formatCredits, formatEurFromCents, formatFiatFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { treasuryBalance } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";
import { shopPayoutAddress } from "@/lib/zecca/shop-payout";
import { getShopNetworkVault } from "@/lib/zecca/shop-vault";

export const metadata = { title: "Fusioni" };

export default async function FusioniPage() {
  const [pending, closed, treasury, settings, vault] = await Promise.all([
    prisma.cashoutRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    }),
    prisma.cashoutRequest.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: true },
    }),
    treasuryBalance(),
    getSettings(),
    getShopNetworkVault(),
  ]);

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Fusioni</h1>
      <p className="mt-2 text-muted-foreground">
        I crediti di tesoreria diventano euro, dollari, franchi svizzeri e crypto. La parte crypto
        è un burn sul libro (cassa virtuale). L’unica transazione on-chain è l’uscita verso il
        wallet che indichi, se il wallet operativo ha già quelle monete. Il negozio crea l’hash su
        Mempool, Etherscan o BscScan: chi riceve non firma. Il bonifico IBAN lo disponi tu da
        UniCredit o Wise (anche in CHF), poi chiudi con il CRO.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Conversione in cassa e invio crypto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          I crediti ancora in tesoreria ({formatCredits(treasury)}) possono diventare euro, dollari
          o crypto. Per la crypto indica il wallet nel form: il libro registra il burn, l’hash nasce
          solo all’uscita dalla liquidità on-chain.
        </p>
        <TreasuryConvertForm
          treasury={treasury}
          eurCentsPerCredit={settings.eurCentsPerCredit}
          usdCentsPerCredit={settings.usdCentsPerCredit}
          chfCentsPerCredit={settings.chfCentsPerCredit}
          vault={vault.assets}
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
              shopAddress={shopPayoutAddress(r.walletNetwork)}
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
