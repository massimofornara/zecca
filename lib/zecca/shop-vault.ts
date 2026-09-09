import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";
import { shopBtcAddress, shopWalletAddress } from "@/lib/zecca/shop-payout";

export type ShopNetworkVault = {
  btcAddress: string | null;
  btcSats: number;
  btcLabel: string;
  btcExplorer: string | null;
  evmAddress: string | null;
  ethLabel: string;
  ethExplorer: string | null;
};

function formatBtcFromSats(sats: number): string {
  if (!Number.isFinite(sats) || sats <= 0) return "0 BTC";
  const whole = Math.floor(sats / 1e8);
  const frac = String(sats % 1e8).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac} BTC` : `${whole} BTC`;
}

export async function getShopNetworkVault(): Promise<ShopNetworkVault> {
  const btcAddress = shopBtcAddress();
  const evmAddress = shopWalletAddress();
  let btcSats = 0;
  let ethWei = BigInt(0);

  const jobs: Promise<void>[] = [];
  if (btcAddress) {
    jobs.push(
      fetch(`https://mempool.space/api/address/${btcAddress}`, { signal: AbortSignal.timeout(8000) })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number }; mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number } } | null) => {
          const chain = (json?.chain_stats?.funded_txo_sum ?? 0) - (json?.chain_stats?.spent_txo_sum ?? 0);
          const mem = (json?.mempool_stats?.funded_txo_sum ?? 0) - (json?.mempool_stats?.spent_txo_sum ?? 0);
          btcSats = Math.max(0, chain + mem);
        })
        .catch(() => undefined),
    );
  }
  if (evmAddress) {
    jobs.push(
      createPublicClient({ chain: mainnet, transport: http("https://ethereum.publicnode.com") })
        .getBalance({ address: evmAddress })
        .then((bal) => {
          ethWei = bal;
        })
        .catch(() => undefined),
    );
  }
  await Promise.all(jobs);

  return {
    btcAddress,
    btcSats,
    btcLabel: formatBtcFromSats(btcSats),
    btcExplorer: btcAddress ? `https://mempool.space/address/${btcAddress}` : null,
    evmAddress,
    ethLabel: `${formatEther(ethWei)} ETH`,
    ethExplorer: evmAddress ? `https://etherscan.io/address/${evmAddress}` : null,
  };
}
