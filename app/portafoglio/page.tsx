import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { ForgeMeter } from "@/components/forge/ForgeMeter";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/banners";
import { HouseGrantForm } from "@/components/shop/HouseGrantForm";
import { formatCredits, formatEurFromCents, formatFiatFromCents, LEDGER_LABELS } from "@/lib/format";
import { formatRomeDate } from "@/lib/rome-day";
import { prisma } from "@/lib/db";
import { getForgeState } from "@/lib/zecca/forge";
import { getSettings } from "@/lib/zecca/settings";
import { isHouseEmail } from "@/lib/zecca/house";
import { cn } from "@/lib/utils";

export const metadata = { title: "Portafoglio" };

export default async function PortafoglioPage() {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/portafoglio");

  const forge = await getForgeState({ userId: session.user.id, role: session.user.role });
  const house = isHouseEmail(session.user.email) || session.user.role === "ADMIN";
  const [movements, settings] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        OR: [{ fromUserId: session.user.id }, { toUserId: session.user.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    house ? getSettings() : Promise.resolve(null),
  ]);

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Il tuo metallo</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Portafoglio</h1>
      <p className="mt-2 text-muted-foreground">
        Ciao {session.user.name}. I crediti stanno nel libro mastro, non nel browser.
      </p>

      <div className="mt-8">
        <ForgeMeter forge={forge} />
      </div>

      {house && settings ? (
        <div className="mt-8">
          <HouseGrantForm
            eurCentsPerCredit={settings.eurCentsPerCredit}
            usdCentsPerCredit={settings.usdCentsPerCredit}
          />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {house ? null : (
          <Link href="/crediti" className={cn(buttonVariants({ size: "lg" }), "px-5")}>
            Compra crediti
          </Link>
        )}
        <Link href="/fusione" className={cn(buttonVariants({ size: "lg", variant: house ? "default" : "outline" }), "px-5")}>
          Preleva euro o dollari
        </Link>
        <Link href="/vetrina" className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "px-5")}>
          Vai in bottega
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-primary">Ultimi movimenti</h2>
        {movements.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Ancora silenzio"
              body="Quando comprerai crediti o spenderai in bottega, il libro parlerà."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
            {movements.map((m) => {
              const incoming = m.toPocket === "USER" && m.toUserId === session.user.id;
              const amount = incoming ? m.amountCredits : -m.amountCredits;
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p>{LEDGER_LABELS[m.type] ?? m.type}</p>
                    <p className="text-xs text-muted-foreground">{formatRomeDate(m.createdAt)}</p>
                  </div>
                  <p className={`font-ledger ${incoming ? "text-ember" : "text-muted-foreground"}`}>
                    {incoming ? "+" : "−"}
                    {formatCredits(Math.abs(amount))}
                    {m.type === "HOUSE_GRANT"
                      ? ` · ${formatEurFromCents(m.eurCents)} / ${formatFiatFromCents(m.usdCents, "USD")}`
                      : m.usdCents > 0 && m.fiatCurrency === "USD"
                        ? ` · ${formatFiatFromCents(m.usdCents, "USD")}`
                        : m.eurCents > 0
                          ? ` · ${formatEurFromCents(m.eurCents)}`
                          : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
