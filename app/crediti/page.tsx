import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { BuyCreditsForm } from "@/components/shop/BuyCreditsForm";
import { CopyField } from "@/components/copy/CopyField";
import { OkBanner, ErrorBanner } from "@/components/ui/banners";
import { HouseGrantForm } from "@/components/shop/HouseGrantForm";
import { getSettings } from "@/lib/zecca/settings";
import { treasuryBalance } from "@/lib/zecca/ledger";
import { isDemoPayEnabled, isStripeEnabled } from "@/lib/stripe";
import { bonificoInstruction, getShopBank, isShopBankReady } from "@/lib/zecca/bank";
import { isHouseEmail } from "@/lib/zecca/house";
import { prisma } from "@/lib/db";

export const metadata = { title: "Compra crediti" };

export default async function CreditiPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; versamento?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/crediti");
  const { stripe, versamento } = await searchParams;
  const house = isHouseEmail(session.user.email);
  const [settings, treasury, bank] = await Promise.all([
    getSettings(),
    treasuryBalance(),
    getShopBank(),
  ]);
  const bankReady = isShopBankReady(bank);
  const demoEnabled = isDemoPayEnabled() && (process.env.ZECCA_ALLOW_DEMO_PAY === "1" || !bankReady);

  const pending = versamento
    ? await prisma.creditPurchase.findFirst({
        where: { id: versamento, userId: session.user.id, method: "bonifico" },
      })
    : await prisma.creditPurchase.findFirst({
        where: { userId: session.user.id, method: "bonifico", status: "pending" },
        orderBy: { createdAt: "desc" },
      });
  const instruction =
    pending && pending.reference
      ? bonificoInstruction({
          bank,
          credits: pending.credits,
          eurCents: pending.eurCents,
          reference: pending.reference,
        })
      : null;

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Dalla tesoreria</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Compra crediti</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {house
          ? "Con questa email i crediti li generi tu, senza versare. Qui sotto resta anche il percorso a pagamento per gli altri conti."
          : "Versi euro veri con un bonifico SEPA sul conto della zecca. Massimo vede l’accredito in banca e ti dà i crediti. Nessuna carta, nessun webhook, nessun Stripe."}
      </p>
      {house ? (
        <div className="mt-8">
          <HouseGrantForm
            eurCentsPerCredit={settings.eurCentsPerCredit}
            usdCentsPerCredit={settings.usdCentsPerCredit}
          />
        </div>
      ) : null}
      <div className="mt-6 space-y-3">
        {stripe === "ok" && (
          <OkBanner message="Pagamento Stripe ricevuto. Se i crediti non compaiono entro un attimo, aggiorna il portafoglio." />
        )}
        {stripe === "annullato" && <ErrorBanner message="Pagamento Stripe annullato." />}
      </div>
      {instruction && pending?.status === "pending" ? (
        <section className="metal-frame mt-8 max-w-xl space-y-3 rounded-md bg-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Bonifico da disporre</p>
          <p className="font-display text-2xl text-primary">{instruction.amount}</p>
          <p className="text-sm text-muted-foreground">
            Dalla tua banca, verso il conto sotto. Usa esattamente questa causale. I crediti arrivano
            dopo che Massimo conferma l’incasso.
          </p>
          <CopyField label="IBAN" value={instruction.ibanRaw} mono />
          <CopyField label="Intestatario" value={instruction.holder} />
          {instruction.bankName ? <CopyField label="Banca" value={instruction.bankName} /> : null}
          <CopyField label="Causale" value={instruction.reference} mono />
          <CopyField label="Importo" value={instruction.amount} />
        </section>
      ) : null}
      <div className="mt-8">
        <BuyCreditsForm
          eurCentsPerCredit={settings.eurCentsPerCredit}
          stripeEnabled={isStripeEnabled()}
          demoEnabled={demoEnabled}
          bankReady={bankReady}
          treasury={treasury}
        />
      </div>
    </PageShell>
  );
}
