import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { publicOrigin } from "@/lib/public-url";
import { kmsSealedPrivateKey, kmsSignerAddress, withKmsAccount } from "@/lib/zecca/kms-signer";
import { proprietaryMintAmount } from "@/lib/zecca/token-mint";
import { zeccaTokenArtifact } from "@/lib/zecca/zecca-token-artifact";

export const ZECCA_GASLESS_CHAIN_ID = 22120;
export const ZECCA_GASLESS_PORT = Number(process.env.ZECCA_GASLESS_PORT ?? 27491);

export const zeccaGaslessChain = defineChain({
  id: ZECCA_GASLESS_CHAIN_ID,
  name: "Zecca Gasless",
  nativeCurrency: { name: "Zecca gas", symbol: "zGAS", decimals: 18 },
  rpcUrls: {
    default: { http: [`http://127.0.0.1:${ZECCA_GASLESS_PORT}`] },
  },
});

const MINT_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function MINTER_ROLE() view returns (bytes32)",
]);

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

let provider: Eip1193 | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;
let tokenAddress: Address | null = null;
let starting: Promise<void> | null = null;

function rpcHttp() {
  return process.env.ZECCA_GASLESS_RPC_URL?.trim() || `http://127.0.0.1:${ZECCA_GASLESS_PORT}`;
}

export function gaslessEnabled() {
  return process.env.ZECCA_GASLESS !== "0";
}

export function canHostGasless() {
  if (!gaslessEnabled()) return false;
  if (process.env.ZECCA_GASLESS_RPC_URL?.trim()) return true;
  if (process.env.VERCEL) return false;
  return true;
}

export function gaslessExplorerTx(hash: string) {
  const origin = publicOrigin() || `http://127.0.0.1:${process.env.PORT ?? "4731"}`;
  const id = hash.replace(/\/+$/, "");
  return `${origin}/catena/tx/${id}`;
}

export function gaslessRpcProxyUrl() {
  const origin = publicOrigin() || `http://127.0.0.1:${process.env.PORT ?? "4731"}`;
  return `${origin}/api/rails/chain/rpc`;
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function dispatchRpc(item: { id?: unknown; method?: string; params?: unknown[] }) {
  if (!item.method) {
    return { jsonrpc: "2.0", id: item.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  try {
    const result = await gaslessRpcRequest(item.method, item.params ?? []);
    return { jsonrpc: "2.0", id: item.id ?? 1, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "RPC error";
    return { jsonrpc: "2.0", id: item.id ?? 1, error: { code: -32000, message } };
  }
}

export async function handleGaslessJsonRpc(body: unknown) {
  await ensureGaslessChain();
  if (Array.isArray(body)) {
    return Promise.all(body.map((item) => dispatchRpc((item ?? {}) as { id?: unknown; method?: string; params?: unknown[] })));
  }
  return dispatchRpc((body ?? {}) as { id?: unknown; method?: string; params?: unknown[] });
}

function cors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

async function attachHttp(local: Eip1193) {
  provider = local;
  if (httpServer) return;
  httpServer = createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      const raw = await readBody(req);
      const json = JSON.parse(raw || "{}") as unknown;
      const out = await handleGaslessJsonRpc(json);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(out));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { message: error instanceof Error ? error.message : "RPC HTTP error" },
        }),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    httpServer?.once("error", reject);
    httpServer?.listen(ZECCA_GASLESS_PORT, "127.0.0.1", () => resolve());
  });
}

async function remoteProvider(): Promise<Eip1193> {
  return {
    request: async ({ method, params }) => {
      const res = await fetch(rpcHttp(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
        signal: AbortSignal.timeout(12_000),
      });
      const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (json.error?.message) throw new Error(json.error.message);
      return json.result;
    },
  };
}

