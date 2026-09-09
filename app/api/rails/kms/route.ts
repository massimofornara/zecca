import { kmsPublicStatus } from "@/lib/zecca/kms-signer";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    binary: "zecca-kms",
    ...kmsPublicStatus(),
    inventsKey: false,
  });
}
