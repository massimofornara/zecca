"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { isZeccaError, publicErrorMessage } from "@/lib/errors";
import { mintCredits } from "@/lib/zecca/mint";
import {
  convertTreasuryBundle,
  executeGenerationPayouts,
  fulfillWalletCashoutFromShop,
  markSepaDisposed,
  materializeCashoutFromProof,
  requestInternalCryptoWithdraw,
  resolveCashout,
  sendUsdcFromShop,
  settleQueuedWalletCashouts,
} from "@/lib/zecca/cashout";
import { transmitAllOpenSettlements, transmitAllSummary } from "@/lib/zecca/transmit";
import { TREASURY_CRYPTO_ASSETS, type TreasuryCryptoAsset } from "@/lib/zecca/convert";
import { fundsAuthorized, fundsDelivered } from "@/lib/zecca/settlement";
import { shopPayoutConfigError } from "@/lib/zecca/shop-payout";
import { findIncomingCryptoTx } from "@/lib/chain-receipt";
import { proofFromPaidCashout, verifyCashoutProof } from "@/lib/cashout-proof";
import { findRememberedProof, rememberCashoutProof } from "@/lib/cashout-proof-store";
import { isValidWalletAddress, normalizeWalletAddress } from "@/lib/wallet";
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

export type PayoutSnapshot = {
  receiptId: string;
  receiptRef?: string | null;
  receiptHash?: string | null;
  receiptUrl?: string | null;
  receiptKind?: string | null;
  walletNetwork?: string | null;
  walletAddress?: string | null;
  payoutKind?: string;
  status?: string;
  proofToken?: string;
};

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
  payouts?: PayoutSnapshot[];
};

async function snapshotCashout(
  row: {
    id: string;
    receiptRef: string | null;
    receiptHash: string | null;
    receiptUrl: string | null;
    receiptKind: string | null;
    walletNetwork: string | null;
    walletAddress: string | null;
    payoutKind: string;
    status: string;
    userName?: string | null;
  } & Record<string, unknown>,
  userName: string,
): Promise<PayoutSnapshot> {
  const proofToken = await rememberCashoutProof(
    proofFromPaidCashout({
      ...row,
      userName,
      status: row.status,
    } as Parameters<typeof proofFromPaidCashout>[0]),
  );
  return {
    receiptId: row.id,
    receiptRef: row.receiptRef,
    receiptHash: row.receiptHash,
    receiptUrl: row.receiptUrl,
    receiptKind: row.receiptKind,
    walletNetwork: row.walletNetwork,
    walletAddress: row.walletAddress,
    payoutKind: row.payoutKind,
    status: row.status,
    proofToken,
  };
}

