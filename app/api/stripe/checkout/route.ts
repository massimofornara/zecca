import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { publicOrigin } from "@/lib/public-url";
import { getSettings, creditsToEurCents } from "@/lib/zecca/settings";
import { treasuryBalance } from "@/lib/zecca/ledger";

const MAX_CREDITS = 10_000;

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
  if (credits > MAX_CREDITS) {
    return NextResponse.json(
      { error: `Al massimo ${MAX_CREDITS.toLocaleString("it-IT")} crediti per pagamento.` },
      { status: 400 },
    );
  }

  const treasury = await treasuryBalance();
  if (treasury < credits) {
    return NextResponse.json(
      {
        error:
          "La tesoreria è a corto di crediti. Il zecchiere deve coniare un nuovo lotto prima che tu possa acquistarli.",
      },
      { status: 409 },
    );
  }

  const settings = await getSettings();
  const eurCents = creditsToEurCents(credits, settings.eurCentsPerCredit);
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
