import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { getSettings, creditsToEurCents } from "@/lib/zecca/settings";
import { treasuryBalance } from "@/lib/zecca/ledger";

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

  const origin = new URL(request.url).origin;
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: session.user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: eurCents,
          product_data: {
            name: `${credits} crediti Zecca`,
            description: "Acquisto crediti dalla tesoreria della zecca",
          },
        },
      },
    ],
    metadata: {
      userId: session.user.id,
      credits: String(credits),
    },
    success_url: `${origin}/crediti?stripe=ok`,
    cancel_url: `${origin}/crediti?stripe=annullato`,
  });

  return NextResponse.json({ url: checkout.url });
}
