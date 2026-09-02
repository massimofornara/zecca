import Stripe from "stripe";

export function isStripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/** Pagamento demo (senza carta). Disattivato quando Stripe è configurato, salvo ZECCA_ALLOW_DEMO_PAY=1. */
export function isDemoPayEnabled() {
  if (process.env.ZECCA_DISABLE_DEMO_PAY === "1") return false;
  if (isStripeEnabled() && process.env.ZECCA_ALLOW_DEMO_PAY !== "1") return false;
  return true;
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}
