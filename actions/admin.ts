"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { isZeccaError, publicErrorMessage } from "@/lib/errors";
import { mintCredits } from "@/lib/zecca/mint";
import {
  fulfillWalletCashoutFromShop,
  materializeCashoutFromProof,
  requestInternalCryptoWithdraw,
  resolveCashout,
} from "@/lib/zecca/cashout";
import { shopPayoutConfigError } from "@/lib/zecca/shop-payout";
import { findIncomingCryptoTx } from "@/lib/chain-receipt";
import { proofFromPaidCashout, verifyCashoutProof } from "@/lib/cashout-proof";
import { findRememberedProof, rememberCashoutProof } from "@/lib/cashout-proof-store";
import { convertTreasuryToShopCash } from "@/lib/zecca/convert";
import { destinationInstruction } from "@/lib/payout";
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
  const creditsCrypto = Number(formData.get("creditsCrypto") ?? 0);
  const cryptoAsset = String(formData.get("cryptoAsset") ?? "");
  try {
    const result = await convertTreasuryToShopCash({
      actorId: admin.id,
      creditsEur,
      creditsUsd,
      creditsCrypto,
      cryptoAsset,
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
    if (result.creditsCrypto > 0 && result.cryptoAsset) {
      parts.push(
        `${result.creditsCrypto.toLocaleString("it-IT")} cr → ${(result.cryptoUsdCents / 100).toLocaleString("it-IT", { style: "currency", currency: "USD" })} in wallet interno ${result.cryptoAsset}`,
      );
    }
    return {
      ok: `Conversione registrata: ${parts.join(" · ")}. Euro/dollari restano libro; la crypto va nel wallet interno, non sulla rete.`,
    };
  } catch (error) {
    return { error: isZeccaError(error) ? error.message : "Conversione non riuscita." };
  }
}

export type InternalWithdrawState = {
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
  status?: string;
  payoutKind?: string;
  walletAddress?: string | null;
  usdCents?: number;
  instruction?: string;
};

export async function treasuryCryptoWithdrawAction(
  _prev: InternalWithdrawState | null,
  formData: FormData,
): Promise<InternalWithdrawState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può prelevare dai wallet interni." };
  if (String(formData.get("confirmed") ?? "") !== "on") {
    return { error: "Conferma la destinazione prima di prelevare dal wallet interno." };
  }
  const credits = Number(formData.get("credits") ?? 0);
  const asset = String(formData.get("cryptoAsset") ?? formData.get("walletNetwork") ?? "");
  const walletAddress = String(formData.get("walletAddress") ?? "");
  const blocked = shopPayoutConfigError(asset);
  if (blocked) return { error: blocked };
  try {
    const settled = await requestInternalCryptoWithdraw({
      actorId: admin.id,
      credits,
      asset,
      walletAddress,
      shopSend: true,
    });
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/fusione");
    revalidatePath(`/ricevuta/${settled.id}`);
    const proofToken = await rememberCashoutProof(
      proofFromPaidCashout({
        ...settled,
        userName: admin.name ?? "Casa",
        status: settled.status,
      }),
    );
    if (settled.status !== "PAID") {
      const guide = destinationInstruction({
        payoutKind: "WALLET",
        holder: null,
        iban: null,
        walletAddress: settled.walletAddress,
        walletNetwork: settled.walletNetwork,
        currency: "USD",
        eurCents: settled.eurCents,
        usdCents: settled.usdCents,
        cashoutId: settled.id,
      });
      return {
        ok: "Prelievo aperto dal wallet interno. I crediti sono già convertiti: conferma di nuovo l’invio dal negozio quando la cassa di rete ha le monete.",
        receiptId: settled.id,
        pending: true,
        status: settled.status,
        payoutKind: "WALLET",
        walletNetwork: settled.walletNetwork,
        walletAddress: settled.walletAddress,
        usdCents: settled.usdCents,
        instruction: guide?.text,
        proofToken,
      };
    }
    return {
      ok: "Il negozio ha inviato dal wallet interno. Hash reale sulla rete: chi riceve non firma.",
      receiptId: settled.id,
      receiptRef: settled.receiptRef,
      receiptHash: settled.receiptHash,
      receiptUrl: settled.receiptUrl,
      receiptKind: settled.receiptKind,
      walletNetwork: settled.walletNetwork,
      walletAddress: settled.walletAddress,
      usdCents: settled.usdCents,
      proofToken,
      status: settled.status,
      payoutKind: "WALLET",
    };
  } catch (error) {
    const message = publicErrorMessage(error, "Prelievo dal wallet interno non riuscito.");
    const cashoutId = isZeccaError(error) ? error.cashoutId : undefined;
    if (!cashoutId) return { error: message };
    return {
      error: message,
      receiptId: cashoutId,
      pending: true,
      status: "PENDING",
      payoutKind: "WALLET",
      walletNetwork: asset,
      walletAddress,
    };
  }
}

