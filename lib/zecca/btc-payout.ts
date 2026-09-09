import { createHmac } from "node:crypto";
import { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";
import { ZeccaError } from "@/lib/errors";
import { nativeWeiFromUsdCents, usdSpotPrice } from "@/lib/evm-send";
import { explorerUrl } from "@/lib/receipt";
import { isValidWalletAddress, normalizeWalletAddress } from "@/lib/wallet";

const DUST = BigInt(546);
const MEMPOOL = "https://mempool.space/api";

type MempoolUtxo = { txid: string; vout: number; value: number };

function shopBtcSeed(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  return createHmac("sha512", "zecca-shop-btc-v1").update(secret).digest();
}

function shopBtcKey() {
  const seed = shopBtcSeed();
  if (!seed) return null;
  const child = HDKey.fromMasterSeed(seed).derive("m/84'/0'/0'/0/0");
  if (!child.privateKey || !child.publicKey) return null;
  const spend = btc.p2wpkh(child.publicKey, btc.NETWORK);
  if (!spend.address) return null;
  return { privateKey: child.privateKey, spend, address: spend.address };
}

export function shopBtcAddress(): string | null {
  return shopBtcKey()?.address ?? null;
}

function formatBtc(sats: bigint): string {
  const whole = sats / BigInt(100000000);
  const frac = (sats % BigInt(100000000)).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

function vsizeFor(inputs: number, outputs: number) {
  return Math.ceil(10.5 + 68 * inputs + 31 * outputs);
}

export async function sendShopBtcPayout(input: {
  walletAddress: string;
  usdCents: number;
}): Promise<{ hash: string; explorerUrl: string | null; shopAddress: string; network: "BTC" }> {
  const dest = normalizeWalletAddress(input.walletAddress);
  if (!isValidWalletAddress(dest, "BTC")) {
    throw new ZeccaError("Indirizzo Bitcoin non valido.", "INVALID_WALLET");
  }
  const key = shopBtcKey();
  if (!key) {
    throw new ZeccaError(
      "Il negozio non ha una cassa Bitcoin da cui convertire i crediti.",
      "MISSING_SHOP_KEY",
    );
  }

  const price = await usdSpotPrice("BTC");
  const sendSats = nativeWeiFromUsdCents(input.usdCents, price, 8);
  if (sendSats < DUST) {
    throw new ZeccaError("Importo troppo piccolo per Bitcoin.", "INVALID_AMOUNT");
  }

  const utxoRes = await fetch(`${MEMPOOL}/address/${key.address}/utxo`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!utxoRes.ok) {
    throw new ZeccaError("Mempool non raggiungibile per leggere il saldo Bitcoin del negozio.", "SHOP_SEND_FAILED");
  }
  const utxos = ((await utxoRes.json()) as MempoolUtxo[]).sort((a, b) => b.value - a.value);
  const total = utxos.reduce((sum, u) => sum + u.value, 0);

  const feeRes = await fetch(`${MEMPOOL}/v1/fees/recommended`, { signal: AbortSignal.timeout(8000) });
  const fees = feeRes.ok
    ? ((await feeRes.json()) as { halfHourFee?: number; fastestFee?: number })
    : {};
  const satPerVb = Math.max(1, Math.floor(Number(fees.halfHourFee ?? fees.fastestFee ?? 8)));

  let chosen: MempoolUtxo[] | null = null;
  let fee = BigInt(0);
  let change = BigInt(0);
  for (let n = 1; n <= utxos.length; n += 1) {
    const slice = utxos.slice(0, n);
    const sum = BigInt(slice.reduce((s, u) => s + u.value, 0));
    const withChange = BigInt(vsizeFor(n, 2) * satPerVb);
    const withoutChange = BigInt(vsizeFor(n, 1) * satPerVb);
    if (sum >= sendSats + withChange && sum - sendSats - withChange >= DUST) {
      chosen = slice;
      fee = withChange;
      change = sum - sendSats - fee;
      break;
    }
    if (sum >= sendSats + withoutChange) {
      chosen = slice;
      fee = sum - sendSats;
      change = BigInt(0);
      break;
    }
  }

  if (!chosen) {
    throw new ZeccaError(
      `I crediti sono convertiti in ${formatBtc(sendSats)} BTC, ma sulla rete Bitcoin il negozio (${key.address}) ha solo ${formatBtc(BigInt(total))} BTC. Senza quei satoshi Mempool non può avere un hash: i crediti del libro non sono bitcoin. Chi riceve non firma.`,
      "INSUFFICIENT_SHOP_FUNDS",
    );
  }

  const tx = new btc.Transaction();
  for (const utxo of chosen) {
    tx.addInput({
      ...key.spend,
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: key.spend.script, amount: BigInt(utxo.value) },
    });
  }
  tx.addOutputAddress(dest, sendSats, btc.NETWORK);
  if (change > BigInt(0)) {
    tx.addOutputAddress(key.address, change, btc.NETWORK);
  }
  tx.sign(key.privateKey);
  tx.finalize();

  const broadcast = await fetch(`${MEMPOOL}/tx`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: tx.hex,
    signal: AbortSignal.timeout(20000),
  });
  const body = (await broadcast.text()).trim();
  if (!broadcast.ok) {
    throw new ZeccaError(
      `Bitcoin non accettato dalla rete: ${body || broadcast.status}. Cassa ${key.address}.`,
      "SHOP_SEND_FAILED",
    );
  }
  const hash = /^[a-fA-F0-9]{64}$/.test(body) ? body : tx.id;
  return {
    hash,
    explorerUrl: explorerUrl("BTC", hash),
    shopAddress: key.address,
    network: "BTC",
  };
}
