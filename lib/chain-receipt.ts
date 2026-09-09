import { normalizeReceipt } from "@/lib/receipt";
import { normalizeWalletAddress } from "@/lib/wallet";
import { lookupGaslessTx } from "@/lib/zecca/gasless-chain";

export type OnChainTx = {
  hash: string;
  recipients: string[];
};

export type ChainLookup = (input: { network: string; hash: string }) => Promise<OnChainTx | null>;

const ERC20_TRANSFER = "a9059cbb";

function sameAddress(a: string, b: string) {
  return normalizeWalletAddress(a).toLowerCase() === normalizeWalletAddress(b).toLowerCase();
}

function decodeErc20Recipient(input: string | null | undefined): string | null {
  const data = (input ?? "").toLowerCase().replace(/^0x/, "");
  if (!data.startsWith(ERC20_TRANSFER) || data.length < 8 + 64) return null;
  return `0x${data.slice(8 + 24, 8 + 64)}`;
}

async function postJson(url: string, body: unknown, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function lookupEvm(hash: string, endpoints: string[], label: string): Promise<OnChainTx | null> {
  for (const url of endpoints) {
    try {
      const json = (await postJson(url, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionByHash",
        params: [hash],
      })) as { result?: { hash?: string; to?: string; input?: string } | null };
      const tx = json.result;
      if (!tx?.hash) return null;
      const tokenTo = decodeErc20Recipient(tx.input);
      const recipients = [tokenTo, tx.to].filter((value): value is string => Boolean(value));
      return { hash: tx.hash, recipients };
    } catch {
      continue;
    }
  }
  throw new Error(`Rete ${label} non raggiungibile per verificare l’hash.`);
}

async function lookupEth(hash: string): Promise<OnChainTx | null> {
  return lookupEvm(
    hash,
    ["https://ethereum.publicnode.com", "https://cloudflare-eth.com", "https://rpc.ankr.com/eth"],
    "Ethereum",
  );
}

async function lookupBsc(hash: string): Promise<OnChainTx | null> {
  return lookupEvm(hash, ["https://bsc-dataseed.binance.org", "https://bsc.publicnode.com"], "BNB");
}

