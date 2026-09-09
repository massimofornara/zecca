"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type MetamaskParams = {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export function AddGaslessNetwork({ params }: { params: MetamaskParams }) {
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> } })
      .ethereum;
    if (!ethereum) {
      setMessage("MetaMask non è in questa finestra. Aggiungi la rete a mano con chainId 22120.");
      return;
    }
    try {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [params],
      });
      setMessage("Rete Zecca Gasless proposta a MetaMask. Non è Ethereum.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "MetaMask ha rifiutato la rete.");
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={add}>
        Aggiungi Zecca Gasless a MetaMask
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
