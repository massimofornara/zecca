import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/SiteChrome";
import { BuyCreditsForm } from "@/components/shop/BuyCreditsForm";
import { OkBanner, ErrorBanner } from "@/components/ui/banners";
import { getSettings } from "@/lib/zecca/settings";
import { treasuryBalance } from "@/lib/zecca/ledger";
import { isDemoPayEnabled, isStripeEnabled } from "@/lib/stripe";

export const metadata = { title: "Compra crediti" };

export default async function CreditiPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/accedi?callbackUrl=/crediti");
  const { stripe } = await searchParams;
  const [settings, treasury] = await Promise.all([getSettings(), treasuryBalance()]);

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Dalla tesoreria</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Compra crediti</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        I crediti esistono già: il zecchiere li ha coniati. Con Stripe versi euro veri sul conto del
        zecchiere; i crediti restano un registro. Senza chiavi Stripe il pagamento è solo dimostrativo.
      </p>
      <div className="mt-6 space-y-3">
        {stripe === "ok" && (
          <OkBanner message="Pagamento Stripe ricevuto. Se i crediti non compaiono entro un attimo, aggiorna il portafoglio." />
        )}
        {stripe === "annullato" && <ErrorBanner message="Pagamento Stripe annullato." />}
      </div>
      <div className="mt-8">
        <BuyCreditsForm
          eurCentsPerCredit={settings.eurCentsPerCredit}
          stripeEnabled={isStripeEnabled()}
          demoEnabled={isDemoPayEnabled()}
          treasury={treasury}
        />
      </div>
    </PageShell>
  );
}
