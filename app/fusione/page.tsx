import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { CashoutForm } from "@/components/shop/CashoutForm";
import { HouseGrantForm } from "@/components/shop/HouseGrantForm";
import { EmptyState } from "@/components/ui/banners";
import { formatCashoutValue, formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { userWallet } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";
import { walletNetworkLabel } from "@/lib/wallet";
import { houseDisplayName, housePayoutLabel } from "@/lib/zecca/house-accounts";
import { isHouseEmail } from "@/lib/zecca/house";

export const metadata = { title: "Prelievo" };

export default async function FusionePage() {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/fusione");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, role: true },
  });
  const email = dbUser?.email ?? session.user.email;
  const house = isHouseEmail(email) || dbUser?.role === "ADMIN" || session.user.role === "ADMIN";
  const who = houseDisplayName(email) ?? dbUser?.name ?? session.user.name;
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
          ? `${who}, indica quanti crediti prelevare. Bonifico su UniCredit o Wise, oppure crypto (BTC, ETH, USDT, USDC) verso il wallet che scrivi: la finestra mostra il valore da inviare.`
          : "Tutti possono convertire i crediti del portafoglio in euro, dollari o crypto, verso un conto bancario o un wallet. Massimo fa il bonifico o l’invio: l’app non è una banca e non spedisce da sola."}
      </p>
      {house ? (
        <div className="mt-8">
          <HouseGrantForm
            eurCentsPerCredit={settings.eurCentsPerCredit}
            usdCentsPerCredit={settings.usdCentsPerCredit}
          />
        </div>
      ) : null}
      <div className="mt-8">
        <CashoutForm
          available={wallet.available}
          eurCentsPerCredit={settings.eurCentsPerCredit}
          usdCentsPerCredit={settings.usdCentsPerCredit}
          house={house}
          houseName={who}
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
