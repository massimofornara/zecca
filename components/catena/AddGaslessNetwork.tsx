"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type MetamaskParams = {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function browserRpc() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/rails/chain/rpc`;
}

function browserExplorer() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/catena`;
}

export function AddGaslessNetwork({
  params,
  token,
}: {
  params: MetamaskParams;
  token?: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    const ethereum = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    const rpc = browserRpc();
    const explorer = browserExplorer();
    const chainParams = {
      ...params,
      rpcUrls: [rpc],
      blockExplorerUrls: [explorer],
    };
    if (!ethereum) {
      setMessage(
        `MetaMask non è in questa finestra. Aggiungi a mano: chainId 22120, RPC ${rpc || "/api/rails/chain/rpc"}.`,
      );
      return;
    }
    try {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [chainParams],
      });
      if (token) {
        try {
          await ethereum.request({
            method: "wallet_watchAsset",
            params: {
              type: "ERC20",
              options: { address: token, symbol: "zUSD", decimals: 6 },
            },
          });
        } catch {
          /* l’utente può rifiutare il token */
        }
      }
      setMessage(`Rete proposta a MetaMask con RPC ${rpc}. Chain 22120, non Ethereum mainnet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "MetaMask ha rifiutato la rete.");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("zecca-mm-offered") === "1") return;
    sessionStorage.setItem("zecca-mm-offered", "1");
    void add();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <Button type="button" onClick={add}>
        Aggiungi Zecca Gasless a MetaMask
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
