import { createPublicClient, http, erc20Abi, formatEther, type Address } from "viem";
import { bsc, mainnet } from "viem/chains";
import { EVM_ASSETS } from "@/lib/evm-send";
import { shopBtcAddress, shopWalletAddress } from "@/lib/zecca/shop-payout";
import type { TreasuryCryptoAsset } from "@/lib/zecca/convert";

export type ShopVaultAsset = {
  id: TreasuryCryptoAsset;
  label: string;
  ticker: string;
  address: string | null;
  amountLabel: string;
  explorer: string | null;
  chainName: string;
  hasFunds: boolean;
};

export type ShopNetworkVault = {
  btcAddress: string | null;
  btcSats: number;
  btcLabel: string;
  btcExplorer: string | null;
  evmAddress: string | null;
  ethLabel: string;
  ethExplorer: string | null;
  assets: ShopVaultAsset[];
};

const ASSET_META: Record<
  TreasuryCryptoAsset,
  { label: string; ticker: string; chainName: string }
> = {
  BTC: { label: "Bitcoin", ticker: "BTC", chainName: "Bitcoin" },
  ETH: { label: "Ethereum", ticker: "ETH", chainName: "Ethereum" },
  USDT: { label: "USDT", ticker: "USDT", chainName: "Ethereum (ERC-20)" },
  USDC: { label: "USDC", ticker: "USDC", chainName: "Ethereum (ERC-20)" },
  BNB: { label: "BNB Smart Chain", ticker: "BNB", chainName: "BNB Smart Chain" },
};

function formatBtcFromSats(sats: number): string {
  if (!Number.isFinite(sats) || sats <= 0) return "0 BTC";
  const whole = Math.floor(sats / 1e8);
  const frac = String(sats % 1e8).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac} BTC` : `${whole} BTC`;
}

function formatToken(raw: bigint, decimals: number, ticker: string): string {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const amount = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  return `${amount} ${ticker}`;
}

function ethRpc() {
  return process.env.ZECCA_ETH_RPC_URL?.trim() || "https://ethereum.publicnode.com";
}

function bscRpc() {
  return process.env.ZECCA_BSC_RPC_URL?.trim() || "https://bsc-dataseed.binance.org";
}

function explorerFor(asset: TreasuryCryptoAsset, address: string): string {
  if (asset === "BTC") return `https://mempool.space/address/${address}`;
  if (asset === "BNB") return `https://bscscan.com/address/${address}`;
  return `https://etherscan.io/address/${address}`;
}

export async function getShopNetworkVault(): Promise<ShopNetworkVault> {
  const btcAddress = shopBtcAddress();
  const evmAddress = shopWalletAddress();
  let btcSats = 0;
  let ethWei = BigInt(0);
  let usdtRaw = BigInt(0);
  let usdcRaw = BigInt(0);
  let bnbWei = BigInt(0);

  const jobs: Promise<void>[] = [];
  if (btcAddress) {
    jobs.push(
      fetch(`https://mempool.space/api/address/${btcAddress}`, { signal: AbortSignal.timeout(8000) })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            json: {
              chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
              mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
            } | null,
          ) => {
            const chain = (json?.chain_stats?.funded_txo_sum ?? 0) - (json?.chain_stats?.spent_txo_sum ?? 0);
            const mem = (json?.mempool_stats?.funded_txo_sum ?? 0) - (json?.mempool_stats?.spent_txo_sum ?? 0);
            btcSats = Math.max(0, chain + mem);
          },
        )
        .catch(() => undefined),
    );
  }
  if (evmAddress) {
    const eth = createPublicClient({ chain: mainnet, transport: http(ethRpc()) });
    jobs.push(
      eth
        .getBalance({ address: evmAddress })
        .then((bal) => {
          ethWei = bal;
        })
        .catch(() => undefined),
    );
    jobs.push(
      eth
        .readContract({
          address: EVM_ASSETS.USDT.token as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [evmAddress],
        })
        .then((bal) => {
          usdtRaw = bal as bigint;
        })
        .catch(() => undefined),
    );
    jobs.push(
      eth
        .readContract({
          address: EVM_ASSETS.USDC.token as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [evmAddress],
        })
        .then((bal) => {
          usdcRaw = bal as bigint;
        })
        .catch(() => undefined),
    );
    jobs.push(
      createPublicClient({ chain: bsc, transport: http(bscRpc()) })
        .getBalance({ address: evmAddress })
        .then((bal) => {
          bnbWei = bal;
        })
        .catch(() => undefined),
    );
  }
  await Promise.all(jobs);

  const byId: Record<TreasuryCryptoAsset, { amountLabel: string; hasFunds: boolean; address: string | null }> = {
    BTC: {
      address: btcAddress,
      amountLabel: formatBtcFromSats(btcSats),
      hasFunds: btcSats > 0,
    },
    ETH: {
      address: evmAddress,
      amountLabel: `${formatEther(ethWei)} ETH`,
      hasFunds: ethWei > BigInt(0),
    },
    USDT: {
      address: evmAddress,
      amountLabel: formatToken(usdtRaw, 6, "USDT"),
      hasFunds: usdtRaw > BigInt(0),
    },
    USDC: {
      address: evmAddress,
      amountLabel: formatToken(usdcRaw, 6, "USDC"),
      hasFunds: usdcRaw > BigInt(0),
    },
    BNB: {
      address: evmAddress,
      amountLabel: `${formatEther(bnbWei)} BNB`,
      hasFunds: bnbWei > BigInt(0),
    },
  };

  const assets: ShopVaultAsset[] = (Object.keys(ASSET_META) as TreasuryCryptoAsset[]).map((id) => {
    const meta = ASSET_META[id];
    const row = byId[id];
    return {
      id,
      label: meta.label,
      ticker: meta.ticker,
      address: row.address,
      amountLabel: row.amountLabel,
      explorer: row.address ? explorerFor(id, row.address) : null,
      chainName: meta.chainName,
      hasFunds: row.hasFunds,
    };
  });

  return {
    btcAddress,
    btcSats,
    btcLabel: formatBtcFromSats(btcSats),
    btcExplorer: btcAddress ? explorerFor("BTC", btcAddress) : null,
    evmAddress,
    ethLabel: `${formatEther(ethWei)} ETH`,
    ethExplorer: evmAddress ? explorerFor("ETH", evmAddress) : null,
    assets,
  };
}
