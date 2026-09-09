"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { addToCart, clearCart, getCart, updateCartQuantity } from "@/lib/cart";
import { isZeccaError, publicErrorMessage } from "@/lib/errors";
import { purchaseCredits } from "@/lib/zecca/credits";
import { placeOrder } from "@/lib/zecca/shop";
import { parseShipping } from "@/lib/shipping";
import { requestAndFulfillCashout, requestCustomerCashout } from "@/lib/zecca/cashout";
import { shopPayoutConfigError } from "@/lib/zecca/shop-payout";
import { destinationInstruction } from "@/lib/payout";
import { proofFromPaidCashout } from "@/lib/cashout-proof";
import { rememberCashoutProof } from "@/lib/cashout-proof-store";
import { ensureHouseWalletCredits, isHouseEmail } from "@/lib/zecca/house";
import { housePayoutAccount, housePayoutForCurrency } from "@/lib/zecca/house-accounts";
import { parseFiatCurrency } from "@/lib/zecca/fiat";
import { isDemoPayEnabled } from "@/lib/stripe";
import { requestBonificoPurchase } from "@/lib/zecca/bank";
import { prisma } from "@/lib/db";

export async function addToCartAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  if (!productId) return;
  await addToCart(productId, Number.isFinite(quantity) ? quantity : 1);
  revalidatePath("/carrello");
  revalidatePath("/vetrina");
}

export async function updateCartAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  await updateCartQuantity(productId, quantity);
  revalidatePath("/carrello");
}

export async function requestBonificoAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!user) return { error: "Devi entrare per comprare crediti." };
  const credits = Number(formData.get("credits"));
  let purchaseId = "";
  try {
    const result = await requestBonificoPurchase({ userId: user.id, credits });
    purchaseId = result.purchase.id;
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Richiesta bonifico non riuscita." };
  }
  revalidatePath("/crediti");
  revalidatePath("/zecchiere/versamenti");
  redirect(`/crediti?versamento=${purchaseId}`);
}

export async function demoBuyCreditsAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const user = await requireUser();
  if (!user) return { error: "Devi entrare per comprare crediti." };
  if (!isDemoPayEnabled()) {
    return { error: "Il pagamento demo è spento. Usa Stripe per versare euro veri." };
  }
  const credits = Number(formData.get("credits"));
  try {
    const result = await purchaseCredits({
      userId: user.id,
      credits,
      method: "demo",
    });
    revalidatePath("/portafoglio");
    revalidatePath("/crediti");
    revalidatePath("/zecchiere");
    revalidatePath("/");
    return {
      ok: `Accreditati ${result.purchase.credits} cr. Hai versato ${(result.eurCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} in cassa (demo).`,
    };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Acquisto non riuscito." };
  }
}

export async function checkoutCartAction(
  _prev: { error?: string } | null,
  formData?: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!user) return { error: "Devi entrare per pagare in crediti." };
  const items = await getCart();
  const shipping = parseShipping(formData ?? new FormData());
  let orderId = "";
  try {
    const order = await placeOrder({ userId: user.id, items, shipping });
    orderId = order.id;
    await clearCart();
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Ordine non riuscito." };
  }
  revalidatePath("/portafoglio");
  revalidatePath("/ordini");
  revalidatePath("/vetrina");
  revalidatePath("/zecchiere");
  redirect(`/ordini/${orderId}`);
}

export type CashoutActionState = {
  error?: string;
  ok?: string;
  receiptId?: string;
  receiptRef?: string | null;
  receiptHash?: string | null;
  receiptUrl?: string | null;
  receiptKind?: string | null;
  walletNetwork?: string | null;
  proofToken?: string;
  pending?: boolean;
  instruction?: string;
  status?: string;
  payoutKind?: string;
};

