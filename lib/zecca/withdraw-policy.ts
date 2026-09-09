import type { CashoutStatus, Prisma, PrismaClient } from "@prisma/client";
import { isAddress } from "viem";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { normalizeWalletAddress } from "@/lib/wallet";
import { getSettings } from "@/lib/zecca/settings";

/** Sentinel su CashoutRequest.receiptKind mentre il nodo sta firmando. Non è un hash di rete. */
export const WITHDRAW_BROADCASTING = "PENDING_BROADCAST";

export function isBroadcastLock(kind: string | null | undefined) {
  return kind === WITHDRAW_BROADCASTING || kind === "BROADCASTING";
}

const EVM_NETWORKS = new Set(["ETH", "USDT", "USDC", "BNB", "ZECCA"]);

function usdLabel(cents: number) {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "USD",
  });
}

export function isEvmWithdrawNetwork(network: string) {
  return EVM_NETWORKS.has(network.trim().toUpperCase());
}

export function normalizePolicyAddress(address: string, network: string) {
  const trimmed = normalizeWalletAddress(address);
  const id = network.trim().toUpperCase();
  if (isEvmWithdrawNetwork(id) || id === "BTC") return trimmed.toLowerCase();
  return trimmed;
}

/** Checksum EIP-55: minuscolo uniforme ok; mixed-case sbagliato viene rifiutato. */
export function assertEvmChecksum(address: string) {
  const trimmed = normalizeWalletAddress(address);
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new ZeccaError("Indirizzo EVM non valido.", "INVALID_WALLET");
  }
  if (!isAddress(trimmed, { strict: true })) {
    throw new ZeccaError(
      "Checksum EIP-55 non valido. Incolla l’indirizzo così come lo mostra MetaMask, Trust Wallet o l’exchange.",
      "INVALID_CHECKSUM",
    );
  }
}

export async function assertWithdrawPolicy(input: {
  address: string;
  network: string;
  usdCents: number;
  db?: PrismaClient;
  excludeCashoutId?: string;
}) {
  const db = input.db ?? defaultPrisma;
  const network = input.network.trim().toUpperCase();
  const address = normalizeWalletAddress(input.address);
  const usdCents = Math.max(0, Math.floor(input.usdCents));
  const settings = await getSettings(db);

  if (isEvmWithdrawNetwork(network)) {
    assertEvmChecksum(address);
  }

  if (settings.withdrawWhitelistEnforced) {
    const allowed = new Set(
      settings.withdrawWhitelist.map((item) => normalizePolicyAddress(item, network)),
    );
    if (!allowed.has(normalizePolicyAddress(address, network))) {
      throw new ZeccaError(
        "Questo indirizzo non è in whitelist. In Forgia puoi autorizzarlo o disattivare il blocco sulle destinazioni.",
        "WITHDRAW_NOT_WHITELISTED",
      );
    }
  }

  if (settings.withdrawMinUsdCents > 0 && usdCents < settings.withdrawMinUsdCents) {
    throw new ZeccaError(
      `Sotto la soglia minima di prelievo crypto (${usdLabel(settings.withdrawMinUsdCents)}).`,
      "WITHDRAW_BELOW_MINIMUM",
    );
  }

  if (usdCents > settings.withdrawMaxUsdCentsPerTx) {
    throw new ZeccaError(
      `Questo prelievo supera il massimale per singola uscita (${usdLabel(settings.withdrawMaxUsdCentsPerTx)}). Riduci l’importo o alza la soglia in Forgia.`,
      "WITHDRAW_OVER_TX_CAP",
    );
  }

  const sinceHour = new Date(Date.now() - 60 * 60 * 1000);
  const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const openStatuses: CashoutStatus[] = ["PENDING", "QUEUED", "PAID"];
  const openWallet: Prisma.CashoutRequestWhereInput = {
    payoutKind: "WALLET",
    status: { in: openStatuses },
    ...(input.excludeCashoutId ? { id: { not: input.excludeCashoutId } } : {}),
  };

  const hourlyCount = await db.cashoutRequest.count({
    where: { ...openWallet, createdAt: { gte: sinceHour } },
  });
  if (hourlyCount >= settings.withdrawMaxCountPerHour) {
    throw new ZeccaError(
      `Troppi prelievi crypto in un’ora (massimo ${settings.withdrawMaxCountPerHour}). Riprova più tardi.`,
      "WITHDRAW_RATE_LIMIT",
    );
  }

  const daily = await db.cashoutRequest.aggregate({
    where: { ...openWallet, createdAt: { gte: sinceDay } },
    _sum: { usdCents: true },
  });
  const usedToday = daily._sum?.usdCents ?? 0;
  if (usedToday + usdCents > settings.withdrawMaxUsdCentsPerDay) {
    throw new ZeccaError(
      `Il massimale giornaliero di prelievo crypto è ${usdLabel(settings.withdrawMaxUsdCentsPerDay)}. Questo invio lo supererebbe (${usdLabel(usedToday)} già impegnati).`,
      "WITHDRAW_DAILY_CAP",
    );
  }
}
