import { isDemoPayEnabled, isStripeEnabled } from "@/lib/stripe";
import { getShopBank, isShopBankReady } from "@/lib/zecca/bank";

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

export async function getLiveReport(): Promise<LiveReport> {
  const secret = process.env.AUTH_SECRET ?? "";
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const webhook = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const publicUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "";
  const stripeConfigured = isStripeEnabled();
  const stripeLive = stripeKey.startsWith("sk_live_");
  const demoPay = isDemoPayEnabled();
  const demoLogins = isDemoLoginAllowed();
  const bank = await getShopBank();
  const bankReady = isShopBankReady(bank);

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
      id: "shop-iban",
      ok: bankReady,
      title: "IBAN della zecca (bonifico SEPA)",
      detail: bankReady
        ? `I clienti versano su ${bank.iban.slice(0, 4)}…${bank.iban.slice(-4)}. Massimo conferma a mano: niente webhook.`
        : "Manca l’IBAN in Zecchiere → Versamenti. Senza quel conto non entrano euro veri.",
      needsYou: true,
    },
    {
      id: "stripe-key",
      ok: stripeKey.startsWith("sk_test_") || stripeKey.startsWith("sk_live_"),
      title: "Chiave Stripe (facoltativa)",
      detail: stripeKey
        ? stripeLive
          ? "Chiave live rilevata. Non serve se usi solo il bonifico."
          : "Chiave di test rilevata. Per i soldi veri usa il bonifico SEPA, non questa."
        : "Assente: va bene. I soldi veri passano dal bonifico, non da Stripe.",
      needsYou: false,
    },
    {
      id: "stripe-webhook",
      ok: true,
      title: "Webhook Stripe",
      detail: "Non serve. Il bonifico si conferma a mano quando vedi l’accredito in banca.",
      needsYou: false,
    },
    {
      id: "public-https",
      ok: publicUrl.startsWith("https://"),
      title: "URL pubblico HTTPS",
      detail: publicUrl.startsWith("https://")
        ? publicUrl
        : "Manca AUTH_URL https://… (dominio del sito in rete). Utile per le sessioni.",
      needsYou: true,
    },
    {
      id: "demo-off",
      ok: bankReady,
      title: "Euro in ingresso",
      detail: bankReady
        ? "Bonifico SEPA attivo: i crediti partono dopo la conferma del zecchiere."
        : "Senza IBAN resta la demo, che non muove euro.",
      needsYou: false,
    },
    {
      id: "demo-logins",
      ok: !demoLogins,
      title: "Conti dimostrativi spenti",
      detail: demoLogins
        ? "I conti @zecca.local sono ancora usabili."
        : "Accesso demo bloccato.",
      needsYou: false,
    },
    {
      id: "dhl",
      ok: Boolean(process.env.DHL_API_KEY && process.env.DHL_API_SECRET && process.env.DHL_ACCOUNT_NUMBER),
      title: "DHL Express 24h",
      detail:
        process.env.DHL_API_KEY && process.env.DHL_API_SECRET && process.env.DHL_ACCOUNT_NUMBER
          ? process.env.DHL_LIVE === "1"
            ? "Contratto DHL live: al checkout si prenota il ritiro dalla sede del fornitore."
            : "Chiavi DHL in ambiente test."
          : "Mancano DHL_API_KEY, DHL_API_SECRET, DHL_ACCOUNT_NUMBER. Senza di esse la lettera di vettura è locale. I fornitori restano i mittenti.",
      needsYou: true,
    },
    {
      id: "payouts",
      ok: false,
      title: "Bonifici in uscita",
      detail:
        "Non automatizzabili da Zecca. Il zecchiere paga i cash-out dal proprio home banking.",
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
    readyForLive: bankReady && secret.length >= 32,
    checks,
  };
}
