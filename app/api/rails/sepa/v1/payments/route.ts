import { handleSepaPayment } from "@/lib/settlement/sepa-binary";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = handleSepaPayment({
    rawBody,
    authorization: request.headers.get("authorization"),
    signature: request.headers.get("x-zecca-signature"),
    timestamp: request.headers.get("x-zecca-timestamp"),
    nonce: request.headers.get("x-zecca-nonce"),
  });
  return Response.json(result.body, { status: result.http });
}
