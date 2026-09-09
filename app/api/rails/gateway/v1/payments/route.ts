import { issueGatewayReceived, type GatewayRail } from "@/lib/settlement/liquidation-gateway";
import { sepaBinaryToken, verifySepaAuth } from "@/lib/settlement/sepa-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const token = sepaBinaryToken();
  if (token) {
    const auth = verifySepaAuth({
      token,
      body: rawBody,
      authorization: request.headers.get("authorization"),
      signature: request.headers.get("x-zecca-signature"),
      timestamp: request.headers.get("x-zecca-timestamp"),
      nonce: request.headers.get("x-zecca-nonce"),
    });
    if (!auth.ok) {
      return Response.json({ error: auth.code, reason: auth.reason, trn: null }, { status: 401 });
    }
  }

  let payload: {
    currency?: string;
    iban?: string;
    holder?: string;
    amountCents?: number;
    idempotencyKey?: string;
    instructionId?: string;
    cashoutId?: string;
  };
  try {
    payload = JSON.parse(rawBody || "{}") as typeof payload;
  } catch {
    return Response.json({ error: "GATEWAY_BAD_JSON", trn: null }, { status: 400 });
  }

  const currency = (payload.currency ?? "EUR").toUpperCase();
  const rail: GatewayRail = currency === "USD" ? "USD" : currency === "CHF" ? "CHF" : "SEPA";

  const result = await issueGatewayReceived({
    rail,
    asset: rail === "SEPA" ? "EUR" : rail,
    destination: String(payload.iban ?? ""),
    holder: payload.holder ?? null,
    amountCents: Number(payload.amountCents ?? 0),
    cashoutId: payload.cashoutId ?? payload.idempotencyKey ?? null,
    idempotencyKey: payload.idempotencyKey ?? payload.cashoutId ?? `${rail}-${Date.now()}`,
    instructionId: payload.instructionId ?? null,
  });

  return Response.json(
    {
      status: "EXECUTED_AND_RECEIVED",
      authenticated: true,
      transmissionId: result.status === "EXECUTED" ? result.ref : null,
      receiptUrl: result.status === "EXECUTED" ? result.url : null,
      tx_hash: null,
      trn: null,
      cro: null,
      wiseId: null,
    },
    { status: 202 },
  );
}
