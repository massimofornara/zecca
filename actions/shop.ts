"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { addToCart, clearCart, getCart, updateCartQuantity } from "@/lib/cart";
import { isZeccaError } from "@/lib/errors";
import { purchaseCredits } from "@/lib/zecca/credits";
import { placeOrder } from "@/lib/zecca/shop";
import { parseShipping } from "@/lib/shipping";
import { requestCustomerCashout } from "@/lib/zecca/cashout";
import { isDemoPayEnabled } from "@/lib/stripe";
import { requestBonificoPurchase } from "@/lib/zecca/bank";

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

export async function requestCashoutAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const user = await requireUser();
  if (!user) return { error: "Devi entrare per chiedere una fusione." };
  const credits = Number(formData.get("credits"));
  const payoutKind = String(formData.get("payoutKind") ?? "IBAN") === "WALLET" ? "WALLET" : "IBAN";
  const currency = String(formData.get("currency") ?? "EUR") === "USD" ? "USD" : "EUR";
  const iban = String(formData.get("iban") ?? "");
  const ibanHolder = String(formData.get("ibanHolder") ?? "");
  const walletAddress = String(formData.get("walletAddress") ?? "");
  const walletNetwork = String(formData.get("walletNetwork") ?? "");
  try {
    await requestCustomerCashout({
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
    revalidatePath("/fusione");
    revalidatePath("/portafoglio");
    revalidatePath("/zecchiere/fusioni");
    return {
      ok:
        payoutKind === "WALLET"
          ? "Richiesta inviata. Massimo vedrà il tuo wallet e, se accetta, invierà da un wallet suo. Zecca non spedisce crypto da sola."
          : currency === "USD"
            ? "Richiesta inviata. Il bonifico in dollari va all’IBAN indicato. Zecca non invia i soldi da sola: lo fai tu dalla banca, poi confermi in Fusioni."
            : "Richiesta inviata. Il bonifico in euro va all’IBAN indicato. Zecca non invia i soldi da sola: lo fai tu dalla banca, poi confermi in Fusioni.",
    };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Richiesta non riuscita." };
  }
}
