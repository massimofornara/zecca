"use client";

import { useState } from "react";
import {
  EVM_ASSETS,
  chainIdHex,
  encodeErc20Transfer,
  nativeWeiFromUsdCents,
  toHex,
  tokenAmountFromUsdCents,
  usdSpotPrice,
} from "@/lib/evm-send";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function provider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const injected = (window as { ethereum?: EthereumProvider }).ethereum;
  return injected ?? null;
}

async function ensureChain(eth: EthereumProvider, chainId: number) {
  const hex = chainIdHex(chainId);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    if (chainId === 56) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.binance.org"],
            blockExplorerUrls: ["https://bscscan.com"],
          },
        ],
      });
      return;
    }
    throw error;
  }
}

export async function broadcastPayout(input: {
  network: string;
  to: string;
  usdCents: number;
}): Promise<string> {
  const asset = EVM_ASSETS[input.network];
  if (!asset) {
    throw new Error("Questa crypto non si invia da MetaMask. Usa Bitcoin o Tron dal wallet nativo, poi cerca l’hash.");
  }
  const eth = provider();
  if (!eth) {
    throw new Error("Apri MetaMask (o un wallet EVM). Zecca firma l’invio da lì: l’hash lo crea la rete su Etherscan o BscScan.");
  }
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const from = accounts[0];
  if (!from) throw new Error("Nessun account nel wallet.");
  await ensureChain(eth, asset.chainId);

  let hash: unknown;
  if (asset.native) {
    const ticker = input.network === "BNB" ? "BNB" : "ETH";
    const price = await usdSpotPrice(ticker);
    const value = nativeWeiFromUsdCents(input.usdCents, price, asset.decimals);
    hash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to: input.to, value: toHex(value) }],
    });
  } else if (asset.token) {
    const amount = tokenAmountFromUsdCents(input.usdCents, asset.decimals);
    hash = await eth.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: asset.token,
          data: encodeErc20Transfer(input.to, amount),
          value: "0x0",
        },
      ],
    });
  } else {
    throw new Error("Rete non supportata per l’invio.");
  }
  const tx = String(hash ?? "");
  if (!tx.startsWith("0x") || tx.length < 66) {
    throw new Error("Il wallet non ha restituito un hash di rete.");
  }
  return tx;
}

export function SendCryptoHashButton({
  walletAddress,
  walletNetwork,
  usdCents,
  disabled,
  onHash,
}: {
  walletAddress: string;
  walletNetwork: string;
  usdCents: number;
  disabled?: boolean;
  onHash: (hash: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = Boolean(EVM_ASSETS[walletNetwork]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const hash = await broadcastPayout({
        network: walletNetwork,
        to: walletAddress,
        usdCents,
      });
      onHash(hash);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Invio non riuscito. Controlla il wallet e il saldo.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Bitcoin e Tron non passano da MetaMask: invia dal wallet nativo, poi cerca l’hash sulla rete.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void send()}
        className="relative z-30 inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
      >
        {busy ? "Attendi il wallet…" : "Esegui invio e genera hash (MetaMask)"}
      </button>
      <p className="text-xs text-muted-foreground">
        Si apre il wallet: confermi quantità e destinazione. La rete crea l’hash visibile su Etherscan, BscScan o
        Blockscout; Zecca lo registra.
      </p>
    </div>
  );
}
