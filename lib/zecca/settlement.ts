import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { explorerUrl, isZeccaLedgerBankRef } from "@/lib/receipt";
import { formatCashoutValue, formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { walletNetworkLabel } from "@/lib/wallet";
import { parseFiatCurrency } from "@/lib/zecca/fiat";
import { housePayoutByIban, HOUSE_PAYOUT_ACCOUNTS } from "@/lib/zecca/house-accounts";
import { proprietaryTokenConfig } from "@/lib/zecca/token-mint";
import { shopFiatBalances } from "@/lib/zecca/convert";
import { getShopNetworkVault } from "@/lib/zecca/shop-vault";
import { buildPain001Document, buildPaymentCsv, sepaDebtorBlocker, sepaDebtorConfig } from "@/lib/zecca/pain001";
import { wiseDispatchBlocker, wiseApiConfig } from "@/lib/zecca/wise-dispatch";

const QUEUED_RECEIPT_KIND = "QUEUED_FOR_SETTLEMENT";

export type SettlementPhase = "RICEVUTA_TESORERIA" | "FONDI_TRASMESSI";

export type SettlementLine = {
  id: string;
  rail: "IBAN" | "WALLET";
  asset: string;
  amountLabel: string;
  destination: string;
  destinationDetail: string;
  phase: SettlementPhase;
  status: string;
  receiptKind: string | null;
  bookRef: string | null;
  bankOrChainRef: string | null;
  explorerUrl: string | null;
  blocker: string | null;
  payoutKind: string;
  currency: string;
  walletNetwork: string | null;
  walletAddress: string | null;
  iban: string | null;
  ibanHolder: string | null;
  eurCents: number;
  usdCents: number;
  chfCents: number;
};

export type SettlementBlocker = {
  code: string;
  message: string;
};

export function settlementPhase(row: {
  status: string;
  receiptKind: string | null;
  receiptRef: string | null;
  payoutKind: string;
}): SettlementPhase {
  if (row.status !== "PAID") return "RICEVUTA_TESORERIA";
  if (row.payoutKind === "WALLET" && row.receiptKind === "TX_HASH" && row.receiptRef) {
    return "FONDI_TRASMESSI";
  }
  if (
    row.payoutKind === "IBAN" &&
    row.receiptKind === "BANK_REF" &&
    row.receiptRef &&
    !isZeccaLedgerBankRef(row.receiptRef)
  ) {
    return "FONDI_TRASMESSI";
  }
  return "RICEVUTA_TESORERIA";
}

export function phaseLabel(phase: SettlementPhase) {
  return phase === "FONDI_TRASMESSI" ? "Fondi trasmessi / ricevuti" : "Ricevuta tesoreria (libro)";
}

function lineBlocker(row: {
  payoutKind: string;
  currency: string;
  walletNetwork: string | null;
  status: string;
  receiptKind: string | null;
  receiptRef: string | null;
}): string | null {
  if (row.status === "PAID" && settlementPhase(row) === "FONDI_TRASMESSI") return null;
  if (row.payoutKind === "IBAN") {
    const currency = parseFiatCurrency(row.currency);
    if (currency === "EUR") return sepaDebtorBlocker();
    return wiseDispatchBlocker();
  }
  const net = (row.walletNetwork ?? "").toUpperCase();
  if (net === "BTC") {
    return "Nessun tx_hash Mempool. Bitcoin non si conia: serve UTXO sul wallet operativo o un gateway di liquidità. Ritenta l’uscita on-chain dopo il finanziamento.";
  }
  if (net === "ETH" || net === "BNB") {
    return `Nessun tx_hash su ${net === "BNB" ? "BscScan" : "Etherscan"}. ${net} nativo non si conia da un libro crediti. Serve saldo e gas sul wallet negozio, oppure ZECCA_TOKEN_ADDRESS (token Zecca, non ether/BNB).`;
  }
  if (net === "USDT" || net === "USDC") {
    return `Nessun tx_hash ${net}. Tether e Circle non rispondono a questo libro. Serve saldo ERC-20 sul wallet negozio; un mint on-demand emetterebbe solo il token proprietario Zecca.`;
  }
  return "Liquidazione on-chain non eseguita: manca cassa di rete o contratto di mint.";
}

export function classifyCashout(row: {
  id: string;
  status: string;
  payoutKind: string;
  currency: string;
  eurCents: number;
  usdCents: number;
  chfCents: number;
  iban: string | null;
  ibanHolder: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  receiptKind: string | null;
  receiptRef: string | null;
}): SettlementLine {
  const rail = row.payoutKind === "WALLET" ? "WALLET" : "IBAN";
  const phase = settlementPhase(row);
  const zeccaRef =
    row.receiptKind === QUEUED_RECEIPT_KIND || isZeccaLedgerBankRef(row.receiptRef ?? "")
      ? row.receiptRef
      : null;
  const realRef = phase === "FONDI_TRASMESSI" ? row.receiptRef : null;
  const asset =
    rail === "WALLET" ? (row.walletNetwork ?? "CRYPTO").toUpperCase() : parseFiatCurrency(row.currency);
  const amountLabel =
    rail === "WALLET"
      ? `${formatFiatFromCents(row.usdCents, "USD")} in ${asset}`
      : formatCashoutValue({
          currency: row.currency,
          eurCents: row.eurCents,
          usdCents: row.usdCents,
          chfCents: row.chfCents,
        });
  const house = housePayoutByIban(row.iban, row.currency);
  const destination =
    rail === "WALLET"
      ? `${walletNetworkLabel(row.walletNetwork)} ${row.walletAddress ?? ""}`.trim()
      : `${row.ibanHolder ?? ""} · ${house ? house.bank : "IBAN"} ${row.iban ? formatIbanDisplay(row.iban) : ""}`.trim();
  const destinationDetail =
    rail === "WALLET"
      ? row.walletNetwork === "BTC"
        ? "Bitcoin · Mempool"
        : row.walletNetwork === "BNB"
          ? "BNB Smart Chain · BscScan"
          : "Ethereum · Etherscan"
      : house
        ? `${house.bank} · ${house.holder}`
        : "IBAN";

  return {
    id: row.id,
    rail,
    asset,
    amountLabel,
    destination,
    destinationDetail,
    phase,
    status: row.status,
    receiptKind: row.receiptKind,
    bookRef: zeccaRef,
    bankOrChainRef: realRef,
    explorerUrl:
      phase === "FONDI_TRASMESSI" && row.receiptKind === "TX_HASH" && row.receiptRef
        ? explorerUrl(row.walletNetwork, row.receiptRef)
        : null,
    blocker: phase === "FONDI_TRASMESSI" ? null : lineBlocker(row),
    payoutKind: row.payoutKind,
    currency: row.currency,
    walletNetwork: row.walletNetwork,
    walletAddress: row.walletAddress,
    iban: row.iban,
    ibanHolder: row.ibanHolder,
    eurCents: row.eurCents,
    usdCents: row.usdCents,
    chfCents: row.chfCents,
  };
}

export async function listSettlementLines(db: PrismaClient = defaultPrisma): Promise<SettlementLine[]> {
  const rows = await db.cashoutRequest.findMany({
    where: { status: { in: ["QUEUED", "PAID", "PENDING"] } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return rows.map(classifyCashout);
}

export async function settlementBlockers(): Promise<SettlementBlocker[]> {
  const vault = await getShopNetworkVault();
  const mint = proprietaryTokenConfig();
  const items: SettlementBlocker[] = [];
  const sepa = sepaDebtorBlocker();
  if (sepa) items.push({ code: "SEPA_DEBTOR", message: sepa });
  const wise = wiseDispatchBlocker();
  if (wise) items.push({ code: "WISE_API", message: wise });
  if (!mint) {
    items.push({
      code: "NO_MINT_CONTRACT",
      message:
        "ZECCA_TOKEN_ADDRESS assente. USDT, USDC, ETH e BNB non si coniano da un libro crediti. Un mint on-demand emetterebbe solo un token proprietario Zecca, non Tether né ether.",
    });
  }
  const empty = vault.assets.filter((asset) => !asset.hasFunds);
  if (empty.length) {
    items.push({
      code: "VAULT_EMPTY",
      message: `Cassa di rete a zero su ${empty.map((a) => a.id).join(", ")}. Senza UTXO/gas/token sul wallet operativo non esiste tx_hash Etherscan, BscScan o Mempool.`,
    });
  }
  return items;
}

export async function buildSettlementDesk(db: PrismaClient = defaultPrisma) {
  const [lines, shop, vault, blockers] = await Promise.all([
    listSettlementLines(db),
    shopFiatBalances(db),
    getShopNetworkVault(),
    settlementBlockers(),
  ]);
  const open = lines.filter((line) => line.phase === "RICEVUTA_TESORERIA" && line.status !== "PENDING");
  const transmitted = lines.filter((line) => line.phase === "FONDI_TRASMESSI");
  const fiatQueued = open.filter((line) => line.rail === "IBAN");
  const cryptoQueued = open.filter((line) => line.rail === "WALLET");
  return {
    lines,
    open,
    transmitted,
    fiatQueued,
    cryptoQueued,
    shop,
    vault,
    blockers,
    rails: {
      unicredit: HOUSE_PAYOUT_ACCOUNTS.find((a) => a.id === "unicredit") ?? null,
      wise: HOUSE_PAYOUT_ACCOUNTS.find((a) => a.id === "wise") ?? null,
      sepaDebtor: sepaDebtorConfig(),
      wiseApi: Boolean(wiseApiConfig()),
      mint: proprietaryTokenConfig(),
    },
  };
}

export async function pain001ForQueuedIban(db: PrismaClient = defaultPrisma) {
  const debtor = sepaDebtorConfig();
  if (!debtor) {
    return { error: sepaDebtorBlocker() ?? "Conto ordinante SEPA assente." as string, xml: null as string | null };
  }
  const lines = (await listSettlementLines(db)).filter(
    (line) =>
      line.rail === "IBAN" &&
      line.phase === "RICEVUTA_TESORERIA" &&
      parseFiatCurrency(line.currency) === "EUR" &&
      line.iban &&
      line.ibanHolder,
  );
  if (lines.length === 0) {
    return { error: "Nessun bonifico EUR in coda di liquidazione.", xml: null as string | null };
  }
  const xml = buildPain001Document({
    debtor,
    credits: lines.map((line) => ({
      endToEndId: (line.bookRef ?? `ZECCA/${line.id.slice(0, 8)}`).slice(0, 35),
      amountCents: line.eurCents,
      currency: "EUR",
      creditorName: line.ibanHolder ?? "Massimo Fornara",
      creditorIban: line.iban as string,
      remittance: `Zecca ${line.bookRef ?? line.id.slice(0, 8)}`,
    })),
  });
  return { error: null as string | null, xml };
}

export async function csvForSettlement(db: PrismaClient = defaultPrisma) {
  const lines = await listSettlementLines(db);
  return buildPaymentCsv(
    lines.map((line) => ({
      rail: line.rail,
      asset: line.asset,
      amountLabel: line.amountLabel,
      beneficiary: line.destination,
      ibanOrWallet: line.iban ? formatIbanDisplay(line.iban) : (line.walletAddress ?? ""),
      bookRef: line.bookRef ?? "",
      bankOrChainRef: line.bankOrChainRef ?? "",
      phase: line.phase,
    })),
  );
}
