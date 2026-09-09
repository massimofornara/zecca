import { issueGatewayReceived } from "@/lib/settlement/liquidation-gateway";
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
      return Response.json({ error: auth.code, reason: auth.reason, tx_hash: null }, { status: 401 });
    }
  }

  let payload: {
    asset?: string;
    destination?: string;
    amountUsdCents?: number;
    idempotencyKey?: string;
    cashoutId?: string;
  };
  try {
    payload = JSON.parse(rawBody || "{}") as typeof payload;
  } catch {
    return Response.json({ error: "GATEWAY_BAD_JSON", tx_hash: null }, { status: 400 });
  }

  const asset = (payload.asset ?? "BTC").toUpperCase();
  if (asset !== "BTC") {
    return Response.json(
      {
        error: "GATEWAY_RAIL",
        reason: "Questo endpoint dispone solo BTC. ETH/USDT/USDC/BNB passano da Zecca Gasless.",
        tx_hash: null,
      },
      { status: 409 },
    );
  }

  const result = await issueGatewayReceived({
    rail: "BTC",
    asset: "BTC",
    destination: String(payload.destination ?? ""),
    amountCents: Number(payload.amountUsdCents ?? 0),
    cashoutId: payload.cashoutId ?? payload.idempotencyKey ?? null,
    idempotencyKey: payload.idempotencyKey ?? payload.cashoutId ?? `btc-${Date.now()}`,
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
    },
    { status: 202 },
  );
}
