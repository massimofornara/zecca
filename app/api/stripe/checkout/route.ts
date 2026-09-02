import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { publicOrigin } from "@/lib/public-url";
import { getSettings, creditsToEurCents } from "@/lib/zecca/settings";
import { ensureTreasury } from "@/lib/zecca/mint";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json(
      { error: "Stripe non è configurato. Usa il pagamento dimostrativo." },
      { status: 400 },
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Devi entrare per pagare." }, { status: 401 });
  }

  const body = (await request.json()) as { credits?: number };
  const credits = Math.floor(Number(body.credits ?? 0));
  if (credits <= 0) {
    return NextResponse.json({ error: "Importo non valido." }, { status: 400 });
  }

  const minter =
    (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id ??
    session.user.id;
  await ensureTreasury({ needed: credits, actorId: minter });

  const settings = await getSettings();
  const eurCents = creditsToEurCents(credits, settings.eurCentsPerCredit);
  if (eurCents > 99_999_999) {
    return NextResponse.json(
      {
        error:
          "Stripe accetta al massimo 999.999,99 EUR per pagamento. Spezza l’acquisto, o usa il conio interno.",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe non disponibile." }, { status: 400 });
  }

  const origin = publicOrigin(request.url);
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: "it",
    customer_email: session.user.email ?? undefined,
    client_reference_id: session.user.id,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: eurCents,
          product_data: {
            name: `${credits} crediti Zecca`,
            description: "Acquisto crediti dalla tesoreria. Non sono moneta a corso legale.",
          },
        },
      },
    ],
    metadata: {
      userId: session.user.id,
      credits: String(credits),
      eurCents: String(eurCents),
    },
    payment_intent_data: {
      description: `Zecca: ${credits} crediti`,
      metadata: {
        userId: session.user.id,
        credits: String(credits),
      },
    },
    success_url: `${origin}/crediti?stripe=ok`,
    cancel_url: `${origin}/crediti?stripe=annullato`,
  });

  return NextResponse.json({ url: checkout.url });
}
