import { createHmac } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { kmsSignerAccount, kmsSignerAddress, withKmsAccount } from "@/lib/zecca/kms-signer";
import { bsc, mainnet } from "viem/chains";
import { ZeccaError } from "@/lib/errors";
import {
  EVM_ASSETS,
  encodeErc20Transfer,
  isShopSendableNetwork,
  nativeWeiFromUsdCents,
  tokenAmountFromUsdCents,
  usdSpotPrice,
} from "@/lib/evm-send";
import { explorerUrl } from "@/lib/receipt";
import { isValidWalletAddress, normalizeWalletAddress } from "@/lib/wallet";
import { sendShopBtcPayout, shopBtcAddress, type ShopCoverage } from "@/lib/zecca/btc-payout";
import { encodeProprietaryMint, mintContractForAsset, proprietaryMintAmount, proprietaryTokenConfig } from "@/lib/zecca/token-mint";
import { tryGaslessEvmMint } from "@/lib/zecca/gasless-chain";

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

/**
 * Materiale sealed per script di deploy. Non loggare, non mettere in JSON di API.
 * Il mint runtime passa da `withKmsAccount`.
 */
export function shopEvmPrivateKey(): Hex | null {
  const fromEnv = envShopPrivateKey();
  if (fromEnv) return fromEnv;
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  const digest = createHmac("sha256", secret).update("zecca-shop-evm-v1").digest("hex");
  return `0x${digest}` as Hex;
}

export function isShopEvmConfigured() {
  return kmsSignerAccount() !== null;
}

export function shopWalletAddress(): Address | null {
  return kmsSignerAddress();
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
  const mintReady = Boolean(mintContractForAsset(network) ?? proprietaryTokenConfig());
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
        ? "Conferma: i crediti si bruciano e, se il minter risponde in pochi secondi, il token arriva sul wallet."
        : "Conferma: i crediti si bruciano e la pipeline tenta l’invio in pochi secondi. Senza vault o gateway i fondi non arrivano."
      : "Conferma: i crediti si bruciano e il payout Bitcoin parte solo se c’è UTXO o un liquidity gateway. Altrimenti i fondi non arrivano.",
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
  asset?: string;
}): Promise<ShopPayoutResult | null> {
  const network = (input.asset ?? "ZECCA").trim().toUpperCase();
  const token = mintContractForAsset(network);
  const to = normalizeWalletAddress(input.walletAddress) as Address;
  if (!isValidWalletAddress(to, network === "BNB" ? "BNB" : "ETH")) return null;

  if (token) {
    const chain = chainFor(token.chainId);
    const transport = http(rpcUrl(token.chainId), { timeout: 8_000 });
    const amount = proprietaryMintAmount(input.usdCents, token.decimals);

    const minted = await withKmsAccount(async (account) => {
      const publicClient = createPublicClient({ chain, transport });
      const walletClient = createWalletClient({ account, chain, transport });
      try {
        const hash = await walletClient.sendTransaction({
          to: token.address,
          data: encodeProprietaryMint(to, amount),
          account,
          chain,
        });
        try {
          await publicClient.waitForTransactionReceipt({ hash, timeout: 4_000 });
        } catch {
          // Hash già in mempool.
        }
        return {
          hash,
          explorerUrl: explorerUrl(token.chainId === 56 ? "BNB" : "ETH", hash),
          shopAddress: account.address,
          network: token.ticker,
        };
      } catch {
        return null;
      }
    });
    if (minted) return minted;
  }

  if (network === "USDC") return null;

  const gasless = await tryGaslessEvmMint({
    walletAddress: to,
    usdCents: input.usdCents,
  });
  if (!gasless) return null;
  return {
    hash: gasless.hash,
    explorerUrl: gasless.explorerUrl,
    shopAddress: gasless.shopAddress,
    network: gasless.network,
  };
}

/**
 * Invio on-chain da cassa negozio (ETH/BNB nativi o USDT/USDC ERC-20).
 * Se manca gas o saldo, torna null: il chiamante accetta in coda.
 */
export async function tryDirectEvmTransfer(input: {
  walletAddress: string;
  walletNetwork: string;
  usdCents: number;
}): Promise<ShopPayoutResult | null> {
  const network = (input.walletNetwork ?? "").trim().toUpperCase();
  if (network === "USDC") return null;
  const spec = EVM_ASSETS[network];
  if (!spec) return null;

  const to = normalizeWalletAddress(input.walletAddress) as Address;
  if (!isValidWalletAddress(to, network)) return null;

  const chain = chainFor(spec.chainId);
  const transport = http(rpcUrl(spec.chainId), { timeout: 8_000 });

  return withKmsAccount(async (account) => {
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ account, chain, transport });

    try {
      let hash: Hex;
      if (spec.native) {
        const ticker = network === "BNB" ? "BNB" : "ETH";
        const price = await usdSpotPrice(ticker);
        const value = nativeWeiFromUsdCents(input.usdCents, price, spec.decimals);
        hash = await walletClient.sendTransaction({
          to,
          value,
          account,
          chain,
        });
      } else if (spec.token) {
        const amount = tokenAmountFromUsdCents(input.usdCents, spec.decimals);
        hash = await walletClient.sendTransaction({
          to: spec.token,
          data: encodeErc20Transfer(to, amount),
          account,
          chain,
        });
      } else {
        return null;
      }
      try {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 4_000 });
      } catch {
        /* hash già in mempool */
      }
      return {
        hash,
        explorerUrl: explorerUrl(network === "BNB" ? "BNB" : "ETH", hash),
        shopAddress: account.address,
        network,
      };
    } catch {
      return null;
    }
  });
}

export async function tryShopOnChainPayout(input: {
  walletAddress: string;
  walletNetwork: string;
  usdCents: number;
}): Promise<ShopPayoutResult | null> {
  const network = (input.walletNetwork ?? "").trim().toUpperCase();
  if (isEvmPayoutNetwork(network)) {
    const minted = await tryDirectEvmMint({
      walletAddress: input.walletAddress,
      usdCents: input.usdCents,
      asset: network,
    });
    if (minted) return minted;
    return tryDirectEvmTransfer({
      walletAddress: input.walletAddress,
      walletNetwork: network,
      usdCents: input.usdCents,
    });
  }
  if (network === "BTC") {
    try {
      return await sendShopBtcPayout({
        walletAddress: input.walletAddress,
        usdCents: input.usdCents,
      });
    } catch {
      return null;
    }
  }
  return null;
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
    const sent = await tryShopOnChainPayout({
      walletAddress: input.walletAddress,
      walletNetwork: network,
      usdCents: input.usdCents,
    });
    if (sent) return sent;
    throw new ZeccaError(
      "Invio on-chain non eseguito in questo passo: la richiesta resta in coda di liquidazione.",
      "PAYOUT_DEFERRED",
    );
  }
  return sendShopBtcPayout({ walletAddress: input.walletAddress, usdCents: input.usdCents });
}