export async function requestCashoutAction(
  _prev: CashoutActionState | null,
  formData: FormData,
): Promise<CashoutActionState> {
  const user = await requireUser();
  if (!user) return { error: "Devi entrare per chiedere una fusione." };
  const credits = Number(formData.get("credits"));
  const payoutKind = String(formData.get("payoutKind") ?? "IBAN") === "WALLET" ? "WALLET" : "IBAN";
  const currency = parseFiatCurrency(formData.get("currency"));
  const requestedHouse = housePayoutAccount(String(formData.get("houseAccount") ?? ""));
  const houseActor = isHouseEmail(user.email) || user.role === "ADMIN";
  const houseAccount = houseActor
    ? requestedHouse ?? (payoutKind === "IBAN" ? housePayoutForCurrency(currency) : null)
    : null;
  const iban = houseAccount?.iban ?? String(formData.get("iban") ?? "");
  const ibanHolder = houseAccount?.holder ?? String(formData.get("ibanHolder") ?? "");
  const walletAddress = String(formData.get("walletAddress") ?? "");
  const walletNetwork = String(formData.get("walletNetwork") ?? formData.get("cryptoChoice") ?? "");
  const receipt = String(formData.get("receipt") ?? "");
  if (String(formData.get("confirmed") ?? "") !== "on") {
    return { error: "Conferma la destinazione prima di prelevare. La schermata resta qui." };
  }
  if (payoutKind === "WALLET") {
    const blocked = shopPayoutConfigError(walletNetwork);
    if (blocked) return { error: blocked };
  }
  try {
    if (houseActor || payoutKind === "WALLET") {
      if (houseActor) {
        await ensureHouseWalletCredits({ userId: user.id, credits });
      }
      const settled = await requestAndFulfillCashout({
        userId: user.id,
        role: user.role,
        credits,
        payoutKind,
        currency,
        iban,
        ibanHolder,
        walletAddress,
        walletNetwork,
        receipt,
        shopSend: payoutKind === "WALLET" && !receipt.trim(),
      });
      revalidatePath("/portafoglio");
      revalidatePath("/fusione");
      revalidatePath(`/ricevuta/${settled.id}`);
      revalidatePath("/zecchiere/fusioni");
      if (settled.status !== "PAID") {
        const guide = destinationInstruction({
          payoutKind: settled.payoutKind,
          holder: settled.ibanHolder,
          iban: settled.iban,
          walletAddress: settled.walletAddress,
          walletNetwork: settled.walletNetwork,
          currency: settled.currency,
          eurCents: settled.eurCents,
          usdCents: settled.usdCents,
          chfCents: settled.chfCents,
          cashoutId: settled.id,
        });
        const proofToken = await rememberCashoutProof(
          proofFromPaidCashout({
            ...settled,
            userName: user.name,
            status: settled.status,
          }),
        );
        const queued = settled.status === "QUEUED";
        return {
          ok: queued
            ? settled.payoutKind === "WALLET"
              ? "Autorizzato. AUTHORIZED_PENDING_GATEWAY: crediti bruciati, in attesa di minter o vault."
              : "Autorizzato. READY_FOR_SIGNATURE / AUTHORIZED_PENDING_GATEWAY: pain.001 o distinta Wise in attesa del BaaS."
            : "Prelievo registrato.",
          receiptId: settled.id,
          receiptRef: settled.receiptRef,
          receiptHash: settled.receiptHash,
          receiptUrl: settled.receiptUrl,
          receiptKind: settled.receiptKind,
          pending: settled.payoutKind !== "WALLET" || !queued,
          status: settled.status,
          payoutKind: settled.payoutKind,
          walletNetwork: settled.walletNetwork,
          instruction: guide?.text,
          proofToken,
        };
      }
      const proofToken = await rememberCashoutProof(
        proofFromPaidCashout({
          ...settled,
          userName: user.name,
        }),
      );
      return {
        ok:
          settled.payoutKind === "WALLET"
            ? "Crediti convertiti e inviati. Hash reale sulla rete: il wallet indicato riceve, senza firmare né dare consensi."
            : "CRO bancario registrato. Zecca non ha disposto il bonifico: euro, dollari o franchi arrivano solo se li hai inviati tu dalla banca.",
        receiptId: settled.id,
        receiptRef: settled.receiptRef,
        receiptHash: settled.receiptHash,
        receiptUrl: settled.receiptUrl,
        receiptKind: settled.receiptKind,
        walletNetwork: settled.walletNetwork,
        proofToken,
        status: settled.status,
        payoutKind: settled.payoutKind,
      };
    }
    const asked = await requestCustomerCashout({
      userId: user.id,
      role: user.role,
      credits,
      payoutKind,
      currency,
      iban,
      ibanHolder,
      walletAddress,
      walletNetwork,
    });
    const proofToken = await rememberCashoutProof(
      proofFromPaidCashout({
        ...asked,
        userName: user.name,
        status: "PENDING",
      }),
    );
    revalidatePath("/portafoglio");
    revalidatePath("/fusione");
    revalidatePath("/zecchiere/fusioni");
    return {
      ok:
        asked.payoutKind === "WALLET"
          ? "Richiesta registrata. Dopo la conferma il negozio invia alla destinazione: tu ricevi, senza firmare."
          : "Richiesta registrata. Resta visibile in Prelievo. Massimo la chiude dopo il bonifico.",
      receiptId: asked.id,
      pending: true,
      status: asked.status,
      payoutKind: asked.payoutKind,
      proofToken,
    };
  } catch (error) {
    if (!houseActor && isZeccaError(error) && error.code === "INSUFFICIENT_CREDITS") {
      redirect("/crediti");
    }
    const message = publicErrorMessage(error, "Richiesta non riuscita.");
    const openId = isZeccaError(error) ? error.cashoutId : undefined;
    if (houseActor && payoutKind === "WALLET" && openId) {
      const open = await prisma.cashoutRequest.findUnique({ where: { id: openId } });
      if (open) {
        const proofToken = await rememberCashoutProof(
          proofFromPaidCashout({
            ...open,
            userName: user.name ?? "Casa",
            status: open.status,
          }),
        );
        const queued = open.status === "QUEUED";
        return {
          error: queued ? undefined : message,
          ok: queued
            ? "Autorizzato. AUTHORIZED_PENDING_GATEWAY: istruzione firmata, in attesa del gateway."
            : undefined,
          receiptId: open.id,
          pending: true,
          status: open.status,
          payoutKind: "WALLET",
          receiptKind: open.receiptKind,
          proofToken,
        };
      }
    }
    return { error: message };
  }
}
