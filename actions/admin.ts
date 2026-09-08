"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { isZeccaError } from "@/lib/errors";
import { mintCredits } from "@/lib/zecca/mint";
import { resolveCashout } from "@/lib/zecca/cashout";
import { convertTreasuryToShopFiat } from "@/lib/zecca/convert";
import { saveSettings, type ForgeTier } from "@/lib/zecca/settings";
import { cancelBonificoPurchase, confirmBonificoPurchase, saveShopBank } from "@/lib/zecca/bank";
import { prisma } from "@/lib/db";
import { fulfillDhlOrder, markSupplierShipped, refreshOrderTracking } from "@/lib/zecca/shop";
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

export async function treasuryConvertAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può convertire la tesoreria." };
  const creditsEur = Number(formData.get("creditsEur") ?? 0);
  const creditsUsd = Number(formData.get("creditsUsd") ?? 0);
  try {
    const result = await convertTreasuryToShopFiat({
      actorId: admin.id,
      creditsEur,
      creditsUsd,
    });
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/libro-mastro");
    const parts = [];
    if (result.creditsEur > 0) {
      parts.push(
        `${result.creditsEur.toLocaleString("it-IT")} cr → ${(result.eurCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} in cassa negozio`,
      );
    }
    if (result.creditsUsd > 0) {
      parts.push(
        `${result.creditsUsd.toLocaleString("it-IT")} cr → ${(result.usdCents / 100).toLocaleString("it-IT", { style: "currency", currency: "USD" })} in cassa negozio`,
      );
    }
    return {
      ok: `Conversione registrata: ${parts.join(" · ")}. Non è un accredito bancario.`,
    };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Conversione non riuscita." };
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
  const paidVia = String(formData.get("payoutKind") ?? "IBAN");
  if (action === "pay") {
    const confirmed =
      formData.get("sepaConfirm") === "on" || formData.get("payoutConfirm") === "on";
    if (!confirmed) {
      return {
        error:
          paidVia === "WALLET"
            ? "Conferma di aver inviato dal tuo wallet verso questo indirizzo. Zecca non spedisce crypto."
            : "Conferma di aver disposto il bonifico SEPA dal tuo conto. Zecca non invia i soldi.",
      };
    }
  }
  try {
    await resolveCashout({
      cashoutId,
      actorId: admin.id,
      action,
      adminNote:
        adminNote ||
        (action === "pay"
          ? paidVia === "WALLET"
            ? "Invio da wallet del zecchiere"
            : "Bonifico SEPA disposto dal zecchiere"
          : undefined),
    });
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/portafoglio");
    return { ok: action === "pay" ? "Fusione pagata." : "Fusione rifiutata, crediti restituiti." };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Operazione non riuscita." };
  }
}

export async function saveShopBankAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può impostare il conto." };
  try {
    await saveShopBank({
      iban: String(formData.get("iban") ?? ""),
      holder: String(formData.get("holder") ?? ""),
      bankName: String(formData.get("bankName") ?? ""),
    });
    revalidatePath("/zecchiere/versamenti");
    revalidatePath("/crediti");
    return { ok: "Conto della zecca salvato. I clienti vedono IBAN e causale." };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Conto non salvato." };
  }
}

export async function confirmBonificoAction(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può confermare un versamento." };
  if (formData.get("bankConfirm") !== "on") {
    return { error: "Conferma di aver visto il bonifico sul tuo conto. Zecca non interroga la banca." };
  }
  try {
    const result = await confirmBonificoPurchase({
      purchaseId: String(formData.get("purchaseId") ?? ""),
      actorId: admin.id,
    });
    revalidatePath("/zecchiere/versamenti");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/crediti");
    revalidatePath("/portafoglio");
    return {
      ok: `Accreditati ${result.purchase.credits.toLocaleString("it-IT")} cr. Euro arrivati sul tuo conto, non da un webhook.`,
    };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Conferma non riuscita." };
  }
}

export async function cancelBonificoAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  await cancelBonificoPurchase({ purchaseId: String(formData.get("purchaseId") ?? "") }).catch(
    () => undefined,
  );
  revalidatePath("/zecchiere/versamenti");
  revalidatePath("/crediti");
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
  const supplierId = String(formData.get("supplierId") ?? "").trim() || null;

  try {
    if (id) {
      await prisma.product.update({
        where: { id },
        data: { name, slug, description, imageKey: key, priceCredits, stock, active, supplierId },
      });
    } else {
      await prisma.product.create({
        data: { name, slug, description, imageKey: key, priceCredits, stock, active, supplierId },
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

export async function bookDhlAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await fulfillDhlOrder(id);
  revalidatePath("/zecchiere/ordini");
  revalidatePath(`/zecchiere/ordini/${id}`);
  revalidatePath("/ordini");
}

export async function refreshDhlTrackingAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await refreshOrderTracking(id);
  revalidatePath("/zecchiere/ordini");
  revalidatePath(`/zecchiere/ordini/${id}`);
  revalidatePath("/ordini");
}

export async function markOrderShippedAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markSupplierShipped(id);
  revalidatePath("/zecchiere/ordini");
  revalidatePath(`/zecchiere/ordini/${id}`);
  revalidatePath("/ordini");
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