async function listenGanache() {
  if (provider) return;
  const remote = process.env.ZECCA_GASLESS_RPC_URL?.trim();
  if (remote) {
    provider = await remoteProvider();
    return;
  }
  if (process.env.VERCEL) {
    throw new Error("Vercel serverless non ospita la catena gasless. Serve ZECCA_GASLESS_RPC_URL.");
  }

  const ganache = (await import("ganache")).default as {
    provider: (opts: Record<string, unknown>) => Eip1193;
  };
  const key = kmsSealedPrivateKey();
  const local = ganache.provider({
    chain: {
      chainId: ZECCA_GASLESS_CHAIN_ID,
      networkId: ZECCA_GASLESS_CHAIN_ID,
      hardfork: "berlin",
      vmErrorsOnRPCResponse: true,
    },
    miner: {
      defaultGasPrice: 0,
      instamine: "eager",
      blockTime: 0,
    },
    wallet: key
      ? {
          accounts: [{ secretKey: key, balance: 0 }],
          defaultBalance: 0,
        }
      : {
          totalAccounts: 1,
          defaultBalance: 0,
        },
    logging: { quiet: true },
  });

  try {
    await attachHttp(local);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    httpServer?.close();
    httpServer = null;
    if (!/EADDRINUSE/.test(msg)) throw error;
    provider = await remoteProvider();
  }
}

export async function ensureGaslessChain() {
  if (!gaslessEnabled()) return;
  if (!canHostGasless() && !process.env.ZECCA_GASLESS_RPC_URL?.trim()) return;
  if (!starting) {
    starting = listenGanache().catch((error) => {
      starting = null;
      provider = null;
      throw error;
    });
  }
  await starting;
}

export async function gaslessRpcRequest(method: string, params: unknown[] = []) {
  await ensureGaslessChain();
  if (!provider) throw new Error("Catena gasless non in ascolto.");
  return provider.request({ method, params });
}

async function clients() {
  await ensureGaslessChain();
  const transport = http(rpcHttp(), { timeout: 12_000 });
  const publicClient = createPublicClient({ chain: zeccaGaslessChain, transport });
  return { publicClient, transport };
}

