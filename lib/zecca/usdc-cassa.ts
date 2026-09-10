import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import {
  CIRCLE_SHOP_SCA_ADDRESS,
  circleConfigured,
  fetchCircleUsdcBalance,
} from "@/lib/settlement/circle";
import { shopCryptoBalances } from "@/lib/zecca/convert";

export type UsdcCassaSnapshot = {
  configured: boolean;
  bookCredits: number;
  bookUsdCents: number;
  bookLabel: string;
  chainUsdCents: number | null;
  chainLabel: string;
  chainError: string | null;
  withdrawableUsdCents: number;
  shortfallUsdCents: number;
  shopAddress: string;
};

function usdLabel(cents: number) {
  return `${(Math.max(0, cents) / 100).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
}

export async function usdcBookAvailableUsdCents(input: {
  db?: PrismaClient;
  excludeCashoutId?: string;
}) {
  const db = input.db ?? defaultPrisma;
  const books = await shopCryptoBalances(db);
  const book = books.USDC;
  if (!input.excludeCashoutId) return Math.max(0, book.usdCents - book.reservedUsdCents);
  const row = await db.cashoutRequest.findUnique({
    where: { id: input.excludeCashoutId },
    select: { id: true, usdCents: true, walletNetwork: true, payoutKind: true, status: true },
  });
  const counted =
    row &&
    row.payoutKind === "WALLET" &&
    ["PENDING", "QUEUED", "PAID"].includes(row.status) &&
    (row.walletNetwork === "USDC" || row.walletNetwork === "USDC_BASE" || row.walletNetwork === "BASE");
  const otherReserved = book.reservedUsdCents - (counted ? row.usdCents : 0);
  return Math.max(0, book.usdCents - otherReserved);
}

export async function getUsdcCassaSnapshot(input?: {
  db?: PrismaClient;
  fetchImpl?: typeof fetch;
}): Promise<UsdcCassaSnapshot> {
  const db = input?.db ?? defaultPrisma;
  const books = await shopCryptoBalances(db);
  const book = books.USDC;
  const bookUsdCents = Math.max(0, book.remainingUsdCents);
  const configured = circleConfigured();
  let chainUsdCents: number | null = null;
  let chainError: string | null = null;
  if (!configured) {
    chainError = "Wallet Circle non configurato (mancano le env CIRCLE_*).";
  } else {
    try {
      const live = await fetchCircleUsdcBalance(input?.fetchImpl ?? fetch);
      chainUsdCents = live?.usdCents ?? 0;
    } catch {
      chainError = "Circle non ha risposto sul saldo USDC. Ritenta «Aggiorna saldo Circle».";
    }
  }
  const withdrawableUsdCents =
    chainUsdCents == null ? 0 : Math.max(0, Math.min(bookUsdCents, chainUsdCents));
  const shortfallUsdCents =
    chainUsdCents == null ? bookUsdCents : Math.max(0, bookUsdCents - chainUsdCents);
  return {
    configured,
    bookCredits: Math.max(0, book.remainingCredits),
    bookUsdCents,
    bookLabel: usdLabel(bookUsdCents),
    chainUsdCents,
    chainLabel: chainUsdCents == null ? "n.d." : usdLabel(chainUsdCents),
    chainError,
    withdrawableUsdCents,
    shortfallUsdCents,
    shopAddress: process.env.CIRCLE_WALLET_ADDRESS?.trim() || CIRCLE_SHOP_SCA_ADDRESS,
  };
}

export async function assertUsdcLiquidity(input: {
  usdCents: number;
  cashoutId?: string;
  db?: PrismaClient;
  fetchImpl?: typeof fetch;
}) {
  const need = Math.max(0, Math.floor(input.usdCents));
  if (need <= 0) {
    throw new ZeccaError("Importo USDC non valido.", "INVALID_AMOUNT");
  }
  const bookUsdCents = await usdcBookAvailableUsdCents({
    db: input.db,
    excludeCashoutId: input.cashoutId,
  });
  if (need > bookUsdCents) {
    throw new ZeccaError(
      `Cassa USDC di libro insufficiente (${(bookUsdCents / 100).toFixed(2)} USDC). Converti crediti in USDC a libro e deposita USDC vero sul wallet Circle. La richiesta resta aperta.`,
      "USDC_BOOK_SHORT",
      input.cashoutId,
    );
  }
  const live = await fetchCircleUsdcBalance(input.fetchImpl);
  if (!live) {
    throw new ZeccaError("Wallet negozio non configurato.", "CIRCLE_NOT_CONFIGURED", input.cashoutId);
  }
  if (need > live.usdCents) {
    throw new ZeccaError(
      `Wallet Circle ha ${(live.usdCents / 100).toFixed(2)} USDC su Base, ne servono ${(need / 100).toFixed(2)}. Deposita la differenza sul SCA ${live.address} poi ritenta. La richiesta resta aperta.`,
      "USDC_CHAIN_SHORT",
      input.cashoutId,
    );
  }
}
