"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { isZeccaError } from "@/lib/errors";
import { grantHouseCredits } from "@/lib/zecca/house";

export async function grantHouseCreditsAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const user = await requireUser();
  if (!user) return { error: "Devi entrare con la tua email della casa." };
  const credits = Number(formData.get("credits"));
  try {
    const result = await grantHouseCredits({ userId: user.id, credits });
    revalidatePath("/portafoglio");
    revalidatePath("/crediti");
    revalidatePath("/fusione");
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/libro-mastro");
    return {
      ok: `Generati ${result.credits.toLocaleString("it-IT")} cr senza pagamento. Valore ${ (result.eurCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }) } oppure ${ (result.usdCents / 100).toLocaleString("it-IT", { style: "currency", currency: "USD" }) }. Puoi prelevarli in Prelievo verso il tuo IBAN.`,
    };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Generazione non riuscita." };
  }
}
