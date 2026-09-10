import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import {
  CIRCLE_SHOP_SCA_ADDRESS,
  circleConfigured,
  fetchCircleUsdcBalance,
} from "@/lib/settlement/circle";
import { isUsdcCashoutNetwork } from "@/lib/settlement/circle-ref";
import { shopCryptoBalances } from "@/lib/zecca/convert";
import {
  formatUsdcCents,
  maxUsdcNetSendable,
  quoteUsdcWithdrawFee,
  reservedUsdCentsForUsdcCashout,
  type UsdcWithdrawQuote,
} from "@/lib/zecca/forge-fees";
import { getSettings } from "@/lib/zecca/settings";

export type UsdcCassaSnapshot = {
  configured: boolean;
  bookCredits: number;
  bookUsdCents: number;
  bookLabel: string;
  chainUsdCents: number | null;
  chainLabel: string;
  chainError: string | null;
  withdrawableUsdCents: number;
  withdrawableGrossUsdCents: number;
  shortfallUsdCents: number;
  shopAddress: string;
  feeFlatUsdCents: number;
  feeBps: number;
  feeQuote: UsdcWithdrawQuote;
};

function usdLabel(cents: number) {
  return formatUsdcCents(cents);
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
    select: {
      id: true,
      usdCents: true,
      usdcNetCents: true,
      walletNetwork: true,
      payoutKind: true,
      status: true,
    },
  });
  const counted =
    row &&
    row.payoutKind === "WALLET" &&
    ["PENDING", "QUEUED", "PAID"].includes(row.status) &&
    isUsdcCashoutNetwork(row.walletNetwork);
  const reservedHere = counted ? reservedUsdCentsForUsdcCashout(row) : 0;
  const otherReserved = book.reservedUsdCents - reservedHere;
  return Math.max(0, book.usdCents - otherReserved);
}

export async function getUsdcCassaSnapshot(input?: {
  db?: PrismaClient;
  fetchImpl?: typeof fetch;
}): Promise<UsdcCassaSnapshot> {
  const db = input?.db ?? defaultPrisma;
  const [books, settings] = await Promise.all([shopCryptoBalances(db), getSettings(db)]);
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
  const feeSettings = {
    usdcWithdrawFeeFlatCents: settings.usdcWithdrawFeeFlatCents,
    usdcWithdrawFeeBps: settings.usdcWithdrawFeeBps,
  };
  const feeQuote =
    chainUsdCents == null
      ? quoteUsdcWithdrawFee(0, feeSettings)
      : maxUsdcNetSendable(bookUsdCents, chainUsdCents, feeSettings);
  const withdrawableUsdCents = feeQuote.netUsdCents;
  const withdrawableGrossUsdCents = feeQuote.grossUsdCents;
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
    withdrawableGrossUsdCents,
    shortfallUsdCents,
    shopAddress: process.env.CIRCLE_WALLET_ADDRESS?.trim() || CIRCLE_SHOP_SCA_ADDRESS,
    feeFlatUsdCents: settings.usdcWithdrawFeeFlatCents,
    feeBps: settings.usdcWithdrawFeeBps,
    feeQuote,
  };
}

export async function assertUsdcLiquidity(input: {
  usdCents: number;
  netUsdCents?: number;
  feeUsdCents?: number;
  cashoutId?: string;
  db?: PrismaClient;
  fetchImpl?: typeof fetch;
}) {
  const settings = await getSettings(input.db);
  const quoted = quoteUsdcWithdrawFee(input.usdCents, settings);
  const net = input.netUsdCents != null ? Math.max(0, Math.floor(input.netUsdCents)) : quoted.netUsdCents;
  const fee = input.feeUsdCents != null ? Math.max(0, Math.floor(input.feeUsdCents)) : quoted.feeUsdCents;
  const gross = Math.max(0, Math.floor(input.usdCents));
  if (net <= 0) {
    throw new ZeccaError(
      "La commissione di prelievo USDC assorbe l’intero importo. Alza l’importo o riduci flat/% in Forgia.",
      "USDC_FEE_CONSUMES_AMOUNT",
      input.cashoutId,
    );
  }
  const bookUsdCents = await usdcBookAvailableUsdCents({
    db: input.db,
    excludeCashoutId: input.cashoutId,
  });
  if (net > bookUsdCents) {
    throw new ZeccaError(
      `Cassa USDC di libro insufficiente per il netto (${formatUsdcCents(bookUsdCents)} disponibili, ne servono ${formatUsdcCents(net)}). Converti crediti in USDC a libro e deposita USDC vero sul wallet Circle. La richiesta resta aperta.`,
      "USDC_BOOK_SHORT",
      input.cashoutId,
    );
  }
  const live = await fetchCircleUsdcBalance(input.fetchImpl);
  if (!live) {
    throw new ZeccaError("Wallet negozio non configurato.", "CIRCLE_NOT_CONFIGURED", input.cashoutId);
  }
  const chainCap = Math.max(0, live.usdCents - fee);
  if (net > chainCap) {
    throw new ZeccaError(
      `Wallet Circle ha ${formatUsdcCents(live.usdCents)} su Base. Netto ${formatUsdcCents(net)} + commissione trattenuta ${formatUsdcCents(fee)} (lordo ${formatUsdcCents(gross)}) superano il saldo. Deposita la differenza sul SCA ${live.address} poi ritenta. La commissione resta nel SCA, non viene trasferita. La richiesta resta aperta.`,
      "USDC_CHAIN_SHORT",
      input.cashoutId,
    );
  }
}
