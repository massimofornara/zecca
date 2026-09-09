import { publicOrigin } from "@/lib/public-url";
import { isGatewayReceiptRef } from "@/lib/settlement/gateway-ref";
import { walletNetworkLabel } from "@/lib/wallet";

export function catenaTxUrl(hash: string) {
  const ref = normalizeReceipt(hash);
  const path = ref.startsWith("0x") ? ref : `0x${ref}`;
  const origin = publicOrigin() || `http://127.0.0.1:${process.env.PORT ?? "4731"}`;
  return `${origin}/catena/tx/${path}`;
}

export type ReceiptKind = "TX_HASH" | "BANK_REF";

export function normalizeReceipt(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

const PRODUCTION_GASLESS_HASHES = new Set([
  "0xca584a225287196c77f4368dc6bc9e8c92190dfeb49e476d9e470a4f2db21d21",
  "0xd49eafa08b2a878508d1e8f0ebe997301719ee8170a000c3d07bba9ab82c664c",
  "0xd5d482dddc423e0af6de627463145d84f9851978a5532da5387d84ef2e501cb4",
  "0x35216ad2114fd8a0143ad00aff443af0b3d926d7af049fecb573096034e451bd",
]);

export function isZeccaGaslessExplorerHash(
  hash: string | null | undefined,
  network?: string | null,
  receiptUrl?: string | null,
) {
  if (network === "ZECCA") return true;
  if ((receiptUrl ?? "").includes("/catena/tx")) return true;
  const ref = normalizeReceipt(hash ?? "").toLowerCase();
  return PRODUCTION_GASLESS_HASHES.has(ref);
}

export function explorerLinks(
  network: string | null | undefined,
  hash: string,
  receiptUrl?: string | null,
): { label: string; url: string }[] {
  const ref = normalizeReceipt(hash);
  if (!ref) return [];
  if (isZeccaGaslessExplorerHash(ref, network, receiptUrl)) {
    const path = ref.startsWith("0x") ? ref : `0x${ref}`;
    return [{ label: "Catena Zecca", url: catenaTxUrl(path) }];
  }
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
  if (network === "ZECCA") {
    return [{ label: "Catena Zecca", url: catenaTxUrl(path) }];
  }
  if (network === "BNB") {
    return [
      { label: "BscScan", url: `https://bscscan.com/tx/${path}` },
      { label: "Blockscout", url: `https://bsc.blockscout.com/tx/${path}` },
    ];
  }
  if (network === "USDC" || network === "BASE" || network === "USDC_BASE") {
    return [{ label: "BaseScan", url: `https://basescan.org/tx/${path}` }];
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
  if (id === "ZECCA") return "Cerca hash su /catena (Zecca Gasless, non Etherscan)";
  return "Cerca hash su Etherscan / Blockscout";
}

export function isValidTxHash(raw: string, network: string | null | undefined): boolean {
  const hash = normalizeReceipt(raw);
  if (hash.length < 16 || hash.length > 128) return false;
  if (
    network === "ETH" ||
    network === "USDT" ||
    network === "USDC" ||
    network === "BNB" ||
    network === "ZECCA"
  ) {
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
  if (isZeccaLedgerBankRef(ref) || isGatewayReceiptRef(ref) || /^DISPOTO\//i.test(ref)) {
    return {
      error:
        "ZECCA/…, DISPOTO/… o GW-/SEPA-… è la ricevuta del libro o un’attestazione operatore, non un CRO UniCredit o Wise. Incolla il riferimento del bonifico già disposto dalla banca.",
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
  if (kind === "GATEWAY_RECEIVED") return "Ricevuta di trasmissione gateway";
  if (kind === "PROVIDER_REF") return "Riferimento provider";
  if (kind === "READY_FOR_SIGNATURE") return "pain.001 READY_FOR_SIGNATURE";
  if (kind === "AUTHORIZED_PENDING_GATEWAY" || kind === "QUEUED_FOR_SETTLEMENT") {
    return "Istruzione AUTHORIZED_PENDING_GATEWAY";
  }
  if (kind === "SEPA_DISPOSED") return "Bonifico disposto (attestazione operatore, non CRO)";
  if (kind === "CIRCLE_TRANSFER") return "ID trasferimento Circle (USDC su Base)";
  if (kind === "BANK_REF") return "CRO / riferimento bonifico";
  return "Ricevuta";
}
