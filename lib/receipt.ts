import { walletNetworkLabel } from "@/lib/wallet";

export type ReceiptKind = "TX_HASH" | "BANK_REF";

export function normalizeReceipt(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export function explorerUrl(network: string | null | undefined, hash: string): string | null {
  const ref = normalizeReceipt(hash);
  if (!ref) return null;
  if (network === "BTC") return `https://mempool.space/tx/${ref}`;
  if (network === "TRX") return `https://tronscan.org/#/transaction/${ref}`;
  if (network === "ETH" || network === "USDT" || network === "USDC") {
    const path = ref.startsWith("0x") ? ref : `0x${ref}`;
    return `https://etherscan.io/tx/${path}`;
  }
  return null;
}

export function isValidTxHash(raw: string, network: string | null | undefined): boolean {
  const hash = normalizeReceipt(raw);
  if (hash.length < 16 || hash.length > 128) return false;
  if (network === "ETH" || network === "USDT" || network === "USDC") {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  }
  if (network === "BTC" || network === "TRX") {
    return /^[a-fA-F0-9]{64}$/.test(hash);
  }
  return /^[0-9a-zA-Z:_-]{16,128}$/.test(hash);
}

export function isValidBankRef(raw: string): boolean {
  const ref = raw.trim();
  return /^[0-9A-Za-z./ -]{6,64}$/.test(ref);
}

export function parsePayoutReceipt(input: {
  payoutKind: string;
  walletNetwork?: string | null;
  receipt: string;
}): { kind: ReceiptKind; ref: string; url: string | null } | { error: string } {
  if (input.payoutKind === "WALLET") {
    const ref = normalizeReceipt(input.receipt);
    if (!isValidTxHash(ref, input.walletNetwork)) {
      return {
        error:
          "Incolla l’hash della transazione (la ricevuta sulla rete). Senza hash il prelievo crypto non è chiuso.",
      };
    }
    return {
      kind: "TX_HASH",
      ref,
      url: explorerUrl(input.walletNetwork, ref),
    };
  }
  const ref = input.receipt.trim();
  if (!isValidBankRef(ref)) {
    return {
      error:
        "Incolla il CRO o l’identificativo end-to-end del bonifico. Senza quel riferimento il prelievo non è chiuso.",
    };
  }
  return { kind: "BANK_REF", ref, url: null };
}

export function receiptLabel(kind: string | null | undefined, network?: string | null): string {
  if (kind === "TX_HASH") return `Hash ${walletNetworkLabel(network ?? "OTHER")}`;
  if (kind === "BANK_REF") return "CRO / riferimento bonifico";
  return "Ricevuta";
}