export type ResolveCashoutState = {
  error?: string;
  ok?: string;
  receiptId?: string;
  receiptRef?: string | null;
  receiptHash?: string | null;
  receiptUrl?: string | null;
  receiptKind?: string | null;
  walletNetwork?: string | null;
  proofToken?: string;
  status?: string;
};

export async function resolveCashoutAction(
  _prev: ResolveCashoutState | null,
  formData: FormData,
): Promise<ResolveCashoutState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può chiudere una fusione." };
  const cashoutId = String(formData.get("cashoutId") ?? "");
  const rawAction = String(formData.get("action") ?? "");
  const shopPay = rawAction === "shopPay";
  const searching = rawAction === "search";
  const action = (shopPay || searching ? "pay" : rawAction) as "pay" | "reject";
  const adminNote = String(formData.get("adminNote") ?? "");
  let receipt = String(formData.get("receipt") ?? "");
  if (action !== "pay" && action !== "reject") return { error: "Azione non valida." };
  const paidVia = String(formData.get("payoutKind") ?? "IBAN");
  if (shopPay && paidVia !== "WALLET") {
    return { error: "L’invio dal negozio vale solo per i prelievi crypto." };
  }
  if (action === "pay" && !shopPay) {
    const confirmed =
      formData.get("sepaConfirm") === "on" || formData.get("payoutConfirm") === "on";
    if (!confirmed) {
      return {
        error:
          paidVia === "WALLET"
            ? "Conferma l’hash già visibile sulla rete, oppure usa il pulsante del negozio: chi riceve non firma."
            : "Conferma di aver disposto il bonifico dal tuo conto. Zecca non invia i soldi.",
      };
    }
    if (!searching && !receipt.trim()) {
      return {
        error:
          paidVia === "WALLET"
            ? "Conferma: il negozio invia e genera l’hash. In alternativa incolla un hash già sulla rete."
            : "Incolla il CRO o il riferimento del bonifico: è la ricevuta del prelievo.",
      };
    }
  }
  try {
    const proofToken = String(formData.get("proofToken") ?? "");
    const remembered =
      verifyCashoutProof(proofToken) ?? (await findRememberedProof(cashoutId));
    if (remembered && remembered.id === cashoutId) {
      await materializeCashoutFromProof({ proof: remembered, actorId: admin.id });
    }
    if (searching) {
      const row = await prisma.cashoutRequest.findUnique({ where: { id: cashoutId } });
      if (!row?.walletAddress || row.payoutKind !== "WALLET") {
        return { error: "La ricerca hash vale solo per i prelievi crypto." };
      }
      const found = await findIncomingCryptoTx({
        network: row.walletNetwork ?? "ETH",
        address: row.walletAddress,
        notBefore: new Date(row.createdAt.getTime() - 20 * 60 * 1000),
      });
      if (!found) {
        return {
          error:
            "Nessun hash verso questo wallet. Conferma l’invio dal negozio, oppure aspetta qualche secondo e cerca di nuovo.",
        };
      }
      receipt = found.hash;
    }
    let settled;
    if (shopPay) {
      const row = await prisma.cashoutRequest.findUnique({ where: { id: cashoutId } });
      const configError = shopPayoutConfigError(row?.walletNetwork);
      if (configError) return { error: configError };
      settled = await fulfillWalletCashoutFromShop({ cashoutId, actorId: admin.id });
    } else {
      settled = await resolveCashout({
        cashoutId,
        actorId: admin.id,
        action,
        receipt,
        adminNote:
          adminNote ||
          (action === "pay"
            ? paidVia === "WALLET"
              ? "Hash di rete registrato"
              : "Bonifico disposto dal zecchiere"
            : undefined),
      });
    }
    const signed = await rememberCashoutProof(
      proofFromPaidCashout({
        ...settled,
        userName: admin.name ?? "Casa",
        status: settled.status,
      }),
    );
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/portafoglio");
    revalidatePath("/fusione");
    revalidatePath(`/ricevuta/${settled.id}`);
    return {
      ok:
        action === "pay"
          ? paidVia === "WALLET"
            ? shopPay
              ? "Il negozio ha convertito i crediti e inviato. Hash reale su Mempool, Etherscan, BscScan o Blockscout: chi riceve non firma."
              : searching
                ? "Hash trovato sulla rete e registrato. Aprilo su Etherscan, BscScan o Blockscout."
                : "Prelievo chiuso. L’hash è visibile sull’explorer della rete."
            : "Prelievo chiuso. Il riferimento del bonifico è la ricevuta."
          : settled.isTreasury
            ? "Prelievo dal wallet interno annullato. I crediti restano nel wallet interno."
            : "Fusione rifiutata, crediti restituiti.",
      receiptId: settled.id,
      receiptRef: settled.receiptRef,
      receiptHash: settled.receiptHash,
      receiptUrl: settled.receiptUrl,
      receiptKind: settled.receiptKind,
      walletNetwork: settled.walletNetwork,
      proofToken: signed,
      status: settled.status,
    };
  } catch (error) {
    return { error: publicErrorMessage(error, "Operazione non riuscita.") };
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
