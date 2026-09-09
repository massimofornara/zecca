import { sepaBinaryEnabled, sepaBinaryOrigin, sepaBinaryToken } from "@/lib/settlement/sepa-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = sepaBinaryToken();
  return Response.json({
    binary: "zecca-sepa",
    ready: Boolean(token),
    enabled: sepaBinaryEnabled(),
    origin: sepaBinaryOrigin() || null,
    authenticatedRail: Boolean(token),
    path: "/api/rails/sepa/v1/payments",
    scheme: "SEPA_INSTANT",
    inventsTrn: false,
    detail: token
      ? "Binario SEPA autenticato HMAC (Bearer + X-Zecca-Signature). pain.001 firmato; nessun TRN UniCredit inventato."
      : "AUTH_SECRET assente: il binario non può autenticare.",
  });
}
