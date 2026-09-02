import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { purchaseCredits } from "@/lib/zecca/credits";
import { prisma } from "@/lib/db";
import { isZeccaError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook non configurato." }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Firma assente." }, { status: 400 });
  }

  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "Firma non valida." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }
  if (session.currency && session.currency !== "eur") {
    return NextResponse.json({ error: "Valuta non EUR." }, { status: 400 });
  }

  const userId = session.metadata?.userId;
  const credits = Number(session.metadata?.credits ?? 0);
  const expectedCents = Number(session.metadata?.eurCents ?? 0);
  if (!userId || !credits || !expectedCents) {
    return NextResponse.json({ received: true });
  }
  if (session.amount_total !== expectedCents) {
    return NextResponse.json({ error: "Importo Stripe non coincide con il lotto." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Utente sconosciuto." }, { status: 400 });
  }

  const existing = await prisma.creditPurchase.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing) return NextResponse.json({ received: true });

  try {
    await purchaseCredits({
      userId,
      credits,
      method: "stripe",
      stripeSessionId: session.id,
      eurCents: expectedCents,
    });
  } catch (error) {
    const message = isZeccaError(error) ? error.message : "Accredito fallito";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ received: true });
}