export async function treasuryConvertAction(
  _prev: InternalWithdrawState | null,
  formData: FormData,
): Promise<InternalWithdrawState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può convertire la tesoreria." };

  const executeAll = String(formData.get("executeAll") ?? "") === "on";
  const walletBtc = normalizeWalletAddress(String(formData.get("walletBtc") ?? ""));
  const walletEvm = normalizeWalletAddress(
    String(formData.get("walletEvm") ?? formData.get("walletAddress") ?? ""),
  );

  try {
    if (executeAll) {
      const result = await executeGenerationPayouts({
        actorId: admin.id,
        role: admin.role,
        creditsFiat: Number(formData.get("creditsFiat") ?? 50),
        creditsCrypto: Number(formData.get("creditsCryptoEach") ?? 10),
        creditsIban: Number(formData.get("creditsIban") ?? 50),
        btcAddress: walletBtc,
        evmAddress: walletEvm,
      });
      revalidatePath("/zecchiere");
      revalidatePath("/zecchiere/fusioni");
      revalidatePath("/zecchiere/liquidazione");
      revalidatePath("/zecchiere/libro-mastro");
      revalidatePath("/fusione");
      const payouts: PayoutSnapshot[] = [];
      for (const row of [...result.bundle.cashouts, ...result.ibans]) {
        payouts.push(await snapshotCashout(row, admin.name ?? "Casa"));
      }
      const fiat = result.bundle.fiat;
      const fiatParts = [];
      if (fiat?.creditsEur) {
        fiatParts.push(
          `${fiat.creditsEur.toLocaleString("it-IT")} cr → ${(fiat.eurCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`,
        );
      }
      if (fiat?.creditsUsd) {
        fiatParts.push(
          `${fiat.creditsUsd.toLocaleString("it-IT")} cr → ${(fiat.usdCents / 100).toLocaleString("it-IT", { style: "currency", currency: "USD" })}`,
        );
      }
      if (fiat?.creditsChf) {
        fiatParts.push(
          `${fiat.creditsChf.toLocaleString("it-IT")} cr → ${(fiat.chfCents / 100).toLocaleString("it-IT", { style: "currency", currency: "CHF" })}`,
        );
      }
      const arrived = payouts.filter((payout) => fundsDelivered(payout)).length;
      const authorized = payouts.filter((payout) => fundsAuthorized(payout)).length;
      return {
        ok:
          arrived > 0
            ? `Fondi trasmessi: ${arrived} di ${payouts.length}. Cassa libro: ${fiatParts.join(" · ") || "—"}.`
            : `Autorizzato ${authorized}/${payouts.length} linee (READY_FOR_SIGNATURE / AUTHORIZED_PENDING_GATEWAY). Nessun CRO e nessun hash inventati.`,
        receiptId: payouts[0]?.receiptId,
        receiptRef: payouts[0]?.receiptRef,
        receiptHash: payouts[0]?.receiptHash,
        receiptUrl: payouts[0]?.receiptUrl,
        receiptKind: payouts[0]?.receiptKind,
        walletNetwork: payouts[0]?.walletNetwork,
        walletAddress: payouts[0]?.walletAddress,
        proofToken: payouts[0]?.proofToken,
        status: payouts[0]?.status,
        payoutKind: payouts[0]?.payoutKind,
        payouts,
      };
    }

    const creditsEur = Number(formData.get("creditsEur") ?? 0);
    const creditsUsd = Number(formData.get("creditsUsd") ?? 0);
    const creditsChf = Number(formData.get("creditsChf") ?? 0);
    const cryptos: { asset: TreasuryCryptoAsset; credits: number; address: string }[] = [];
    const legacyCredits = Number(formData.get("creditsCrypto") ?? 0);
    const legacyAsset = String(formData.get("cryptoAsset") ?? "");
    if (legacyCredits > 0 && legacyAsset) {
      const address = legacyAsset === "BTC" ? walletBtc || walletEvm : walletEvm || walletBtc;
      cryptos.push({
        asset: legacyAsset as TreasuryCryptoAsset,
        credits: legacyCredits,
        address,
      });
    }
    for (const asset of TREASURY_CRYPTO_ASSETS) {
      const credits = Number(formData.get(`credits${asset}`) ?? 0);
      if (credits <= 0) continue;
      const address = asset === "BTC" ? walletBtc : walletEvm;
      if (!address) {
        return {
          error: `Per ${asset} indica il wallet di destinazione (Bitcoin bc1… oppure 0x… EVM).`,
        };
      }
      if (!isValidWalletAddress(address, asset)) {
        return { error: `Indirizzo non valido per ${asset}.` };
      }
      const blocked = shopPayoutConfigError(asset);
      if (blocked) return { error: blocked };
      cryptos.push({ asset, credits, address });
    }

    const { fiat, cashouts, fiatCashouts } = await convertTreasuryBundle({
      actorId: admin.id,
      creditsEur,
      creditsUsd,
      creditsChf,
      cryptos,
      shopSend: true,
    });
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/liquidazione");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/fusione");
    const payouts: PayoutSnapshot[] = [];
    for (const row of [...fiatCashouts, ...cashouts]) {
      payouts.push(await snapshotCashout(row, admin.name ?? "Casa"));
    }
    const parts = [];
    if (fiat?.creditsEur) {
      parts.push(
        `${fiat.creditsEur.toLocaleString("it-IT")} cr → ${(fiat.eurCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} verso UniCredit`,
      );
    }
    if (fiat?.creditsUsd) {
      parts.push(
        `${fiat.creditsUsd.toLocaleString("it-IT")} cr → ${(fiat.usdCents / 100).toLocaleString("it-IT", { style: "currency", currency: "USD" })} verso Wise`,
      );
    }
    if (fiat?.creditsChf) {
      parts.push(
        `${fiat.creditsChf.toLocaleString("it-IT")} cr → ${(fiat.chfCents / 100).toLocaleString("it-IT", { style: "currency", currency: "CHF" })} verso Wise`,
      );
    }
    for (const row of cashouts) {
      parts.push(`${row.credits} cr → ${row.walletNetwork}`);
    }
    const arrived = payouts.filter((payout) => fundsDelivered(payout)).length;
    const authorized = payouts.filter((payout) => fundsAuthorized(payout)).length;
    if (payouts.length === 0) {
      return {
        error:
          "Nessun accredito partito: indica crediti e destinazioni. La cassa libro da sola non è un bonifico.",
      };
    }
    return {
      ok:
        arrived > 0
          ? `Fondi trasmessi: ${arrived} di ${payouts.length}. ${parts.join(" · ")}.`
          : `Autorizzato ${authorized}/${payouts.length}. Istruzione firmata a libro; clearing solo con minter, vault o API bancaria. ${parts.join(" · ")}.`,
      receiptId: payouts[0].receiptId,
      receiptRef: payouts[0].receiptRef,
      receiptHash: payouts[0].receiptHash,
      receiptUrl: payouts[0].receiptUrl,
      receiptKind: payouts[0].receiptKind,
      walletNetwork: payouts[0].walletNetwork,
      walletAddress: payouts[0].walletAddress,
      proofToken: payouts[0].proofToken,
      status: payouts[0].status,
      payoutKind: payouts[0].payoutKind,
      payouts,
    };
  } catch (error) {
    const message = publicErrorMessage(error, "Conversione non riuscita.");
    const cashoutId = isZeccaError(error) ? error.cashoutId : undefined;
    if (!cashoutId) return { error: message };
    const open = await prisma.cashoutRequest.findUnique({ where: { id: cashoutId } });
    const status = open?.status ?? "PENDING";
    return {
      error: message,
      receiptId: cashoutId,
      pending: true,
      status,
      payoutKind: open?.payoutKind ?? "WALLET",
      walletNetwork: open?.walletNetwork,
      walletAddress: open?.walletAddress,
      receiptKind: open?.receiptKind,
    };
  }
}

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
    revalidatePath("/zecchiere/liquidazione");
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
      const arrived = fundsDelivered(settled);
      return {
        ok: arrived
          ? "Fondi trasmessi. Hash di rete sulla ricevuta."
          : "Autorizzato. AUTHORIZED_PENDING_GATEWAY: istruzione firmata a libro, in attesa di minter o vault.",
        receiptId: settled.id,
        receiptRef: settled.receiptRef,
        receiptHash: settled.receiptHash,
        receiptUrl: settled.receiptUrl,
        pending: false,
        status: settled.status,
        payoutKind: "WALLET",
        walletNetwork: settled.walletNetwork,
        walletAddress: settled.walletAddress,
        usdCents: settled.usdCents,
        receiptKind: settled.receiptKind,
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
    const open = await prisma.cashoutRequest.findUnique({ where: { id: cashoutId } });
    const status = open?.status ?? "PENDING";
    return {
      error: message,
      receiptId: cashoutId,
      pending: true,
      status,
      payoutKind: "WALLET",
      walletNetwork: open?.walletNetwork ?? asset,
      walletAddress: open?.walletAddress ?? walletAddress,
      receiptKind: open?.receiptKind,
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
    revalidatePath("/zecchiere/liquidazione");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/portafoglio");
    revalidatePath("/fusione");
    revalidatePath(`/ricevuta/${settled.id}`);
    if (shopPay && settled.status === "QUEUED") {
      return {
        error: "I fondi NON sono arrivati. Manca vault, minter o liquidity gateway.",
        receiptId: settled.id,
        receiptRef: settled.receiptRef,
        receiptHash: settled.receiptHash,
        receiptUrl: settled.receiptUrl,
        receiptKind: settled.receiptKind,
        walletNetwork: settled.walletNetwork,
        proofToken: signed,
        status: settled.status,
      };
    }
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

async function rememberResolvedCashout(settled: {
  id: string;
  userId: string | null;
  credits: number;
  eurCents: number;
  usdCents: number;
  chfCents: number;
  currency: string;
  payoutKind: string;
  iban: string | null;
  ibanHolder: string | null;
  ibanBic?: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  walletChain?: string | null;
  receiptKind: string | null;
  receiptRef: string | null;
  receiptUrl: string | null;
  receiptHash: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  status: string;
  isTreasury: boolean;
}, actorName: string) {
  return rememberCashoutProof(
    proofFromPaidCashout({
      ...settled,
      userName: actorName,
      status: settled.status,
    }),
  );
}

function revalidateFusioni(cashoutId: string) {
  revalidatePath("/zecchiere");
  revalidatePath("/zecchiere/fusioni");
  revalidatePath("/zecchiere/liquidazione");
  revalidatePath("/zecchiere/libro-mastro");
  revalidatePath("/portafoglio");
  revalidatePath("/fusione");
  revalidatePath(`/ricevuta/${cashoutId}`);
}

export async function markSepaDisposedAction(
  _prev: ResolveCashoutState | null,
  formData: FormData,
): Promise<ResolveCashoutState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può chiudere una fusione." };
  const cashoutId = String(formData.get("cashoutId") ?? "");
  if (formData.get("sepaDisposedConfirm") !== "on") {
    return {
      error:
        "Conferma di aver disposto il bonifico dalla tua banca. Questo pulsante non è un CRO e non è un payout Stripe verso l’IBAN del cliente.",
    };
  }
  try {
    const proofToken = String(formData.get("proofToken") ?? "");
    const remembered =
      verifyCashoutProof(proofToken) ?? (await findRememberedProof(cashoutId));
    if (remembered && remembered.id === cashoutId) {
      await materializeCashoutFromProof({ proof: remembered, actorId: admin.id });
    }
    const settled = await markSepaDisposed({ cashoutId, actorId: admin.id });
    const signed = await rememberResolvedCashout(settled, admin.name ?? "Casa");
    revalidateFusioni(settled.id);
    return {
      ok: "Bonifico segnato come disposto. I crediti sono bruciati. Non è un CRO UniCredit e Stripe non ha pagato il cliente.",
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

export async function sendUsdcAction(
  _prev: ResolveCashoutState | null,
  formData: FormData,
): Promise<ResolveCashoutState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può inviare USDC." };
  const cashoutId = String(formData.get("cashoutId") ?? "");
  try {
    const proofToken = String(formData.get("proofToken") ?? "");
    const remembered =
      verifyCashoutProof(proofToken) ?? (await findRememberedProof(cashoutId));
    if (remembered && remembered.id === cashoutId) {
      await materializeCashoutFromProof({ proof: remembered, actorId: admin.id });
    }
    const settled = await sendUsdcFromShop({ cashoutId, actorId: admin.id });
    const signed = await rememberResolvedCashout(settled, admin.name ?? "Casa");
    revalidateFusioni(settled.id);
    return {
      ok:
        settled.receiptKind === "TX_HASH"
          ? "USDC inviato su Base dal wallet Circle del negozio. Hash sulla ricevuta."
          : "USDC inviato su Base dal wallet Circle del negozio. ID trasferimento Circle sulla ricevuta.",
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
    if (isZeccaError(error) && error.code === "CIRCLE_NOT_CONFIGURED") {
      return { error: "Wallet negozio non configurato." };
    }
    return { error: publicErrorMessage(error, "Invio USDC non riuscito. La richiesta resta aperta.") };
  }
}

export async function settleQueuedCashoutsAction(
  _prev: { error?: string; ok?: string } | null,
  _formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può evadere la coda." };
  try {
    const settled = await settleQueuedWalletCashouts({ actorId: admin.id });
    const paid = settled.filter((row) => row.status === "PAID").length;
    const queued = settled.filter((row) => row.status === "QUEUED").length;
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/liquidazione");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/fusione");
    if (settled.length === 0) {
      return { ok: "Coda di liquidazione vuota." };
    }
    const summary = `Coda di liquidazione: ${paid} inviate on-chain con hash reale, ${queued} ancora in attesa di UTXO o token. Nessun hash fittizio.`;
    return paid ? { ok: summary } : { error: summary };
  } catch (error) {
    return { error: publicErrorMessage(error, "Coda non evasa.") };
  }
}

export async function transmitAllFundsAction(
  _prev: { error?: string; ok?: string } | null,
  _formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Solo il zecchiere può trasmettere i fondi." };
  try {
    const result = await transmitAllOpenSettlements({ actorId: admin.id });
    revalidatePath("/zecchiere");
    revalidatePath("/zecchiere/fusioni");
    revalidatePath("/zecchiere/liquidazione");
    revalidatePath("/zecchiere/libro-mastro");
    revalidatePath("/fusione");
    const summary = transmitAllSummary(result);
    return result.attempts.some((item) => item.transmitted) ? { ok: summary } : { error: summary };
  } catch (error) {
    return { error: publicErrorMessage(error, "Trasmissione non eseguita.") };
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
  const chf = Number(formData.get("chfPerCredit"));
  if (!Number.isFinite(eur) || eur <= 0) {
    return { error: "Il tasso in euro deve essere un numero positivo." };
  }
  if (!Number.isFinite(usd) || usd <= 0) {
    return { error: "Il tasso in dollari deve essere un numero positivo." };
  }
  if (!Number.isFinite(chf) || chf <= 0) {
    return { error: "Il tasso in franchi svizzeri deve essere un numero positivo." };
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

  const maxTx = Number(formData.get("withdrawMaxUsdPerTx"));
  const maxDay = Number(formData.get("withdrawMaxUsdPerDay"));
  const maxHour = Number(formData.get("withdrawMaxCountPerHour"));
  const minUsd = Number(formData.get("withdrawMinUsd"));
  if (!Number.isFinite(maxTx) || maxTx <= 0) {
    return { error: "Il massimale per singolo prelievo crypto deve essere positivo." };
  }
  if (!Number.isFinite(maxDay) || maxDay <= 0) {
    return { error: "Il massimale giornaliero di prelievo crypto deve essere positivo." };
  }
  if (!Number.isFinite(maxHour) || maxHour < 1) {
    return { error: "Il numero massimo di prelievi crypto per ora deve essere almeno 1." };
  }
  if (!Number.isFinite(minUsd) || minUsd < 0) {
    return { error: "La soglia minima di prelievo crypto non può essere negativa." };
  }

  const whitelist = String(formData.get("withdrawWhitelist") ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  await saveSettings(
    {
      eurCentsPerCredit: Math.round(eur * 100),
      usdCentsPerCredit: Math.round(usd * 100),
      chfCentsPerCredit: Math.round(chf * 100),
      forgeTiers: tiers,
      withdrawMaxUsdCentsPerTx: Math.round(maxTx * 100),
      withdrawMaxUsdCentsPerDay: Math.round(maxDay * 100),
      withdrawMaxCountPerHour: Math.floor(maxHour),
      withdrawMinUsdCents: Math.round(minUsd * 100),
      withdrawWhitelist: whitelist,
      withdrawWhitelistEnforced: formData.get("withdrawWhitelistEnforced") === "on",
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
