import { handleGaslessJsonRpc, gaslessRpcRequest } from "@/lib/zecca/gasless-chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

/**
 * API query-string compatibile con il modulo proxy di Etherscan,
 * sulla chain 22120. Non è etherscan.io / Ethereum mainnet.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const moduleName = (url.searchParams.get("module") ?? "proxy").toLowerCase();
  const action = url.searchParams.get("action") ?? "";
  if (moduleName !== "proxy") {
    return Response.json(
      { status: "0", message: "NOTOK", result: "Solo module=proxy sulla catena Zecca 22120." },
      { headers: cors },
    );
  }
  const methodMap: Record<string, { method: string; params: unknown[] }> = {
    eth_chainId: { method: "eth_chainId", params: [] },
    eth_gasPrice: { method: "eth_gasPrice", params: [] },
    eth_blockNumber: { method: "eth_blockNumber", params: [] },
    eth_getTransactionByHash: {
      method: "eth_getTransactionByHash",
      params: [url.searchParams.get("txhash") ?? url.searchParams.get("txHash") ?? ""],
    },
    eth_getTransactionReceipt: {
      method: "eth_getTransactionReceipt",
      params: [url.searchParams.get("txhash") ?? url.searchParams.get("txHash") ?? ""],
    },
    eth_getCode: {
      method: "eth_getCode",
      params: [url.searchParams.get("address") ?? "", url.searchParams.get("tag") ?? "latest"],
    },
  };
  const mapped = methodMap[action];
  if (!mapped) {
    return Response.json(
      { status: "0", message: "NOTOK", result: `action ${action} non supportata` },
      { headers: cors },
    );
  }
  try {
    const result = await gaslessRpcRequest(mapped.method, mapped.params);
    return Response.json({ jsonrpc: "2.0", id: 1, result, etherscanIo: false, chainId: 22120 }, { headers: cors });
  } catch (error) {
    return Response.json(
      { status: "0", message: "NOTOK", result: error instanceof Error ? error.message : "RPC error" },
      { status: 500, headers: cors },
    );
  }
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
