import { createHmac } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
import { sendShopBtcPayout, shopBtcAddress } from "@/lib/zecca/btc-payout";

export { shopBtcAddress };

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

export function shopPayoutConfigError(network: string | null | undefined): string | null {
  const id = (network ?? "").trim().toUpperCase();
  if (id === "TRX") {
    return "USDT su Tron non parte dalla cassa Bitcoin/EVM del negozio. Scegli BTC, ETH, USDT, USDC o BNB: i crediti si convertono e chi riceve non firma.";
  }
  if (!isShopSendableNetwork(id)) {
    return "Il negozio converte i crediti in BTC, ETH, USDT, USDC o BNB e crea l’hash sulla rete. Chi riceve non firma.";
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

function formatUnits(value: bigint, decimals: number, maxFrac = 6): string {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
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
  if (network === "BTC") {
    return sendShopBtcPayout({ walletAddress: input.walletAddress, usdCents: input.usdCents });
  }

  const asset = EVM_ASSETS[network];
  const key = shopEvmPrivateKey();
  if (!asset || !key) {
    throw new ZeccaError(
      "Il negozio non ha un wallet di rete da cui convertire i crediti in crypto.",
      "MISSING_SHOP_KEY",
    );
  }

  const to = normalizeWalletAddress(input.walletAddress) as Address;
  if (!isValidWalletAddress(to, network)) {
    throw new ZeccaError("Indirizzo di destinazione non valido.", "INVALID_WALLET");
  }

  const chain = chainFor(asset.chainId);
  const transport = http(rpcUrl(asset.chainId));
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const shopAddress = account.address;

  let hash: `0x${string}`;
  try {
    if (asset.native) {
      const ticker = network === "BNB" ? "BNB" : "ETH";
      const price = await usdSpotPrice(ticker);
      const value = nativeWeiFromUsdCents(input.usdCents, price, asset.decimals);
      const balance = await publicClient.getBalance({ address: shopAddress });
      if (balance < value) {
        throw new ZeccaError(
          `I crediti sono convertiti in circa ${formatUnits(value, asset.decimals)} ${ticker}, ma sulla rete il negozio (${shopAddress}) non ha ancora quella quantità più il gas. Senza quel saldo Etherscan non può avere un hash: i crediti del libro non sono ether. Dopo il carico, conferma di nuovo.`,
          "INSUFFICIENT_SHOP_FUNDS",
        );
      }
      hash = await walletClient.sendTransaction({ to, value, account, chain });
    } else {
      const token = asset.token!;
      const amount = tokenAmountFromUsdCents(input.usdCents, asset.decimals);
      const tokenBalance = (await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [shopAddress],
      })) as bigint;
      if (tokenBalance < amount) {
        throw new ZeccaError(
          `I crediti sono convertiti in ${formatUnits(amount, asset.decimals)} ${network}, ma sulla rete il negozio (${shopAddress}) non ha ancora quei token più ETH per il gas. Senza quel saldo non nasce l’hash su Etherscan. Dopo il carico, conferma di nuovo.`,
          "INSUFFICIENT_SHOP_FUNDS",
        );
      }
      const gasBal = await publicClient.getBalance({ address: shopAddress });
      if (gasBal === BigInt(0)) {
        throw new ZeccaError(
          `I crediti sono convertiti in ${network}, ma il negozio (${shopAddress}) non ha ETH per il gas. Senza gas la rete non crea l’hash.`,
          "INSUFFICIENT_SHOP_FUNDS",
        );
      }
      hash = await walletClient.sendTransaction({
        to: token,
        data: encodeErc20Transfer(to, amount),
        account,
        chain,
      });
    }
  } catch (error) {
    if (error instanceof ZeccaError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (/insufficient funds|exceeds the balance|exceeds balance/i.test(msg)) {
      throw new ZeccaError(
        `I crediti sono convertiti, ma sulla rete il negozio (${shopAddress}) non ha saldo sufficiente per creare l’hash. Chi riceve non deve firmare.`,
        "INSUFFICIENT_SHOP_FUNDS",
      );
    }
    throw new ZeccaError(
      `Conversione inviata alla rete non riuscita: ${msg}. Destinazione ${shopAddress}.`,
      "SHOP_SEND_FAILED",
    );
  }

  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 25_000,
    });
    if (receipt.status === "reverted") {
      throw new ZeccaError(
        `La transazione ${hash} è stata rifiutata dalla rete. Il prelievo resta aperto.`,
        "SHOP_SEND_FAILED",
      );
    }
  } catch (error) {
    if (error instanceof ZeccaError) throw error;
    // Hash già broadcast: in mempool arriva in pochi secondi anche se questa lambda non aspetta il blocco.
  }

  return {
    hash,
    explorerUrl: explorerUrl(network, hash),
    shopAddress,
    network,
  };
}
