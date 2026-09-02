import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { purchaseCredits } from "@/lib/zecca/credits";
import { prisma } from "@/lib/db";
import { isZeccaError } from "@/lib/errors";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const credits = Number(session.metadata?.credits ?? 0);
    if (!userId || !credits) {
      return NextResponse.json({ received: true });
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
      });
    } catch (error) {
      const message = isZeccaError(error) ? error.message : "Accredito fallito";
      return NextResponse.json({ error: message }, { status: 409 });
    }
  }

  return NextResponse.json({ received: true });
}
