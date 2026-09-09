import { createHmac } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
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

function envBtcPrivateKey(): Uint8Array | null {
  const wif = process.env.ZECCA_BTC_WIF?.trim();
  if (wif) {
    try {
      const decoded = btc.WIF().decode(wif);
      if (decoded.length === 32) return decoded;
    } catch {
      return null;
    }
  }
  const hex = (process.env.ZECCA_BTC_PRIVATE_KEY ?? "").trim().replace(/^0x/i, "");
  if (/^[a-fA-F0-9]{64}$/.test(hex)) {
    return Uint8Array.from(Buffer.from(hex, "hex"));
  }
  return null;
}

function keyFromPrivate(privateKey: Uint8Array) {
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const spend = btc.p2wpkh(publicKey, btc.NETWORK);
  if (!spend.address) return null;
  return { privateKey, spend, address: spend.address };
}

function shopBtcKey() {
  const fromEnv = envBtcPrivateKey();
  if (fromEnv) return keyFromPrivate(fromEnv);
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

export type ShopCoverage = {
  covered: boolean;
  shopAddress: string | null;
  onChainLabel: string;
  neededLabel: string;
  message: string;
  code: "OK" | "INSUFFICIENT_SHOP_FUNDS" | "MISSING_SHOP_KEY" | "SHOP_SEND_FAILED" | "INVALID_AMOUNT" | "INVALID_WALLET";
};

type BtcPlan = {
  dest: string;
  key: NonNullable<ReturnType<typeof shopBtcKey>>;
  grossSats: bigint;
  feeSats: bigint;
  sendSats: bigint;
  chosen: MempoolUtxo[];
  change: bigint;
  total: number;
  satPerVb: number;
};

async function planShopBtcPayout(input: { walletAddress: string; usdCents: number }): Promise<BtcPlan> {
  const dest = normalizeWalletAddress(input.walletAddress);
  if (!isValidWalletAddress(dest, "BTC")) {
    throw new ZeccaError("Indirizzo Bitcoin non valido.", "INVALID_WALLET");
  }
  const key = shopBtcKey();
  if (!key) {
    throw new ZeccaError(
      "Il negozio non ha una chiave Bitcoin da cui firmare il payout diretto.",
      "MISSING_SHOP_KEY",
    );
  }

  const price = await usdSpotPrice("BTC");
  const grossSats = nativeWeiFromUsdCents(input.usdCents, price, 8);
  if (grossSats < DUST) {
    throw new ZeccaError("Importo troppo piccolo per Bitcoin.", "INVALID_AMOUNT");
  }

  const utxoRes = await fetch(`${MEMPOOL}/address/${key.address}/utxo`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!utxoRes.ok) {
    throw new ZeccaError("Mempool non raggiungibile per leggere gli UTXO del dispenser Bitcoin.", "SHOP_SEND_FAILED");
  }
  const utxos = ((await utxoRes.json()) as MempoolUtxo[]).sort((a, b) => b.value - a.value);
  const total = utxos.reduce((sum, u) => sum + u.value, 0);

  const feeRes = await fetch(`${MEMPOOL}/v1/fees/recommended`, { signal: AbortSignal.timeout(8000) });
  const fees = feeRes.ok
    ? ((await feeRes.json()) as { halfHourFee?: number; fastestFee?: number })
    : {};
  const satPerVb = Math.max(1, Math.floor(Number(fees.halfHourFee ?? fees.fastestFee ?? 8)));

  let chosen: MempoolUtxo[] | null = null;
  let change = BigInt(0);
  let feeSats = BigInt(0);
  let sendSats = BigInt(0);
  for (let n = 1; n <= utxos.length; n += 1) {
    const slice = utxos.slice(0, n);
    const sum = BigInt(slice.reduce((s, u) => s + u.value, 0));
    const feeChange = BigInt(vsizeFor(n, 2) * satPerVb);
    const feeNoChange = BigInt(vsizeFor(n, 1) * satPerVb);
    const netChange = grossSats - feeChange;
    const netNoChange = grossSats - feeNoChange;
    if (netChange >= DUST && sum >= grossSats && sum - netChange - feeChange >= DUST) {
      chosen = slice;
      sendSats = netChange;
      feeSats = feeChange;
      change = sum - netChange - feeChange;
      break;
    }
    if (netNoChange >= DUST && sum >= grossSats) {
      chosen = slice;
      sendSats = netNoChange;
      feeSats = feeNoChange;
      change = BigInt(0);
      break;
    }
  }

  if (!chosen || sendSats < DUST) {
    throw new ZeccaError(
      `Il controvalore è ${formatBtc(grossSats)} BTC, ma il dispenser Bitcoin (${key.address}) ha solo ${formatBtc(BigInt(total))} BTC confermati. I crediti del libro non sono satoshi: senza UTXO la mempool rifiuta l’invio.`,
      "INSUFFICIENT_SHOP_FUNDS",
    );
  }

  return { dest, key, grossSats, feeSats, sendSats, chosen, change, total, satPerVb };
}

export async function quoteShopBtcPayout(input: {
  walletAddress: string;
  usdCents: number;
}): Promise<ShopCoverage & { grossLabel: string; feeLabel: string; netLabel: string; mode: "TRANSFER" }> {
  try {
    const plan = await planShopBtcPayout(input);
    return {
      covered: true,
      shopAddress: plan.key.address,
      onChainLabel: `${formatBtc(BigInt(plan.total))} BTC`,
      neededLabel: `${formatBtc(plan.grossSats)} BTC`,
      grossLabel: `${formatBtc(plan.grossSats)} BTC`,
      feeLabel: `${formatBtc(plan.feeSats)} BTC (${plan.satPerVb} sat/vB)`,
      netLabel: `${formatBtc(plan.sendSats)} BTC`,
      message: "Payout diretto: il destinatario riceve il netto, le fee minerarie restano sulla transazione.",
      code: "OK",
      mode: "TRANSFER",
    };
  } catch (error) {
    if (error instanceof ZeccaError) {
      const shopAddress = shopBtcAddress();
      return {
        covered: false,
        shopAddress,
        onChainLabel: shopAddress ? "saldo in lettura" : "wallet assente",
        neededLabel: "BTC",
        grossLabel: "BTC",
        feeLabel: "fee in stima",
        netLabel: "0 BTC",
        message: error.message,
        code: error.code as ShopCoverage["code"],
        mode: "TRANSFER",
      };
    }
    throw error;
  }
}

export async function probeShopBtcCoverage(input: {
  walletAddress: string;
  usdCents: number;
}): Promise<ShopCoverage> {
  const quote = await quoteShopBtcPayout(input);
  const { grossLabel: _g, feeLabel: _f, netLabel: _n, mode: _m, ...coverage } = quote;
  return coverage;
}

export async function sendShopBtcPayout(input: {
  walletAddress: string;
  usdCents: number;
}): Promise<{ hash: string; explorerUrl: string | null; shopAddress: string; network: "BTC" }> {
  const plan = await planShopBtcPayout(input);
  const tx = new btc.Transaction();
  for (const utxo of plan.chosen) {
    tx.addInput({
      ...plan.key.spend,
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: plan.key.spend.script, amount: BigInt(utxo.value) },
    });
  }
  tx.addOutputAddress(plan.dest, plan.sendSats, btc.NETWORK);
  if (plan.change > BigInt(0)) {
    tx.addOutputAddress(plan.key.address, plan.change, btc.NETWORK);
  }
  tx.sign(plan.key.privateKey);
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
      `Bitcoin non accettato dalla rete: ${body || broadcast.status}. Cassa ${plan.key.address}.`,
      "SHOP_SEND_FAILED",
    );
  }
  const hash = /^[a-fA-F0-9]{64}$/.test(body) ? body : tx.id;
  return {
    hash,
    explorerUrl: explorerUrl("BTC", hash),
    shopAddress: plan.key.address,
    network: "BTC",
  };
}
