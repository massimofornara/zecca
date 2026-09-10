import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { siteHref } from "@/lib/public-url";
import { kmsSealedPrivateKey, kmsSignerAddress, withKmsAccount } from "@/lib/zecca/kms-signer";
import { proprietaryMintAmount } from "@/lib/zecca/token-mint";
import { zeccaTokenArtifact } from "@/lib/zecca/zecca-token-artifact";

export const ZECCA_GASLESS_CHAIN_ID = 22120;

export const zeccaGaslessChain = defineChain({
  id: ZECCA_GASLESS_CHAIN_ID,
  name: "Zecca Gasless",
  nativeCurrency: { name: "Zecca gas", symbol: "zGAS", decimals: 18 },
  rpcUrls: {
    default: { http: ["/api/rails/chain/rpc"] },
  },
});

const MINT_ABI = parseAbi([
  "constructor(string tokenName, string tokenSymbol, uint8 tokenDecimals, address admin)",
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function MINTER_ROLE() view returns (bytes32)",
]);

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

let provider: Eip1193 | null = null;
let engine: Eip1193 | null = null;
let tokenAddress: Address | null = null;
let starting: Promise<void> | null = null;
let replaying = false;

export function gaslessEnabled() {
  return process.env.ZECCA_GASLESS !== "0";
}

export function canHostGasless() {
  if (!gaslessEnabled()) return false;
  return true;
}

export function gaslessExplorerTx(hash: string) {
  const id = hash.replace(/\/+$/, "");
  return siteHref(`/catena/tx/${id}`);
}

export function gaslessRpcProxyUrl() {
  return siteHref("/api/rails/chain/rpc");
}

export function gaslessEtherscanApiUrl(hash?: string) {
  const base = siteHref("/api/rails/chain/v2/api");
  if (!hash) return base;
  return `${base}?module=proxy&action=eth_getTransactionReceipt&txhash=${hash}`;
}

async function persistRawTx(raw: string, hash: string) {
  try {
    const { prisma } = await import("@/lib/db");
    const tx = (await innerRequest("eth_getTransactionByHash", [hash])) as unknown;
    const receipt = (await innerRequest("eth_getTransactionReceipt", [hash])) as unknown;
    await prisma.gaslessRawTx.upsert({
      where: { hash },
      create: {
        hash,
        raw,
        txJson: JSON.stringify(tx),
        receiptJson: JSON.stringify(receipt),
      },
      update: {
        raw,
        txJson: JSON.stringify(tx),
        receiptJson: JSON.stringify(receipt),
      },
    });
  } catch (error) {
    console.error("[zecca-gasless] persist", error instanceof Error ? error.message : error);
  }
}

async function loadPersistedRaw() {
  try {
    const { prisma } = await import("@/lib/db");
    return await prisma.gaslessRawTx.findMany({ orderBy: { id: "asc" } });
  } catch {
    return [];
  }
}

async function loadPersistedReceipt(hash: string) {
  try {
    const { prisma } = await import("@/lib/db");
    return await prisma.gaslessRawTx.findUnique({ where: { hash } });
  } catch {
    return null;
  }
}

async function innerRequest(method: string, params: unknown[] = []) {
  const src = engine ?? provider;
  if (!src) throw new Error("Catena gasless non avviata.");
  return src.request({ method, params });
}

function wrapProvider(inner: Eip1193): Eip1193 {
  engine = inner;
  return {
    request: async ({ method, params }) => {
      const result = await inner.request({ method, params });
      if (
        !replaying &&
        method === "eth_sendRawTransaction" &&
        typeof params?.[0] === "string" &&
        typeof result === "string"
      ) {
        await persistRawTx(params[0], result);
      }
      return result;
    },
  };
}

