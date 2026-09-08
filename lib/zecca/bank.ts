import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { formatIbanDisplay, isValidIban, normalizeIban } from "@/lib/iban";
import { completePendingPurchase } from "@/lib/zecca/credits";
import { creditsToEurCents, getSettings } from "@/lib/zecca/settings";

export type ShopBank = {
  iban: string;
  holder: string;
  bankName: string;
};

export function isShopBankReady(bank: ShopBank) {
  return isValidIban(bank.iban) && bank.holder.trim().length >= 2;
}

export async function getShopBank(db: PrismaClient = defaultPrisma): Promise<ShopBank> {
  const rows = await db.setting.findMany({
    where: { key: { in: ["shopIban", "shopIbanHolder", "shopBankName"] } },
  });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    iban: map.shopIban ?? "",
    holder: map.shopIbanHolder ?? "",
    bankName: map.shopBankName ?? "",
  };
}

export async function saveShopBank(input: ShopBank, db: PrismaClient = defaultPrisma) {
  const holder = input.holder.trim();
  if (holder.length < 2) {
    throw new ZeccaError("Indica l’intestatario del conto che riceve i bonifici.", "INVALID_IBAN");
  }
  if (!isValidIban(input.iban)) {
    throw new ZeccaError(
      "IBAN non valido. Deve essere il conto vero della zecca, quello su cui arrivano i SEPA.",
      "INVALID_IBAN",
    );
  }
  const iban = normalizeIban(input.iban);
  const bankName = input.bankName.trim();
  await Promise.all([
    db.setting.upsert({
      where: { key: "shopIban" },
      create: { key: "shopIban", value: iban },
      update: { value: iban },
    }),
    db.setting.upsert({
      where: { key: "shopIbanHolder" },
      create: { key: "shopIbanHolder", value: holder },
      update: { value: holder },
    }),
    db.setting.upsert({
      where: { key: "shopBankName" },
      create: { key: "shopBankName", value: bankName },
      update: { value: bankName },
    }),
  ]);
  return { iban, holder, bankName };
}

function makeReference() {
  const raw = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  return `ZECCA-${raw.padEnd(6, "X").slice(0, 6)}`;
}

export async function requestBonificoPurchase(input: {
  userId: string;
  credits: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new ZeccaError("Scegli un numero di crediti da acquistare.", "INVALID_AMOUNT");
  }
  const bank = await getShopBank(db);
  if (!isShopBankReady(bank)) {
    throw new ZeccaError(
      "Il zecchiere non ha ancora indicato l’IBAN della zecca. Senza quel conto non si può versare.",
      "BANK_MISSING",
    );
  }
  const settings = await getSettings(db);
  const eurCents = creditsToEurCents(credits, settings.eurCentsPerCredit);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = makeReference();
    try {
      const purchase = await db.creditPurchase.create({
        data: {
          userId: input.userId,
          credits,
          eurCents,
          method: "bonifico",
          reference,
          status: "pending",
        },
      });
      return { purchase, bank };
    } catch (error) {
      if (attempt === 7) throw error;
    }
  }
  throw new ZeccaError("Non sono riuscito a creare la causale. Riprova.", "INVALID_AMOUNT");
}

export function bonificoInstruction(input: {
  bank: ShopBank;
  credits: number;
  eurCents: number;
  reference: string;
}) {
  const amount = (input.eurCents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
  return {
    iban: formatIbanDisplay(input.bank.iban),
    ibanRaw: normalizeIban(input.bank.iban),
    holder: input.bank.holder,
    bankName: input.bank.bankName,
    amount,
    reference: input.reference,
    credits: input.credits,
    text: [
      `Bonifico SEPA di ${amount}`,
      `IBAN ${formatIbanDisplay(input.bank.iban)}`,
      `Intestato a ${input.bank.holder}`,
      input.bank.bankName ? `Banca ${input.bank.bankName}` : "",
      `Causale ${input.reference}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function confirmBonificoPurchase(input: {
  purchaseId: string;
  actorId: string;
  db?: PrismaClient;
}) {
  return completePendingPurchase({
    purchaseId: input.purchaseId,
    actorId: input.actorId,
    db: input.db,
  });
}

export async function cancelBonificoPurchase(input: {
  purchaseId: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const purchase = await db.creditPurchase.findUnique({ where: { id: input.purchaseId } });
  if (!purchase || purchase.method !== "bonifico") {
    throw new ZeccaError("Versamento non trovato.", "NOT_FOUND");
  }
  if (purchase.status !== "pending") {
    throw new ZeccaError("Questo versamento non è più in attesa.", "INVALID_AMOUNT");
  }
  return db.creditPurchase.update({
    where: { id: purchase.id },
    data: { status: "cancelled" },
  });
}
