import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { explorerUrl, isZeccaLedgerBankRef } from "@/lib/receipt";
import { formatCashoutValue, formatFiatFromCents } from "@/lib/format";
import { formatIbanDisplay } from "@/lib/iban";
import { walletNetworkLabel } from "@/lib/wallet";
import { parseFiatCurrency } from "@/lib/zecca/fiat";
import { housePayoutByIban, HOUSE_PAYOUT_ACCOUNTS } from "@/lib/zecca/house-accounts";
import { mintContractForAsset } from "@/lib/zecca/token-mint";
import { shopFiatBalances } from "@/lib/zecca/convert";
import { getShopNetworkVault } from "@/lib/zecca/shop-vault";
import { buildPain001Document, buildPaymentCsv, sepaDebtorBlocker, sepaDebtorConfig } from "@/lib/zecca/pain001";
import { wiseDispatchBlocker, wiseApiConfig } from "@/lib/zecca/wise-dispatch";
import { gaslessEnabled } from "@/lib/zecca/gasless-chain";
import { settlementProviderHealth } from "@/lib/settlement/pipeline";
import { sepaGatewayConfig } from "@/lib/settlement/gateways";
import { GATEWAY_RECEIVED_KIND, isGatewayReceiptRef } from "@/lib/settlement/gateway-ref";
import {
  AUTHORIZED_RECEIPT_KIND,
  READY_FOR_SIGNATURE_KIND,
  isAuthorizedReceiptKind,
} from "@/lib/zecca/authorization";

export type SettlementPhase =
  | "READY_FOR_SIGNATURE"
  | "AUTHORIZED_PENDING_GATEWAY"
  | "INVIATO_AL_PROVIDER"
  | "EXECUTED_AND_RECEIVED"
  | "FONDI_TRASMESSI"
  | "RICEVUTA_TESORERIA";

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

export function fundsAuthorized(row: {
  status?: string | null;
  receiptKind?: string | null;
  receiptRef?: string | null;
  payoutKind?: string | null;
}): boolean {
  const phase = settlementPhase({
    status: row.status ?? "",
    receiptKind: row.receiptKind ?? null,
    receiptRef: row.receiptRef ?? null,
    payoutKind: row.payoutKind ?? "",
  });
  return (
    phase === "FONDI_TRASMESSI" ||
    phase === "EXECUTED_AND_RECEIVED" ||
    phase === "AUTHORIZED_PENDING_GATEWAY" ||
    phase === "READY_FOR_SIGNATURE" ||
    phase === "INVIATO_AL_PROVIDER"
  );
}

export function fundsDelivered(row: {
  status?: string | null;
  receiptKind?: string | null;
  receiptRef?: string | null;
  payoutKind?: string | null;
}): boolean {
  const phase = settlementPhase({
    status: row.status ?? "",
    receiptKind: row.receiptKind ?? null,
    receiptRef: row.receiptRef ?? null,
    payoutKind: row.payoutKind ?? "",
  });
  return phase === "FONDI_TRASMESSI" || phase === "EXECUTED_AND_RECEIVED";
}