async function remoteProvider(): Promise<Eip1193> {
  const url = process.env.ZECCA_GASLESS_RPC_URL?.trim();
  if (!url) throw new Error("ZECCA_GASLESS_RPC_URL assente.");
  return {
    request: async ({ method, params }) => {
      const res = await fetch(url, {
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
  if (process.env.ZECCA_GASLESS_RPC_URL?.trim()) {
    provider = await remoteProvider();
    return;
  }

  const ganache = (await import("ganache")).default as {
    provider: (opts: Record<string, unknown>) => Eip1193;
  };
  const key = kmsSealedPrivateKey();
  const inner = ganache.provider({
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
  await inner.request({ method: "eth_chainId", params: [] });
  const rows = await loadPersistedRaw();
  replaying = true;
  try {
    for (const row of rows) {
      try {
        await inner.request({ method: "eth_sendRawTransaction", params: [row.raw] });
      } catch {
        // già nello stato o nonce già usato
      }
    }
  } finally {
    replaying = false;
  }
  provider = wrapProvider(inner);
  if (rows[0]?.receiptJson) {
    try {
      const first = JSON.parse(rows[0].receiptJson) as { contractAddress?: string | null };
      if (first.contractAddress) tokenAddress = first.contractAddress as Address;
    } catch {
      /* ignore */
    }
  }
}

export async function ensureGaslessChain() {
  if (!gaslessEnabled()) return;
  if (!starting) {
    starting = listenGanache().catch((error) => {
      starting = null;
      provider = null;
      engine = null;
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

function eip1193Transport() {
  return custom({
    async request({ method, params }) {
      return gaslessRpcRequest(method, (params as unknown[]) ?? []);
    },
  });
}

async function clients() {
  await ensureGaslessChain();
  const transport = eip1193Transport();
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
  const persisted = await loadPersistedRaw();
  for (const row of persisted) {
    if (!row.receiptJson) continue;
    try {
      const receipt = JSON.parse(row.receiptJson) as { contractAddress?: string | null };
      if (receipt.contractAddress) {
        tokenAddress = receipt.contractAddress as Address;
        process.env.ZECCA_GASLESS_TOKEN = tokenAddress;
        return tokenAddress;
      }
    } catch {
      /* next */
    }
  }
  const artifact = zeccaTokenArtifact();
  const deployed = await withKmsAccount(async (account) => {
    const { publicClient, transport } = await clients();
    const walletClient = createWalletClient({ account, chain: zeccaGaslessChain, transport });
    const data = encodeDeployData({
      abi: MINT_ABI,
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
    let tx = (await gaslessRpcRequest("eth_getTransactionByHash", [hash])) as {
      hash?: string;
      to?: string;
      input?: string;
    } | null;
    if (!tx?.hash) {
      const row = await loadPersistedReceipt(hash);
      if (row?.txJson) tx = JSON.parse(row.txJson) as typeof tx;
    }
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
  etherscanApi: string;
  etherscanIo: false;
};

export async function gaslessTxView(hash: string): Promise<GaslessTxView | null> {
  const normalized = hash.startsWith("0x") ? hash : `0x${hash}`;
  if (!/^0x[a-fA-F0-9]{64}$/i.test(normalized)) return null;
  try {
    await ensureGaslessChain();
    let tx = (await gaslessRpcRequest("eth_getTransactionByHash", [normalized])) as {
      hash?: string;
      from?: string;
      to?: string | null;
      gasPrice?: string;
      blockNumber?: string | null;
      input?: string;
    } | null;
    let receipt = (await gaslessRpcRequest("eth_getTransactionReceipt", [normalized])) as {
      status?: string;
      gasUsed?: string;
      contractAddress?: string | null;
      from?: string;
      to?: string | null;
      blockNumber?: string | null;
    } | null;
    if (!tx?.hash) {
      const row = await loadPersistedReceipt(normalized);
      if (row?.txJson) tx = JSON.parse(row.txJson) as typeof tx;
      if (row?.receiptJson) receipt = JSON.parse(row.receiptJson) as typeof receipt;
    }
    if (!tx?.hash) return null;
    const chainId = await gaslessRpcRequest("eth_chainId", []).catch(() => "0x5668");
    const gasPrice = await gaslessRpcRequest("eth_gasPrice", []).catch(() => "0x0");
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
      etherscanApi: gaslessEtherscanApiUrl(tx.hash),
      etherscanIo: false,
    };
  } catch {
    return null;
  }
}

export async function handleGaslessJsonRpc(body: unknown) {
  await ensureGaslessChain();
  const dispatch = async (item: { id?: unknown; method?: string; params?: unknown[] }) => {
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
  };
  if (Array.isArray(body)) {
    return Promise.all(body.map((item) => dispatch((item ?? {}) as { id?: unknown; method?: string; params?: unknown[] })));
  }
  return dispatch((body ?? {}) as { id?: unknown; method?: string; params?: unknown[] });
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
    vercel: Boolean(process.env.VERCEL),
    rpc: gaslessRpcProxyUrl(),
    etherscanApi: gaslessEtherscanApiUrl(),
    token,
    minter: signer,
    metamask: {
      chainId: `0x${ZECCA_GASLESS_CHAIN_ID.toString(16)}`,
      chainName: "Zecca Gasless",
      nativeCurrency: { name: "Zecca gas", symbol: "zGAS", decimals: 18 },
      rpcUrls: [gaslessRpcProxyUrl()],
      blockExplorerUrls: [`${gaslessExplorerTx("").replace(/tx\/$/, "")}`],
    },
    note: "Gas price 0 sulla chain 22120, ospitata nel processo Node/serverless (POST /api/rails/chain/rpc). Non è Ethereum mainnet: etherscan.io non include questi hash. zUSD non è USDT Tether. MetaMask deve aggiungere questa RPC.",
  };
}
