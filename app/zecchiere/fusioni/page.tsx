import { PendingCashoutCard, TreasuryConvertForm } from "@/components/zecchiere/FusioniForms";
import { CircleCassaCard } from "@/components/zecchiere/CircleCassaCard";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { EmptyState } from "@/components/ui/banners";
import { formatCredits, formatEurFromCents, formatFiatFromCents } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { treasuryBalance } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";
import { getUsdcCassaSnapshot } from "@/lib/zecca/usdc-cassa";
import { reopenFakeUsdcCashouts } from "@/lib/zecca/cashout";
import { replayBookOps } from "@/lib/book-proof-store";

export const metadata = { title: "Fusioni" };

export default async function FusioniPage() {
  await replayBookOps(prisma);
  await reopenFakeUsdcCashouts();
  const [pending, closed, treasury, settings, usdcCassa] = await Promise.all([
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
    getUsdcCassaSnapshot(),
  ]);

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Fusioni</h1>
      <p className="mt-2 text-muted-foreground">
        Il conio crea solo crediti di libro, non euro in banca né USDC. I prelievi USDC partono
        dal wallet Circle SCA se c’è USDC vero. IBAN: disponi tu il SEPA, poi «Segna bonifico
        disposto» (non è un CRO). Stripe non versa sull’IBAN del cliente. USDC su Base: qualsiasi
        0x (MetaMask, Trust, deposito Kraken/MEXC su Base). Il gas è sponsorizzato dal negozio
        tramite Circle Gas Station (addebitato sul conto Circle). La commissione di prelievo resta
        nel SCA. «Invia USDC» ritenta. Senza env: «Wallet negozio non configurato». Altre crypto e
        liquidazione restano in{" "}
        <a href="/zecchiere/liquidazione" className="text-ember underline-offset-2 hover:underline">
          Liquidazione
        </a>
        . Un codice ZECCA/… non è un bonifico.
      </p>

      <CircleCassaCard cassa={usdcCassa} />

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <h2 className="font-display text-2xl text-primary">Conversione in cassa e invio crypto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          I crediti ancora in tesoreria ({formatCredits(treasury)}) diventano euro, dollari, franchi
          o cassa USDC di libro. Lo spread % (Forgia) resta in tesoreria. Convertire USDC non sposta
          token on-chain: deposita USDC vero sul SCA, poi preleva.
        </p>
        <TreasuryConvertForm
          treasury={treasury}
          eurCentsPerCredit={settings.eurCentsPerCredit}
          usdCentsPerCredit={settings.usdCentsPerCredit}
          chfCentsPerCredit={settings.chfCentsPerCredit}
          spreadBpsEur={settings.spreadBpsEur}
          spreadBpsUsd={settings.spreadBpsUsd}
          spreadBpsChf={settings.spreadBpsChf}
          spreadBpsUsdc={settings.spreadBpsUsdc}
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
              usdcFeeCents={r.usdcFeeCents}
              usdcNetCents={r.usdcNetCents}
              usdcWithdrawFeeFlatCents={settings.usdcWithdrawFeeFlatCents}
              usdcWithdrawFeeBps={settings.usdcWithdrawFeeBps}
              currency={r.currency}
              payoutKind={r.payoutKind}
              iban={r.iban}
              ibanHolder={r.ibanHolder}
              ibanBic={r.ibanBic}
              walletAddress={r.walletAddress}
              walletNetwork={r.walletNetwork}
              walletChain={r.walletChain}
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