export function settlementPhase(row: {
  status: string;
  receiptKind: string | null;
  receiptRef: string | null;
  payoutKind: string;
}): SettlementPhase {
  if (row.status === "PAID") {
    if (row.receiptKind === GATEWAY_RECEIVED_KIND && isGatewayReceiptRef(row.receiptRef)) {
      return "EXECUTED_AND_RECEIVED";
    }
    if (row.payoutKind === "WALLET" && row.receiptKind === "TX_HASH" && row.receiptRef) {
      return "EXECUTED_AND_RECEIVED";
    }
    if (row.receiptKind === "CIRCLE_TRANSFER" && row.receiptRef) {
      return "EXECUTED_AND_RECEIVED";
    }
    if (row.receiptKind === "SEPA_DISPOSED" && row.receiptRef) {
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
  if (row.receiptKind === "PROVIDER_REF" && row.receiptRef) return "INVIATO_AL_PROVIDER";
  if (row.receiptKind === READY_FOR_SIGNATURE_KIND) return "READY_FOR_SIGNATURE";
  if (isAuthorizedReceiptKind(row.receiptKind)) return "AUTHORIZED_PENDING_GATEWAY";
  return "RICEVUTA_TESORERIA";
}

export function phaseLabel(phase: SettlementPhase) {
  if (phase === "FONDI_TRASMESSI" || phase === "EXECUTED_AND_RECEIVED") {
    return "EXECUTED AND RECEIVED";
  }
  if (phase === "INVIATO_AL_PROVIDER") return "Inviato al provider (in attesa di hash/TRN)";
  if (phase === "READY_FOR_SIGNATURE") return "READY_FOR_SIGNATURE · pain.001 ISO 20022";
  if (phase === "AUTHORIZED_PENDING_GATEWAY") return "AUTHORIZED_PENDING_GATEWAY";
  return "Ricevuta tesoreria (libro)";
}

function lineBlocker(row: {
  payoutKind: string;
  currency: string;
  walletNetwork: string | null;
  status: string;
  receiptKind: string | null;
  receiptRef: string | null;
}): string | null {
  if (row.status === "PAID" && (settlementPhase(row) === "FONDI_TRASMESSI" || settlementPhase(row) === "EXECUTED_AND_RECEIVED")) {
    return null;
  }
  if (row.receiptKind === "PROVIDER_REF") {
    return "Preso in carico dal provider. EXECUTED solo quando arriva tx_hash o TRN verificabile.";
  }
  if (row.payoutKind === "IBAN") {
    const currency = parseFiatCurrency(row.currency);
    if (currency === "EUR") {
      return sepaGatewayConfig()
        ? "Gateway SEPA collegato ma senza TRN su questa linea."
        : sepaDebtorBlocker();
    }
    return wiseDispatchBlocker();
  }
  const net = (row.walletNetwork ?? "").toUpperCase();
  if (net === "BTC") {
    return "Pipeline: mint non applicabile. Hot wallet o ZECCA_LIQUIDITY_URL. Senza UTXO/gateway niente hash Mempool.";
  }
  if (net === "ETH" || net === "BNB") {
    return `Pipeline: ${net} nativo via hot wallet o liquidity gateway, non via mint.`;
  }
  if (net === "USDC") {
    return "USDC su Base: CIRCLE_API_KEY + CIRCLE_WALLET_ID e wallet Circle finanziato. Senza env: Wallet negozio non configurato.";
  }
  if (net === "USDT") {
    return "Pipeline: mint sul contratto Zecca (MINTER_ROLE), non su Tether. Senza ZECCA_TOKEN_ADDRESS / ZECCA_MINT_USDT_ADDRESS niente hash.";
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
  receiptUrl?: string | null;
  adminNote?: string | null;
}): SettlementLine {
  const rail = row.payoutKind === "WALLET" ? "WALLET" : "IBAN";
  const phase = settlementPhase(row);
  const zeccaRef =
    row.receiptKind === AUTHORIZED_RECEIPT_KIND ||
    row.receiptKind === READY_FOR_SIGNATURE_KIND ||
    row.receiptKind === "QUEUED_FOR_SETTLEMENT" ||
    row.receiptKind === "PROVIDER_REF" ||
    row.receiptKind === GATEWAY_RECEIVED_KIND ||
    row.receiptKind === "SEPA_DISPOSED" ||
    isZeccaLedgerBankRef(row.receiptRef ?? "")
      ? row.receiptRef
      : null;
  const realRef =
    row.receiptKind === "SEPA_DISPOSED"
      ? null
      : phase === "FONDI_TRASMESSI" || phase === "EXECUTED_AND_RECEIVED"
        ? row.receiptRef
        : null;
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
  const gaslessProof =
    row.walletNetwork === "ZECCA" ||
    /zecca-gasless|\/catena/i.test(row.adminNote ?? "") ||
    (row.receiptUrl ?? "").includes("/catena/tx/");
  const destinationDetail =
    rail === "WALLET"
      ? row.walletNetwork === "BTC"
        ? "Bitcoin · Mempool"
        : gaslessProof
          ? "Zecca Gasless · /catena (non Etherscan)"
          : row.walletNetwork === "BNB"
            ? "BNB Smart Chain · BscScan"
            : row.walletNetwork === "USDC" || row.walletNetwork === "BASE"
              ? "USDC su Base · Circle / BaseScan"
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
      (phase === "FONDI_TRASMESSI" || phase === "EXECUTED_AND_RECEIVED") &&
      row.receiptKind === "TX_HASH" &&
      row.receiptRef
        ? row.receiptUrl ||
          (gaslessProof ? explorerUrl("ZECCA", row.receiptRef) : explorerUrl(row.walletNetwork, row.receiptRef))
        : phase === "EXECUTED_AND_RECEIVED" && row.receiptKind === GATEWAY_RECEIVED_KIND && row.receiptRef
          ? row.receiptUrl || `/ricevuta-gateway/${row.receiptRef}`
          : null,
    blocker: phase === "FONDI_TRASMESSI" || phase === "EXECUTED_AND_RECEIVED" ? null : lineBlocker(row),
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
  const mint = mintContractForAsset("USDT") ?? mintContractForAsset("ZECCA");
  const items: SettlementBlocker[] = [];
  for (const provider of settlementProviderHealth()) {
    if (!provider.ready && provider.id !== "hot-wallet") {
      items.push({ code: provider.id.toUpperCase(), message: provider.detail });
    }
  }
  if (!mint && !gaslessEnabled()) {
    items.push({
      code: "NO_MINT_CONTRACT",
      message:
        "Nessun contratto con MINTER_ROLE. Deploy di contracts/ZeccaToken.sol e ZECCA_TOKEN_ADDRESS, oppure usa Zecca Gasless. Non è Tether né ether.",
    });
  }
  const empty = vault.assets.filter((asset) => !asset.hasFunds);
  if (empty.length && !gaslessEnabled()) {
    items.push({
      code: "VAULT_EMPTY",
      message: `Hot wallet a zero su ${empty.map((a) => a.id).join(", ")}. I nativi passano al liquidity gateway se configurato; altrimenti restano in coda senza hash.`,
    });
  }
  return items;
}

export async function buildSettlementDesk(db: PrismaClient = defaultPrisma) {
  try {
    const { closeOpenBookSettlementsViaGateway } = await import("@/lib/zecca/cashout");
    await closeOpenBookSettlementsViaGateway({ db });
  } catch {
    /* gateway table assente al primo boot */
  }
  const [lines, shop, vault, blockers] = await Promise.all([
    listSettlementLines(db),
    shopFiatBalances(db),
    getShopNetworkVault(),
    settlementBlockers(),
  ]);
  const open = lines.filter(
    (line) =>
      line.phase !== "FONDI_TRASMESSI" &&
      line.phase !== "EXECUTED_AND_RECEIVED" &&
      line.status !== "PENDING",
  );
  const transmitted = lines.filter(
    (line) => line.phase === "FONDI_TRASMESSI" || line.phase === "EXECUTED_AND_RECEIVED",
  );
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
    providers: settlementProviderHealth(),
    rails: {
      unicredit: HOUSE_PAYOUT_ACCOUNTS.find((a) => a.id === "unicredit") ?? null,
      wise: HOUSE_PAYOUT_ACCOUNTS.find((a) => a.id === "wise") ?? null,
      sepaDebtor: sepaDebtorConfig(),
      wiseApi: Boolean(wiseApiConfig()),
      mint: mintContractForAsset("USDT") ?? mintContractForAsset("ZECCA"),
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
