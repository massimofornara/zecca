import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { settleQueuedWalletCashouts, fulfillIbanFromRails } from "@/lib/zecca/cashout";
import { classifyCashout, type SettlementLine } from "@/lib/zecca/settlement";
import { getShopNetworkVault } from "@/lib/zecca/shop-vault";
import { mintContractForAsset } from "@/lib/zecca/token-mint";

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
    const settled = await fulfillIbanFromRails({
      cashoutId: row.id,
      actorId: input.actorId,
      db,
    });
    const line = lineFromCashout(settled);
    attempts.push({
      id: settled.id,
      rail: "IBAN",
      asset: line.asset,
      amountLabel: line.amountLabel,
      destination: line.destination,
      transmitted: line.phase === "FONDI_TRASMESSI",
      proof: line.bankOrChainRef,
      reason:
        line.phase === "FONDI_TRASMESSI"
          ? `TRN ${line.bankOrChainRef}`
          : line.blocker ?? "Binario fiat non collegato. Nessun CRO inventato.",
    });
  }

  return {
    attempts,
    onChainPaid: attempts.filter((item) => item.rail === "WALLET" && item.transmitted).length,
    stillQueued: attempts.filter((item) => !item.transmitted).length,
    vaultEmpty: vault.assets.filter((asset) => !asset.hasFunds).map((asset) => asset.id),
    mintConfigured: Boolean(mintContractForAsset("USDT") ?? mintContractForAsset("ZECCA")),
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
