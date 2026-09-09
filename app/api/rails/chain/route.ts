import { gaslessStatus } from "@/lib/zecca/gasless-chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const status = await gaslessStatus();
  return Response.json({
    binary: "zecca-gasless",
    inventsHash: false,
    etherscanIo: false,
    ...status,
  });
}