async function lookupBtc(hash: string): Promise<OnChainTx | null> {
  try {
    const res = await fetch(`https://mempool.space/api/tx/${hash}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tx = (await res.json()) as { txid?: string; vout?: { scriptpubkey_address?: string }[] };
    if (!tx.txid) return null;
    return {
      hash: tx.txid,
      recipients: (tx.vout ?? []).map((out) => out.scriptpubkey_address).filter((value): value is string => Boolean(value)),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("HTTP")) throw error;
    throw new Error("Rete Bitcoin non raggiungibile per verificare l’hash.");
  }
}

async function lookupTrx(hash: string): Promise<OnChainTx | null> {
  try {
    const json = (await postJson("https://api.trongrid.io/wallet/gettransactionbyid", {
      value: hash,
    })) as {
      txID?: string;
      raw_data?: { contract?: { parameter?: { value?: { to_address?: string; toAddress?: string } } }[] };
    };
    if (!json.txID) return null;
    const recipients: string[] = [];
    for (const item of json.raw_data?.contract ?? []) {
      const value = item.parameter?.value;
      if (value?.to_address) recipients.push(value.to_address);
      if (value?.toAddress) recipients.push(value.toAddress);
    }
    return { hash: json.txID, recipients };
  } catch {
    throw new Error("Rete Tron non raggiungibile per verificare l’hash.");
  }
}

export const defaultChainLookup: ChainLookup = async ({ network, hash }) => {
  if (network === "BTC") return lookupBtc(hash);
  if (network === "TRX") return lookupTrx(hash);
  if (network === "ZECCA") return lookupGaslessTx(hash);
  const onGasless = await lookupGaslessTx(hash);
  if (onGasless) return onGasless;
  if (network === "BNB") return lookupBsc(hash);
  return lookupEth(hash);
};

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseIso(value: string | number | null | undefined) {
  if (value == null) return null;
  if (typeof value === "number") return new Date(value * (value < 1e12 ? 1000 : 1));
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Cerca un hash già confermato verso questo wallet. Non inventa transazioni:
 * legge Etherscan/Blockscout, BscScan/Blockscout o Mempool.
 */
export async function findIncomingCryptoTx(input: {
  network: string;
  address: string;
  notBefore?: Date;
}): Promise<{ hash: string } | null> {
  const address = normalizeWalletAddress(input.address);
  const since = input.notBefore ?? new Date(0);
  try {
    if (input.network === "BTC") {
      const txs = (await getJson(`https://mempool.space/api/address/${address}/txs`)) as {
        txid?: string;
        status?: { block_time?: number };
        vout?: { scriptpubkey_address?: string }[];
      }[];
      const hit = (Array.isArray(txs) ? txs : []).find((tx) => {
        const at = tx.status?.block_time ? new Date(tx.status.block_time * 1000) : null;
        const toUs = (tx.vout ?? []).some((out) => out.scriptpubkey_address === address);
        return Boolean(tx.txid) && toUs && (!at || at >= since);
      });
      return hit?.txid ? { hash: hit.txid } : null;
    }
    if (input.network === "TRX") return null;
    const host = input.network === "BNB" ? "https://bsc.blockscout.com" : "https://eth.blockscout.com";
    const [native, tokens] = await Promise.all([
      getJson(`${host}/api/v2/addresses/${address}/transactions?filter=to`).catch(() => ({ items: [] })),
      getJson(`${host}/api/v2/addresses/${address}/token-transfers`).catch(() => ({ items: [] })),
    ]);
    const nativeItems = ((native as { items?: { hash?: string; timestamp?: string; result?: string }[] }).items ??
      []) as { hash?: string; timestamp?: string; result?: string }[];
    const tokenItems = ((tokens as { items?: { transaction_hash?: string; timestamp?: string; token?: { symbol?: string } }[] })
      .items ?? []) as { transaction_hash?: string; timestamp?: string; token?: { symbol?: string } }[];
    const wantToken = input.network === "USDT" || input.network === "USDC" ? input.network : null;
    const tokenHit = tokenItems.find((item) => {
      const at = parseIso(item.timestamp);
      const symbol = (item.token?.symbol ?? "").toUpperCase();
      const okToken = !wantToken || symbol === wantToken || symbol.startsWith(wantToken);
      return Boolean(item.transaction_hash) && okToken && (!at || at >= since);
    });
    if (tokenHit?.transaction_hash) return { hash: tokenHit.transaction_hash };
    const nativeHit = nativeItems.find((item) => {
      const at = parseIso(item.timestamp);
      return Boolean(item.hash) && item.result !== "error" && (!at || at >= since);
    });
    if (nativeHit?.hash && !wantToken) return { hash: nativeHit.hash };
    if (nativeHit?.hash && wantToken && !tokenHit) return { hash: nativeHit.hash };
    return null;
  } catch {
    return null;
  }
}

export async function verifyCryptoReceipt(input: {
  network: string;
  hash: string;
  expectedAddress?: string | null;
  lookup?: ChainLookup;
}): Promise<{ hash: string; recipients: string[] }> {
  const hash = normalizeReceipt(input.hash);
  const lookup = input.lookup ?? defaultChainLookup;
  const found = await lookup({ network: input.network, hash });
  if (!found) {
    throw new Error(
      "Questo hash non esiste sulla rete. Incolla l’hash reale della transazione già confermata.",
    );
  }
  const expected = input.expectedAddress ? normalizeWalletAddress(input.expectedAddress) : "";
  if (expected && found.recipients.length > 0) {
    const match = found.recipients.some((recipient) => sameAddress(recipient, expected));
    if (!match && (input.network === "ETH" || input.network === "USDT" || input.network === "USDC" || input.network === "BNB" || input.network === "BTC" || input.network === "ZECCA")) {
      throw new Error(
        "L’hash è reale ma non va al wallet indicato in questo prelievo. Controlla destinazione e rete.",
      );
    }
  }
  return found;
}
