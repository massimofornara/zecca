import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { CashoutForm } from "@/components/shop/CashoutForm";
import { EmptyState } from "@/components/ui/banners";
import { formatCashoutValue, formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { userWallet } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";
import { walletNetworkLabel } from "@/lib/wallet";
import { housePayoutLabel } from "@/lib/zecca/house-accounts";
import { isHouseEmail } from "@/lib/zecca/house";

export const metadata = { title: "Prelievo" };

export default async function FusionePage() {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/fusione");

  const house = isHouseEmail(session.user.email);
  const [wallet, settings, requests] = await Promise.all([
    userWallet(session.user.id),
    getSettings(),
    prisma.cashoutRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Prelievo</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Preleva i crediti</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {house
          ? "I crediti della casa escono verso UniCredit (IT22 B020 0822 8000 0010 3317 304) o Wise (BE06 9676 1482 0722). Scegli euro o dollari: l’IBAN è già quello."
          : "Tutti possono convertire i crediti del portafoglio in euro o dollari, verso un conto bancario (IBAN) o un wallet. Massimo fa il bonifico: l’app non è una banca e non spedisce denaro da sola."}
      </p>
      <div className="mt-8">
        <CashoutForm
          available={wallet.available}
          eurCentsPerCredit={settings.eurCentsPerCredit}
          usdCentsPerCredit={settings.usdCentsPerCredit}
          house={house}
        />
      </div>
      <section className="mt-12">
        <h2 className="font-display text-2xl text-primary">Le tue richieste</h2>
        {requests.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nessun prelievo"
              body="Quando hai crediti in portafoglio, puoi chiedere il bonifico o l’invio al wallet."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-ledger">
                    {formatCredits(r.credits)} → {formatCashoutValue(r)}
                    {r.payoutKind === "WALLET"
                      ? ` · ${walletNetworkLabel(r.walletNetwork)} ${r.walletAddress ?? ""}`
                      : r.iban
                        ? ` · ${housePayoutLabel(r.iban) ?? r.iban}`
                        : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatRomeDate(r.createdAt)}</p>
                </div>
                <Status status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

function Status({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "In attesa",
    PAID: "Pagata",
    REJECTED: "Rifiutata",
  };
  return <span className="uppercase tracking-wider text-primary">{map[status] ?? status}</span>;
}
