import { isDemoPayEnabled, isStripeEnabled } from "@/lib/stripe";

export type LiveCheck = {
  id: string;
  ok: boolean;
  title: string;
  detail: string;
  needsYou: boolean;
};

export type LiveReport = {
  stripeConfigured: boolean;
  stripeLive: boolean;
  demoPay: boolean;
  demoLogins: boolean;
  readyForCardPayments: boolean;
  readyForLive: boolean;
  checks: LiveCheck[];
};

const DEMO_EMAIL_SUFFIX = "@zecca.local";

export function isDemoAccount(email: string) {
  return email.toLowerCase().trim().endsWith(DEMO_EMAIL_SUFFIX);
}

/** Conti seed (Massimo/Chiara/Luca). Spenti in automatico con chiave Stripe live. */
export function isDemoLoginAllowed() {
  if (process.env.ZECCA_DISABLE_DEMO_LOGINS === "1") return false;
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_live_")) return false;
  return true;
}

export function getLiveReport(): LiveReport {
  const secret = process.env.AUTH_SECRET ?? "";
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const webhook = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const publicUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "";
  const stripeConfigured = isStripeEnabled();
  const stripeLive = stripeKey.startsWith("sk_live_");
  const demoPay = isDemoPayEnabled();
  const demoLogins = isDemoLoginAllowed();

  const checks: LiveCheck[] = [
    {
      id: "auth-secret",
      ok: secret.length >= 32 && !secret.includes("demo"),
      title: "AUTH_SECRET di produzione",
      detail: secret.includes("demo")
        ? "Ora c’è il segreto demo. In live sostituiscilo con una stringa casuale lunga (vedi npm run check:live)."
        : secret.length >= 32
          ? "Segreto di sessione presente."
          : "Manca AUTH_SECRET (almeno 32 caratteri).",
      needsYou: true,
    },
    {
      id: "stripe-key",
      ok: stripeKey.startsWith("sk_test_") || stripeKey.startsWith("sk_live_"),
      title: "Chiave Stripe",
      detail: stripeKey
        ? stripeLive
          ? "Chiave live rilevata."
          : "Chiave di test rilevata (pagamenti finti di Stripe, non accredito sul conto vero)."
        : "Manca STRIPE_SECRET_KEY. La crei tu su stripe.com (non si può inventare da qui).",
      needsYou: true,
    },
    {
      id: "stripe-webhook",
      ok: webhook.startsWith("whsec_"),
      title: "Webhook Stripe",
      detail: webhook.startsWith("whsec_")
        ? "Segreto webhook presente."
        : "Manca STRIPE_WEBHOOK_SECRET. Endpoint: /api/stripe/webhook (evento checkout.session.completed).",
      needsYou: true,
    },
    {
      id: "public-https",
      ok: publicUrl.startsWith("https://"),
      title: "URL pubblico HTTPS",
      detail: publicUrl.startsWith("https://")
        ? publicUrl
        : "Manca AUTH_URL https://… (dominio del sito in rete). Serve a Stripe e alle sessioni.",
      needsYou: true,
    },
    {
      id: "demo-off",
      ok: !demoPay,
      title: "Pagamento demo spento",
      detail: demoPay
        ? "Il pulsante demo è acceso: i crediti si accreditano senza carta. In live lascialo spento."
        : "Niente accredito magico: solo Stripe.",
      needsYou: false,
    },
    {
      id: "demo-logins",
      ok: !demoLogins,
      title: "Conti dimostrativi spenti",
      detail: demoLogins
        ? "I conti @zecca.local sono ancora usabili. Con chiave sk_live_ si spengono da soli."
        : "Accesso demo bloccato.",
      needsYou: false,
    },
    {
      id: "payouts",
      ok: false,
      title: "Bonifici in uscita",
      detail:
        "Non automatizzabili da Zecca. Il zecchiere paga i cash-out dal proprio home banking. Serve un conto intestato a te (o alla ditta), non un IBAN digitato in chat.",
      needsYou: true,
    },
    {
      id: "legal",
      ok: false,
      title: "Inquadramento",
      detail:
        "Vendere crediti e merce in Italia può richiedere Partita IVA, privacy, termini. Lo decide il commercialista, non questo programma.",
      needsYou: true,
    },
  ];

  return {
    stripeConfigured,
    stripeLive,
    demoPay,
    demoLogins,
    readyForCardPayments: stripeConfigured,
    readyForLive:
      stripeLive &&
      webhook.startsWith("whsec_") &&
      secret.length >= 32 &&
      !secret.includes("demo") &&
      publicUrl.startsWith("https://") &&
      !demoPay,
    checks,
  };
}
