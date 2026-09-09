import { handleGaslessJsonRpc } from "@/lib/zecca/gasless-chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const out = await handleGaslessJsonRpc(body);
    return Response.json(out, { headers: cors });
  } catch (error) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { message: error instanceof Error ? error.message : "RPC proxy error" },
      },
      { status: 500, headers: cors },
    );
  }
}
