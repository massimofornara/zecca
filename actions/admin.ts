"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { isZeccaError } from "@/lib/errors";
import { mintCredits } from "@/lib/zecca/mint";
import { requestTreasuryCashout, resolveCashout } from "@/lib/zecca/cashout";
import { saveSettings, type ForgeTier } from "@/lib/zecca/settings";
import { prisma } from "@/lib/db";
import { CATALOG_SEED } from "@/lib/catalog";

export async function mintAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può coniare." };
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "");
  try {
    await mintCredits({ amount, note, actorId: admin.id });
    revalidatePath("/");
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/conio");
    revalidatePath("/zecchiere/libro-mastro");
    return { ok: `Coniati ${amount.toLocaleString("it-IT")} crediti in tesoreria.` };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Conio non riuscito." };
  }
}

export async function treasuryCashoutAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può fondere la tesoreria." };
  const credits = Number(formData.get("credits"));
  const currency = String(formData.get("currency") ?? "EUR");
  try {
    const cashout = await requestTreasuryCashout({ actorId: admin.id, credits, currency });
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/libro-mastro");
    const fiat =
      cashout.currency === "USD"
        ? `${(cashout.usdCents / 100).toLocaleString("it-IT", { style: "currency", currency: "USD" })}`
        : `${(cashout.eurCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`;
    return {
      ok: `Fusione tesoreria segnata: ${credits.toLocaleString("it-IT")} cr → ${fiat}. Il bonifico, se lo fai, parte dal tuo conto.`,
    };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Fusione non riuscita." };
  }
}

export async function resolveCashoutAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può chiudere una fusione." };
  const cashoutId = String(formData.get("cashoutId") ?? "");
  const action = String(formData.get("action") ?? "") as "pay" | "reject";
  const adminNote = String(formData.get("adminNote") ?? "");
  if (action !== "pay" && action !== "reject") return { error: "Azione non valida." };
  if (action === "pay" && formData.get("sepaConfirm") !== "on") {
    return { error: "Conferma di aver disposto il bonifico SEPA dal tuo conto. Zecca non invia i soldi." };
  }
  try {
    await resolveCashout({
      cashoutId,
      actorId: admin.id,
      action,
      adminNote: adminNote || (action === "pay" ? "Bonifico SEPA disposto dal zecchiere" : undefined),
    });
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/portafoglio");
    return { ok: action === "pay" ? "Fusione pagata." : "Fusione rifiutata, crediti restituiti." };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Operazione non riuscita." };
  }
}

export async function saveForgeSettingsAction(
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può regolare la forgia." };

  const eur = Number(formData.get("eurPerCredit"));
  const usd = Number(formData.get("usdPerCredit"));
  if (!Number.isFinite(eur) || eur <= 0) {
    return { error: "Il tasso in euro deve essere un numero positivo." };
  }
  if (!Number.isFinite(usd) || usd <= 0) {
    return { error: "Il tasso in dollari deve essere un numero positivo." };
  }

  const tiers: ForgeTier[] = [0, 1, 2, 3].map((i) => {
    const minSpent = Number(formData.get(`tier${i}_min`));
    const maxRaw = String(formData.get(`tier${i}_max`) ?? "");
    const percent = Number(formData.get(`tier${i}_percent`));
    return {
      minSpent,
      maxSpent: maxRaw === "" || maxRaw === "∞" ? null : Number(maxRaw),
      percent,
    };
  });

  if (tiers.some((t) => !Number.isFinite(t.minSpent) || !Number.isFinite(t.percent))) {
    return { error: "Soglie della forgia non valide." };
  }

  await saveSettings(
    {
      eurCentsPerCredit: Math.round(eur * 100),
      usdCentsPerCredit: Math.round(usd * 100),
      forgeTiers: tiers,
    },
    admin.id,
  );
  revalidatePath("/zecchiere/forgia");
  revalidatePath("/zecchiere/fusioni");
  revalidatePath("/zecchiere");
  revalidatePath("/portafoglio");
  return { ok: "Impostazioni della forgia e dei tassi salvate." };
}

export async function upsertProductAction(
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può toccare la vetrina." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  const description = String(formData.get("description") ?? "").trim();
  const imageKey = String(formData.get("imageKey") ?? "olio");
  const priceCredits = Number(formData.get("priceCredits"));
  const stock = Number(formData.get("stock"));
  const active = formData.get("active") === "on";

  if (!name || !slug || !description) return { error: "Compila nome, slug e descrizione." };
  if (!Number.isFinite(priceCredits) || priceCredits <= 0) {
    return { error: "Il prezzo in crediti deve essere positivo." };
  }
  if (!Number.isFinite(stock) || stock < 0) return { error: "Le scorte non possono essere negative." };

  const validKeys = CATALOG_SEED.map((p) => p.imageKey);
  const key = validKeys.includes(imageKey as (typeof validKeys)[number]) ? imageKey : "olio";

  try {
    if (id) {
      await prisma.product.update({
        where: { id },
        data: { name, slug, description, imageKey: key, priceCredits, stock, active },
      });
    } else {
      await prisma.product.create({
        data: { name, slug, description, imageKey: key, priceCredits, stock, active },
      });
    }
  } catch {
    return { error: "Slug già usato, o prodotto non trovato." };
  }

  revalidatePath("/zecchiere/prodotti");
  revalidatePath("/vetrina");
  return { ok: "Prodotto salvato." };
}

export async function saveForgeSettingsForm(formData: FormData): Promise<void> {
  await saveForgeSettingsAction(formData);
}

export async function upsertProductForm(formData: FormData): Promise<void> {
  await upsertProductAction(formData);
}

export async function toggleProductAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return;
  await prisma.product.update({ where: { id }, data: { active: !product.active } });
  revalidatePath("/zecchiere/prodotti");
  revalidatePath("/vetrina");
}