async function ensureToken(): Promise<Address> {
  if (tokenAddress) return tokenAddress;
  const cached = process.env.ZECCA_GASLESS_TOKEN?.trim();
  if (cached && /^0x[a-fA-F0-9]{40}$/.test(cached)) {
    tokenAddress = cached as Address;
    return tokenAddress;
  }
  const artifact = zeccaTokenArtifact();
  const deployed = await withKmsAccount(async (account) => {
    const { publicClient, transport } = await clients();
    const walletClient = createWalletClient({ account, chain: zeccaGaslessChain, transport });
    const data = encodeDeployData({
      abi: artifact.abi as never,
      bytecode: artifact.bytecode,
      args: ["Zecca USD", "zUSD", 6, account.address],
    });
    const hash = await walletClient.sendTransaction({
      account,
      chain: zeccaGaslessChain,
      data,
      gas: 4_000_000n,
      gasPrice: 0n,
      type: "legacy",
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
    if (receipt.status !== "success") throw new Error("Deploy gasless reverted.");
    if (!receipt.contractAddress) throw new Error("Deploy gasless senza address.");
    return receipt.contractAddress;
  });
  if (!deployed) throw new Error("KMS assente: impossibile fare deploy a gas zero.");
  tokenAddress = deployed;
  process.env.ZECCA_GASLESS_TOKEN = deployed;
  return deployed;
}

export async function tryGaslessEvmMint(input: {
  walletAddress: Address;
  usdCents: number;
}): Promise<{
  hash: Hex;
  explorerUrl: string;
  shopAddress: string;
  network: string;
  token: Address;
  chainId: number;
  gasPrice: 0;
} | null> {
  if (!gaslessEnabled()) return null;
  try {
    await ensureGaslessChain();
    const token = await ensureToken();
    const amount = proprietaryMintAmount(input.usdCents, 6);
    return await withKmsAccount(async (account) => {
      const { publicClient, transport } = await clients();
      const walletClient = createWalletClient({ account, chain: zeccaGaslessChain, transport });
      const data = encodeFunctionData({
        abi: MINT_ABI,
        functionName: "mint",
        args: [input.walletAddress, amount],
      });
      const hash = await walletClient.sendTransaction({
        account,
        chain: zeccaGaslessChain,
        to: token,
        data,
        gas: 250_000n,
        gasPrice: 0n,
        type: "legacy",
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
      if (receipt.status !== "success") throw new Error("Mint gasless reverted.");
      return {
        hash,
        explorerUrl: gaslessExplorerTx(hash),
        shopAddress: account.address,
        network: "ZECCA",
        token,
        chainId: ZECCA_GASLESS_CHAIN_ID,
        gasPrice: 0 as const,
      };
    });
  } catch (error) {
    console.error("[zecca-gasless] mint fallito", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function lookupGaslessTx(hash: string) {
  if (!gaslessEnabled()) return null;
  try {
    await ensureGaslessChain();
    const tx = (await gaslessRpcRequest("eth_getTransactionByHash", [hash])) as {
      hash?: string;
      to?: string;
      input?: string;
    } | null;
    if (!tx?.hash) return null;
    const input = (tx.input ?? "").toLowerCase().replace(/^0x/, "");
    const recipients: string[] = [];
    if (tx.to) recipients.push(tx.to);
    if (input.startsWith("40c10f19") && input.length >= 8 + 64) {
      recipients.push(`0x${input.slice(8 + 24, 8 + 64)}`);
    }
    return { hash: tx.hash, recipients };
  } catch {
    return null;
  }
}

export type GaslessTxView = {
  hash: string;
  status: "success" | "reverted" | "unknown";
  chainId: number;
  gasPriceWei: string;
  gasUsed: string | null;
  blockNumber: string | null;
  from: string | null;
  to: string | null;
  contractAddress: string | null;
  token: string | null;
  explorerUrl: string;
  etherscan: false;
};

export async function gaslessTxView(hash: string): Promise<GaslessTxView | null> {
  const normalized = hash.startsWith("0x") ? hash : `0x${hash}`;
  if (!/^0x[a-fA-F0-9]{64}$/i.test(normalized)) return null;
  try {
    await ensureGaslessChain();
    const [tx, receipt, chainId, gasPrice] = await Promise.all([
      gaslessRpcRequest("eth_getTransactionByHash", [normalized]) as Promise<{
        hash?: string;
        from?: string;
        to?: string | null;
        gasPrice?: string;
        blockNumber?: string | null;
      } | null>,
      gaslessRpcRequest("eth_getTransactionReceipt", [normalized]) as Promise<{
        status?: string;
        gasUsed?: string;
        contractAddress?: string | null;
        from?: string;
        to?: string | null;
        blockNumber?: string | null;
      } | null>,
      gaslessRpcRequest("eth_chainId", []),
      gaslessRpcRequest("eth_gasPrice", []),
    ]);
    if (!tx?.hash) return null;
    const statusHex = receipt?.status;
    const status = statusHex === "0x1" || statusHex === "1" ? "success" : statusHex === "0x0" ? "reverted" : "unknown";
    return {
      hash: tx.hash,
      status,
      chainId: Number(chainId) || ZECCA_GASLESS_CHAIN_ID,
      gasPriceWei: String(BigInt((tx.gasPrice as string | undefined) || (gasPrice as string) || "0x0")),
      gasUsed: receipt?.gasUsed ? String(BigInt(receipt.gasUsed)) : null,
      blockNumber: receipt?.blockNumber || tx.blockNumber || null,
      from: tx.from ?? receipt?.from ?? null,
      to: tx.to ?? receipt?.to ?? null,
      contractAddress: receipt?.contractAddress ?? null,
      token: tokenAddress,
      explorerUrl: gaslessExplorerTx(tx.hash),
      etherscan: false,
    };
  } catch {
    return null;
  }
}

export async function gaslessStatus() {
  const signer = kmsSignerAddress();
  let ready = false;
  let token: string | null = tokenAddress;
  try {
    if (gaslessEnabled()) {
      await ensureGaslessChain();
      const id = await gaslessRpcRequest("eth_chainId");
      ready = Number(id) === ZECCA_GASLESS_CHAIN_ID || String(id).toLowerCase() === "0x5668";
      if (!token && ready) token = await ensureToken();
    }
  } catch {
    ready = false;
  }
  return {
    chain: "Zecca Gasless",
    chainId: ZECCA_GASLESS_CHAIN_ID,
    gasPriceWei: 0,
    ready,
    hosted: canHostGasless(),
    rpc: gaslessRpcProxyUrl(),
    token,
    minter: signer,
    metamask: {
      chainId: `0x${ZECCA_GASLESS_CHAIN_ID.toString(16)}`,
      chainName: "Zecca Gasless",
      nativeCurrency: { name: "Zecca gas", symbol: "zGAS", decimals: 18 },
      rpcUrls: [gaslessRpcProxyUrl()],
      blockExplorerUrls: [`${gaslessExplorerTx("").replace(/tx\/$/, "")}`],
    },
    note: "Gas price 0. Non è Ethereum mainnet: MetaMask deve usare questa RPC. Hash verificabili su /catena/tx, non su Etherscan. zUSD è un token di protocollo Zecca, non Tether.",
  };
}
