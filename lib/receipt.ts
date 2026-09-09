import { walletNetworkLabel } from "@/lib/wallet";

export type ReceiptKind = "TX_HASH" | "BANK_REF";

export function normalizeReceipt(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export function explorerLinks(
  network: string | null | undefined,
  hash: string,
): { label: string; url: string }[] {
  const ref = normalizeReceipt(hash);
  if (!ref) return [];
  if (network === "BTC") {
    return [
      { label: "Mempool", url: `https://mempool.space/tx/${ref}` },
      { label: "Blockstream", url: `https://blockstream.info/tx/${ref}` },
    ];
  }
  if (network === "TRX") {
    return [{ label: "Tronscan", url: `https://tronscan.org/#/transaction/${ref}` }];
  }
  const path = ref.startsWith("0x") ? ref : `0x${ref}`;
  if (network === "BNB") {
    return [
      { label: "BscScan", url: `https://bscscan.com/tx/${path}` },
      { label: "Blockscout", url: `https://bsc.blockscout.com/tx/${path}` },
    ];
  }
  return [
    { label: "Etherscan", url: `https://etherscan.io/tx/${path}` },
    { label: "Blockscout", url: `https://eth.blockscout.com/tx/${path}` },
  ];
}

export function explorerUrl(network: string | null | undefined, hash: string): string | null {
  return explorerLinks(network, hash)[0]?.url ?? null;
}

export function explorerSearchLabel(network: string | null | undefined): string {
  const id = (network ?? "").trim().toUpperCase();
  if (id === "BTC") return "Cerca hash su Mempool / Blockstream";
  if (id === "BNB") return "Cerca hash su BscScan / Blockscout";
  if (id === "TRX") return "Cerca hash su Tronscan";
  return "Cerca hash su Etherscan / Blockscout";
}

export function isValidTxHash(raw: string, network: string | null | undefined): boolean {
  const hash = normalizeReceipt(raw);
  if (hash.length < 16 || hash.length > 128) return false;
  if (network === "ETH" || network === "USDT" || network === "USDC" || network === "BNB") {
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

/** Ricevuta interna Zecca: non è un movimento UniCredit/Wise. */
export function isZeccaLedgerBankRef(raw: string): boolean {
  return /^ZECCA\//i.test(raw.trim());
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
  if (isZeccaLedgerBankRef(ref)) {
    return {
      error:
        "ZECCA/… è il numero del libro mastro, non un CRO UniCredit o Wise. Incolla il riferimento del bonifico già disposto dalla banca.",
    };
  }
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
  if (kind === "QUEUED_FOR_SETTLEMENT") return "Ricevuta Zecca";
  if (kind === "BANK_REF") return "CRO / riferimento bonifico";
  return "Ricevuta";
}
