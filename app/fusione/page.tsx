import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { CashoutForm } from "@/components/shop/CashoutForm";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { HouseGrantForm } from "@/components/shop/HouseGrantForm";
import { SettleCashoutForm } from "@/components/shop/SettleCashoutForm";
import { EmptyState } from "@/components/ui/banners";
import { formatCashoutValue, formatCredits } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { userWallet } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";
import { walletNetworkLabel } from "@/lib/wallet";
import { houseDisplayName, housePayoutLabel } from "@/lib/zecca/house-accounts";
import { cashoutProofStatus, proofFromPaidCashout, signCashoutProof } from "@/lib/cashout-proof";
import { loadRememberedProofs } from "@/lib/cashout-proof-store";
import { ensureHouseAdmin, isHouseEmail } from "@/lib/zecca/house";

export const metadata = { title: "Prelievo" };
export const dynamic = "force-dynamic";

export default async function FusionePage() {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/fusione");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, role: true },
  });
  const email = dbUser?.email ?? session.user.email;
  if (isHouseEmail(email) || isHouseEmail(session.user.email)) {
    await ensureHouseAdmin({ userId: session.user.id, email: email || session.user.email });
  }
  const house =
    isHouseEmail(email) ||
    isHouseEmail(session.user.email) ||
    dbUser?.role === "ADMIN" ||
    session.user.role === "ADMIN";
  const who = houseDisplayName(email) ?? houseDisplayName(session.user.email) ?? dbUser?.name ?? session.user.name;
  const [wallet, settings, requests, remembered] = await Promise.all([
    userWallet(session.user.id),
    getSettings(),
    prisma.cashoutRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    loadRememberedProofs(house ? undefined : session.user.id),
  ]);
  const dbIds = new Set(requests.map((row) => row.id));
  const rememberedById = new Map(remembered.map((proof) => [proof.id, proof]));
  const listed = [
    ...remembered.filter((proof) => !dbIds.has(proof.id)),
    ...requests.map((row) => {
      const cookie = rememberedById.get(row.id);
      if (cookie && cashoutProofStatus(cookie) === "PAID") return cookie;
      return proofFromPaidCashout({
        ...row,
        userName: who ?? session.user.name ?? "Casa",
      });
    }),
  ];

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Prelievo</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Preleva i crediti</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {house
          ? `${who}, Zecca non invia euro, dollari né crypto. Il bonifico lo disponi tu da UniCredit o Wise; la crypto dal tuo wallet. Poi incolli CRO o hash.`
          : "Chiedi euro, dollari o crypto. Confermi la destinazione: i soldi partono solo da banca o wallet tuoi."}
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
        {listed.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nessun prelievo"
              body="Quando hai crediti in portafoglio, puoi chiedere il bonifico o l’invio al wallet."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {listed.map((r) => {
              const dbRow = requests.find((row) => row.id === r.id);
              const status =
                cashoutProofStatus(r) === "PAID" ? "PAID" : (dbRow?.status ?? cashoutProofStatus(r));
              return (
                <li key={r.id} className="rounded-md px-4 py-3 text-sm ring-1 ring-primary/20">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-ledger">
                        {formatCredits(r.credits)} → {formatCashoutValue(r)}
                        {r.payoutKind === "WALLET"
                          ? ` · ${walletNetworkLabel(r.walletNetwork)} ${r.walletAddress ?? ""}`
                          : r.iban
                            ? ` · ${housePayoutLabel(r.iban) ?? r.iban}`
                            : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatRomeDate(new Date(r.createdAt))}</p>
                    </div>
                    <Status status={status} />
                  </div>
                  {status === "PAID" ? (
                    <CashoutReceipt
                      cashoutId={r.id}
                      receiptKind={r.receiptKind}
                      receiptRef={r.receiptRef}
                      receiptUrl={r.receiptUrl}
                      receiptHash={r.receiptHash}
                      walletNetwork={r.walletNetwork}
                      proofToken={signCashoutProof(r)}
                    />
                  ) : null}
                  {house && status === "PENDING" ? (
                    <SettleCashoutForm
                      cashoutId={r.id}
                      payoutKind={r.payoutKind}
                      proofToken={signCashoutProof(r)}
                    />
                  ) : null}
                </li>
              );
            })}
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
