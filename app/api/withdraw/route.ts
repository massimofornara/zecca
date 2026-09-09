import { NextResponse } from "next/server";
import { auth, requireUser } from "@/auth";
import { isZeccaError } from "@/lib/errors";
import { isValidWalletAddress, normalizeWalletAddress } from "@/lib/wallet";
import { isShopSendableNetwork } from "@/lib/evm-send";
import { quoteBookPayout, shopPayoutConfigError } from "@/lib/zecca/shop-payout";
import { creditsToUsdCents, getSettings } from "@/lib/zecca/settings";
import {
  QUEUED_RECEIPT_KIND,
  requestAndFulfillCashout,
} from "@/lib/zecca/cashout";
import { ensureHouseWalletCredits, isHouseEmail } from "@/lib/zecca/house";
import { userWallet } from "@/lib/zecca/ledger";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ status: "error", error: message, code }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return jsonError("Devi entrare per convertire i crediti.", 401);
  const url = new URL(request.url);
  const credits = Math.floor(Number(url.searchParams.get("credits") ?? 0));
  const network = String(url.searchParams.get("network") ?? "").trim().toUpperCase();
  const address = normalizeWalletAddress(String(url.searchParams.get("address") ?? ""));
  if (!Number.isFinite(credits) || credits <= 0) {
    return jsonError("Indica i crediti da convertire.", 400, "INVALID_AMOUNT");
  }
  const blocked = shopPayoutConfigError(network);
  if (blocked) return jsonError(blocked, 400, "UNSUPPORTED_ASSET");
  if (!isValidWalletAddress(address, network)) {
    return jsonError("Indirizzo di destinazione non valido.", 400, "INVALID_WALLET");
  }
  const settings = await getSettings();
  const usdCents = creditsToUsdCents(credits, settings.usdCentsPerCredit);
  const quote = quoteBookPayout({ walletAddress: address, walletNetwork: network, usdCents });
  return NextResponse.json({
    status: "success",
    credits,
    recipient: address,
    amountConverted: usdCents / 100,
    ...quote,
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return jsonError("Devi entrare per convertire i crediti.", 401);

  let body: {
    credits?: unknown;
    network?: unknown;
    address?: unknown;
    walletNetwork?: unknown;
    walletAddress?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("JSON non valido.", 400, "INVALID_JSON");
  }

  const credits = Math.floor(Number(body.credits ?? 0));
  const network = String(body.network ?? body.walletNetwork ?? "").trim().toUpperCase();
  const address = normalizeWalletAddress(String(body.address ?? body.walletAddress ?? ""));

  if (!Number.isFinite(credits) || credits <= 0) {
    return jsonError("Indica i crediti da convertire.", 400, "INVALID_AMOUNT");
  }
  if (!isShopSendableNetwork(network)) {
    return jsonError("Rete non supportata.", 400, "UNSUPPORTED_ASSET");
  }
  const blocked = shopPayoutConfigError(network);
  if (blocked) return jsonError(blocked, 400, "UNSUPPORTED_ASSET");
  if (!isValidWalletAddress(address, network)) {
    return jsonError("Indirizzo di destinazione non valido.", 400, "INVALID_WALLET");
  }

  try {
    if (isHouseEmail(user.email) || user.role === "ADMIN") {
      await ensureHouseWalletCredits({ userId: user.id, credits });
    } else {
      const wallet = await userWallet(user.id);
      if (wallet.available < credits) {
        return jsonError("Crediti insufficienti nel portafoglio.", 400, "INSUFFICIENT_CREDITS");
      }
    }

    const settled = await requestAndFulfillCashout({
      userId: user.id,
      role: user.role,
      credits,
      payoutKind: "WALLET",
      walletAddress: address,
      walletNetwork: network,
      shopSend: true,
    });

    const queued = settled.status === "QUEUED" || settled.receiptKind === QUEUED_RECEIPT_KIND;
    return NextResponse.json({
      status: "success",
      amountConverted: settled.usdCents / 100,
      recipient: settled.walletAddress ?? address,
      cashoutId: settled.id,
      settlement: queued ? "QUEUED_FOR_SETTLEMENT" : "COMPLETED",
      receiptId: settled.receiptRef ?? settled.id,
      receiptHash: settled.receiptHash,
      txHash: settled.receiptKind === "TX_HASH" ? settled.receiptRef : null,
    });
  } catch (error) {
    const message = isZeccaError(error) ? error.message : "Prelievo non riuscito.";
    const code = isZeccaError(error) ? error.code : "ZECCA";
    const status =
      code === "INVALID_WALLET" ||
      code === "INVALID_CHECKSUM" ||
      code === "INVALID_AMOUNT" ||
      code === "UNSUPPORTED_ASSET" ||
      code === "WITHDRAW_NOT_WHITELISTED" ||
      code === "WITHDRAW_OVER_TX_CAP" ||
      code === "WITHDRAW_RATE_LIMIT" ||
      code === "WITHDRAW_BELOW_MINIMUM" ||
      code === "WITHDRAW_DAILY_CAP" ||
      code === "INSUFFICIENT_CREDITS"
        ? 400
        : 500;
    return jsonError(message, status, code);
  }
}
