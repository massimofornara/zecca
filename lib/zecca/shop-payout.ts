import { createHmac } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, mainnet } from "viem/chains";
import { ZeccaError } from "@/lib/errors";
import { isShopSendableNetwork } from "@/lib/evm-send";
import { explorerUrl } from "@/lib/receipt";
import { isValidWalletAddress, normalizeWalletAddress } from "@/lib/wallet";
import { sendShopBtcPayout, shopBtcAddress, type ShopCoverage } from "@/lib/zecca/btc-payout";
import {
  encodeProprietaryMint,
  proprietaryMintAmount,
  proprietaryTokenConfig,
} from "@/lib/zecca/token-mint";

export { shopBtcAddress };
export type { ShopCoverage };

export type ShopPayoutResult = {
  hash: string;
  explorerUrl: string | null;
  shopAddress: string;
  network: string;
};

function envShopPrivateKey(): Hex | null {
  const raw = process.env.ZECCA_EVM_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) return null;
  return hex;
}

/** Wallet fisso del negozio: override env, altrimenti HMAC di AUTH_SECRET (stesso su ogni lambda). */
export function shopEvmPrivateKey(): Hex | null {
  const fromEnv = envShopPrivateKey();
  if (fromEnv) return fromEnv;
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  const digest = createHmac("sha256", secret).update("zecca-shop-evm-v1").digest("hex");
  return `0x${digest}` as Hex;
}

export function isShopEvmConfigured() {
  return shopEvmPrivateKey() !== null;
}

export function shopWalletAddress(): Address | null {
  const key = shopEvmPrivateKey();
  if (!key) return null;
  return privateKeyToAccount(key).address;
}

export function shopPayoutAddress(network: string | null | undefined): string | null {
  const id = (network ?? "").trim().toUpperCase();
  if (id === "BTC") return shopBtcAddress();
  return shopWalletAddress();
}

export function isEvmPayoutNetwork(network: string | null | undefined) {
  const id = (network ?? "").trim().toUpperCase();
  return id === "ETH" || id === "USDT" || id === "USDC" || id === "BNB" || id === "ZECCA";
}

export function shopPayoutConfigError(network: string | null | undefined): string | null {
  const id = (network ?? "").trim().toUpperCase();
  if (id === "TRX") {
    return "USDT su Tron non è un payout del dispenser. Scegli Bitcoin o un indirizzo EVM (MetaMask, Trust Wallet, exchange).";
  }
  if (!isShopSendableNetwork(id)) {
    return "Scegli BTC, ETH, USDT, USDC, BNB o il token Zecca.";
  }
  return null;
}

function rpcUrl(chainId: number): string {
  if (chainId === 56) {
    return process.env.ZECCA_BSC_RPC_URL?.trim() || "https://bsc-dataseed.binance.org";
  }
  return process.env.ZECCA_ETH_RPC_URL?.trim() || "https://ethereum.publicnode.com";
}

function chainFor(chainId: number) {
  return chainId === 56 ? bsc : mainnet;
}

export type DirectPayoutQuote = {
  network: string;
  mode: "TRANSFER" | "MINT" | "QUEUE";
  shopAddress: string | null;
  dest: string;
  usdCents: number;
  grossLabel: string;
  feeLabel: string;
  netLabel: string;
  message: string;
};

/** Preventivo di libro: nessuna interrogazione Mempool/RPC, nessun blocco a saldo zero. */
export function quoteBookPayout(input: {
  walletAddress: string;
  walletNetwork: string;
  usdCents: number;
}): DirectPayoutQuote {
  const network = (input.walletNetwork ?? "").trim().toUpperCase();
  const dest = normalizeWalletAddress(input.walletAddress);
  const usd = Math.max(0, Math.floor(input.usdCents));
  const label = `${(usd / 100).toFixed(2)} USD in ${network}`;
  const evm = isEvmPayoutNetwork(network);
  const mintReady = Boolean(proprietaryTokenConfig());
  return {
    network,
    mode: evm && mintReady ? "MINT" : "QUEUE",
    shopAddress: shopPayoutAddress(network),
    dest,
    usdCents: usd,
    grossLabel: label,
    feeLabel: "commissioni di rete a carico della liquidazione",
    netLabel: label,
    message: evm
      ? mintReady
        ? "Conferma: i crediti si bruciano e il token Zecca viene coniato sul wallet indicato."
        : "Conferma: i crediti si bruciano e la richiesta entra in coda di liquidazione con ricevuta Zecca."
      : "Conferma: i crediti si bruciano e il payout Bitcoin entra in coda di liquidazione, con ricevuta Zecca.",
  };
}

/**
 * Mint del token di protocollo verso il destinatario EVM.
 * Se il contratto non è configurato o la firma fallisce, torna null:
 * il chiamante accetta la richiesta in coda, senza eccezione all’utente.
 */
export async function tryDirectEvmMint(input: {
  walletAddress: string;
  usdCents: number;
}): Promise<ShopPayoutResult | null> {
  const token = proprietaryTokenConfig();
  const key = shopEvmPrivateKey();
  if (!token || !key) return null;

  const to = normalizeWalletAddress(input.walletAddress) as Address;
  if (!isValidWalletAddress(to, "ETH")) return null;

  const chain = chainFor(token.chainId);
  const transport = http(rpcUrl(token.chainId));
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const amount = proprietaryMintAmount(input.usdCents, token.decimals);

  try {
    const hash = await walletClient.sendTransaction({
      to: token.address,
      data: encodeProprietaryMint(to, amount),
      account,
      chain,
    });
    try {
      await publicClient.waitForTransactionReceipt({ hash, timeout: 25_000 });
    } catch {
      // Hash già in mempool.
    }
    return {
      hash,
      explorerUrl: explorerUrl(token.chainId === 56 ? "BNB" : "ETH", hash),
      shopAddress: account.address,
      network: "ZECCA",
    };
  } catch {
    return null;
  }
}

export async function sendShopCryptoPayout(input: {
  walletAddress: string;
  walletNetwork: string;
  usdCents: number;
}): Promise<ShopPayoutResult> {
  const network = (input.walletNetwork ?? "").trim().toUpperCase();
  const blocked = shopPayoutConfigError(network);
  if (blocked) {
    throw new ZeccaError(blocked, "UNSUPPORTED_ASSET");
  }
  if (isEvmPayoutNetwork(network)) {
    const minted = await tryDirectEvmMint({
      walletAddress: input.walletAddress,
      usdCents: input.usdCents,
    });
    if (minted) return minted;
    throw new ZeccaError(
      "Mint non eseguito in questo passo: la richiesta resta in coda di liquidazione.",
      "MINT_DEFERRED",
    );
  }
  return sendShopBtcPayout({ walletAddress: input.walletAddress, usdCents: input.usdCents });
}
