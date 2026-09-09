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
import { isValidWalletAddress, normalizeWalletAddress, walletNetworkLabel } from "@/lib/wallet";

export type ShopPayoutResult = {
  hash: `0x${string}`;
  explorerUrl: string | null;
  shopAddress: Address;
  network: string;
};

export function shopEvmPrivateKey(): Hex | null {
  const raw = process.env.ZECCA_EVM_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) return null;
  return hex;
}

export function isShopEvmConfigured() {
  return shopEvmPrivateKey() !== null;
}

export function shopWalletAddress(): Address | null {
  const key = shopEvmPrivateKey();
  if (!key) return null;
  return privateKeyToAccount(key).address;
}

export function shopPayoutConfigError(network: string | null | undefined): string | null {
  const id = (network ?? "").trim().toUpperCase();
  if (id === "BTC" || id === "TRX") {
    return `${walletNetworkLabel(id)} non parte dal wallet EVM del negozio. Scegli ETH, USDT, USDC o BNB: MetaMask, Trust Wallet o l’exchange ricevono e non firmano.`;
  }
  if (!isShopSendableNetwork(id)) {
    return "Il negozio invia solo ETH, USDT, USDC (Ethereum) e BNB. Il wallet indicato riceve: non deve firmare né dare consensi.";
  }
  if (!isShopEvmConfigured()) {
    return "Manca ZECCA_EVM_PRIVATE_KEY sul server. Senza la chiave del negozio Zecca non può generare l’hash: il destinatario non deve firmare nulla. Imposta la chiave (un wallet fisso, non uno nuovo a ogni avvio) e carica ETH/USDT/USDC o BNB più il gas.";
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
    throw new ZeccaError(blocked, isShopEvmConfigured() ? "UNSUPPORTED_ASSET" : "MISSING_SHOP_KEY");
  }

  const asset = EVM_ASSETS[network];
  const key = shopEvmPrivateKey();
  if (!asset || !key) {
    throw new ZeccaError(
      "Manca la chiave del wallet del negozio (ZECCA_EVM_PRIVATE_KEY).",
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
          `Fondi insufficienti nel wallet del negozio ${shopAddress}. Servono circa ${formatUnits(value, asset.decimals)} ${ticker} più il gas. Carica questo indirizzo, poi conferma di nuovo: chi riceve non firma.`,
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
          `Token insufficienti nel wallet del negozio ${shopAddress}. Servono ${formatUnits(amount, asset.decimals)} ${network} (ERC-20 su Ethereum) più ETH per il gas. Carica questo indirizzo e riprova.`,
          "INSUFFICIENT_SHOP_FUNDS",
        );
      }
      const gasBal = await publicClient.getBalance({ address: shopAddress });
      if (gasBal === BigInt(0)) {
        throw new ZeccaError(
          `Il wallet del negozio ${shopAddress} non ha ETH per il gas. Carica un po’ di ETH su questo indirizzo, poi conferma di nuovo.`,
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
        `Fondi insufficienti nel wallet del negozio ${shopAddress}. Carica questo indirizzo (importo più gas) e riprova. Chi riceve non deve firmare.`,
        "INSUFFICIENT_SHOP_FUNDS",
      );
    }
    throw new ZeccaError(
      `Invio dal negozio non riuscito: ${msg}. Il destinatario non firma: controlla chiave, RPC e saldo di ${shopAddress}.`,
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
