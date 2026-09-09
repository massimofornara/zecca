import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { parseFiatCurrency } from "@/lib/zecca/fiat";
import { settleQueuedWalletCashouts } from "@/lib/zecca/cashout";
import { sepaDebtorBlocker } from "@/lib/zecca/pain001";
import { classifyCashout, type SettlementLine } from "@/lib/zecca/settlement";
import { tryWisePayout, wiseDispatchBlocker } from "@/lib/zecca/wise-dispatch";
import { getShopNetworkVault } from "@/lib/zecca/shop-vault";
import { proprietaryTokenConfig } from "@/lib/zecca/token-mint";

export type TransmitAttempt = {
  id: string;
  rail: "IBAN" | "WALLET";
  asset: string;
  amountLabel: string;
  destination: string;
  transmitted: boolean;
  proof: string | null;
  reason: string;
};

export type TransmitAllResult = {
  attempts: TransmitAttempt[];
  onChainPaid: number;
  stillQueued: number;
  vaultEmpty: string[];
  mintConfigured: boolean;
};

function lineFromCashout(row: Parameters<typeof classifyCashout>[0]): SettlementLine {
  return classifyCashout(row);
}

export async function transmitAllOpenSettlements(input: {
  actorId: string;
  db?: PrismaClient;
}): Promise<TransmitAllResult> {
  const db = input.db ?? defaultPrisma;
  const vault = await getShopNetworkVault();
  const cryptoRows = await settleQueuedWalletCashouts({
    actorId: input.actorId,
    db,
    limit: 50,
  });
  const ibanRows = await db.cashoutRequest.findMany({
    where: { status: "QUEUED", payoutKind: "IBAN" },
    orderBy: { createdAt: "asc" },
  });

  const attempts: TransmitAttempt[] = [];

  for (const row of cryptoRows) {
    const line = lineFromCashout(row);
    attempts.push({
      id: row.id,
      rail: "WALLET",
      asset: line.asset,
      amountLabel: line.amountLabel,
      destination: line.destination,
      transmitted: line.phase === "FONDI_TRASMESSI",
      proof: line.bankOrChainRef,
      reason:
        line.phase === "FONDI_TRASMESSI"
          ? `tx_hash ${line.bankOrChainRef}`
          : line.blocker ?? "Invio on-chain non eseguito. Nessun hash scritto.",
    });
  }

  for (const row of ibanRows) {
    const line = lineFromCashout(row);
    const currency = parseFiatCurrency(row.currency);
    if (currency === "EUR") {
      attempts.push({
        id: row.id,
        rail: "IBAN",
        asset: "EUR",
        amountLabel: line.amountLabel,
        destination: line.destination,
        transmitted: false,
        proof: null,
        reason: sepaDebtorBlocker() ?? "SEPA non disposto: manca il conto ordinante.",
      });
      continue;
    }
    const wise = await tryWisePayout({
      currency,
      amountCents: currency === "USD" ? row.usdCents : row.chfCents,
      iban: row.iban ?? "",
      holder: row.ibanHolder ?? "",
      reference: row.receiptRef ?? row.id,
    });
    if (wise?.ok) {
      attempts.push({
        id: row.id,
        rail: "IBAN",
        asset: currency,
        amountLabel: line.amountLabel,
        destination: line.destination,
        transmitted: true,
        proof: wise.transferId,
        reason: `Wise transfer ${wise.transferId}`,
      });
      continue;
    }
    attempts.push({
      id: row.id,
      rail: "IBAN",
      asset: currency,
      amountLabel: line.amountLabel,
      destination: line.destination,
      transmitted: false,
      proof: null,
      reason: wise?.message ?? wiseDispatchBlocker() ?? "Wise non ha preso in carico il pagamento.",
    });
  }

  return {
    attempts,
    onChainPaid: attempts.filter((item) => item.rail === "WALLET" && item.transmitted).length,
    stillQueued: attempts.filter((item) => !item.transmitted).length,
    vaultEmpty: vault.assets.filter((asset) => !asset.hasFunds).map((asset) => asset.id),
    mintConfigured: Boolean(proprietaryTokenConfig()),
  };
}

export function transmitAllSummary(result: TransmitAllResult) {
  const sent = result.attempts.filter((item) => item.transmitted).length;
  if (result.attempts.length === 0) {
    return "Nessuna linea aperta da trasmettere.";
  }
  if (sent === 0) {
    return `Tentativo su ${result.attempts.length} linee: 0 fondi trasmessi. Vault vuoto su ${result.vaultEmpty.join(", ") || "—"}. Nessun CRO e nessun tx_hash inventato.`;
  }
  return `Tentativo su ${result.attempts.length} linee: ${sent} con prova di rete o banca, ${result.stillQueued} ancora sul libro.`;
}
