import { liquidationGatewayHealth } from "@/lib/settlement/liquidation-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = liquidationGatewayHealth();
  return Response.json({
    binary: "zecca-liquidation-gateway",
    ready: health.ready,
    rails: health.rails,
    inventsTxHash: false,
    inventsCro: false,
    inventsWiseId: false,
    pathDisburse: "/api/rails/gateway/v1/disburse",
    pathPayments: "/api/rails/gateway/v1/payments",
    detail: health.detail,
  });
}
