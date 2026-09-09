import { findGatewayCertificate, verifyGatewaySignature } from "@/lib/settlement/liquidation-gateway";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cert = await findGatewayCertificate(id);
  if (!cert) return Response.json({ error: "NOT_FOUND", tx_hash: null, trn: null }, { status: 404 });
  return Response.json({
    ...cert,
    signatureValid: verifyGatewaySignature(cert),
  });
}
