import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { usdSpotPrice } from "@/lib/evm-send";
import { ZeccaError } from "@/lib/errors";
import { cryptoAsset, walletNetworkLabel } from "@/lib/wallet";
import { creditsToFiatCents } from "@/lib/zecca/fiat";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { getSettings } from "@/lib/zecca/settings";
import { shopPayoutAddress } from "@/lib/zecca/shop-payout";
import { CIRCLE_SHOP_SCA_ADDRESS } from "@/lib/settlement/circle-ref";

type Db = PrismaClient | Prisma.TransactionClient;

export const TREASURY_CRYPTO_ASSETS = ["BTC", "ETH", "USDT", "USDC", "BNB"] as const;
export type TreasuryCryptoAsset = (typeof TREASURY_CRYPTO_ASSETS)[number];

export type ShopCryptoBook = {
  credits: number;
  usdCents: number;
  reservedCredits: number;
  reservedUsdCents: number;
  remainingCredits: number;
  remainingUsdCents: number;
};

export type ShopCryptoBooks = Record<TreasuryCryptoAsset, ShopCryptoBook>;

export type InternalCryptoWallet = {
  asset: TreasuryCryptoAsset;
  label: string;
  ticker: string;
  credits: number;
  usdCents: number;
  remainingCredits: number;
  remainingUsdCents: number;
  amountLabel: string;
  convertedLabel: string;
  shopAddress: string | null;
};

function emptyBook(): ShopCryptoBook {
  return {
    credits: 0,
    usdCents: 0,
    reservedCredits: 0,
    reservedUsdCents: 0,
    remainingCredits: 0,
    remainingUsdCents: 0,
  };
}

export function isTreasuryCryptoAsset(id: string | null | undefined): id is TreasuryCryptoAsset {
  const asset = (id ?? "").trim().toUpperCase();
  return (TREASURY_CRYPTO_ASSETS as readonly string[]).includes(asset);
}

export function parseTreasuryCryptoAsset(raw: unknown): TreasuryCryptoAsset | null {
  const asset = String(raw ?? "").trim().toUpperCase();
  return isTreasuryCryptoAsset(asset) ? asset : null;
}

function assetFromMetadata(metadata: string | null | undefined): TreasuryCryptoAsset | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { asset?: string };
    return parseTreasuryCryptoAsset(parsed.asset);
  } catch {
    return null;
  }
}

export function formatBookCryptoAmount(
  asset: TreasuryCryptoAsset,
  usdCents: number,
  usdPrice?: number | null,
): string {
  if (!Number.isFinite(usdCents) || usdCents <= 0) return `0 ${asset}`;
  if (asset === "USDT" || asset === "USDC") {
    return `${(usdCents / 100).toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${asset}`;
  }
  if (usdPrice && usdPrice > 0) {
    const coins = usdCents / 100 / usdPrice;
    const formatted =
      coins >= 1
        ? coins.toLocaleString("it-IT", { maximumFractionDigits: 8 })
        : coins.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    return `${formatted} ${asset}`;
  }
  return `${(usdCents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "USD",
  })} in ${asset}`;
}

export async function shopFiatBalances(db: Db = defaultPrisma) {
  const [eur, usd, chf] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: { type: "TREASURY_CONVERT_TO_EUR" },
      _sum: { eurCents: true },
    }),
    db.ledgerEntry.aggregate({
      where: { type: "TREASURY_CONVERT_TO_USD" },
      _sum: { usdCents: true },
    }),
    db.ledgerEntry.aggregate({
      where: { type: "TREASURY_CONVERT_TO_CHF" },
      _sum: { chfCents: true },
    }),
  ]);
  return {
    treasuryEurCents: eur._sum.eurCents ?? 0,
    treasuryUsdCents: usd._sum.usdCents ?? 0,
    treasuryChfCents: chf._sum.chfCents ?? 0,
  };
}

export async function shopCryptoBalances(db: Db = defaultPrisma): Promise<ShopCryptoBooks> {
  const books = Object.fromEntries(TREASURY_CRYPTO_ASSETS.map((asset) => [asset, emptyBook()])) as ShopCryptoBooks;
  const [converts, cashouts] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { type: "TREASURY_CONVERT_TO_CRYPTO" },
      select: { amountCredits: true, usdCents: true, metadata: true },
    }),
    db.cashoutRequest.findMany({
      where: {
        payoutKind: "WALLET",
        status: { in: ["PENDING", "QUEUED", "PAID"] },
        OR: [
          { isTreasury: true },
          { walletNetwork: { in: ["USDC", "USDC_BASE", "BASE"] } },
        ],
      },
      select: { credits: true, usdCents: true, walletNetwork: true },
    }),
  ]);

  for (const row of converts) {
    const asset = assetFromMetadata(row.metadata);
    if (!asset) continue;
    books[asset].credits += row.amountCredits;
    books[asset].usdCents += row.usdCents;
  }
  for (const row of cashouts) {
    const asset = parseTreasuryCryptoAsset(row.walletNetwork);
    if (!asset) continue;
    books[asset].reservedCredits += row.credits;
    books[asset].reservedUsdCents += row.usdCents;
  }
  for (const asset of TREASURY_CRYPTO_ASSETS) {
    books[asset].remainingCredits = Math.max(0, books[asset].credits - books[asset].reservedCredits);
    books[asset].remainingUsdCents = Math.max(0, books[asset].usdCents - books[asset].reservedUsdCents);
  }
  return books;
}

async function spotPrices(): Promise<Partial<Record<"BTC" | "ETH" | "BNB", number>>> {
  const prices: Partial<Record<"BTC" | "ETH" | "BNB", number>> = {};
  await Promise.all(
    (["BTC", "ETH", "BNB"] as const).map(async (ticker) => {
      try {
        prices[ticker] = await usdSpotPrice(ticker);
      } catch {
        /* mostra l’equivalente USD se Coinbase non risponde */
      }
    }),
  );
  return prices;
}

export async function shopInternalCryptoWallets(db: Db = defaultPrisma): Promise<InternalCryptoWallet[]> {
  const [books, prices] = await Promise.all([shopCryptoBalances(db), spotPrices()]);
  return TREASURY_CRYPTO_ASSETS.map((asset) => {
    const book = books[asset];
    const price = asset === "USDT" || asset === "USDC" ? 1 : prices[asset as "BTC" | "ETH" | "BNB"];
    const info = cryptoAsset(asset);
    return {
      asset,
      label: walletNetworkLabel(asset),
      ticker: info?.ticker ?? asset,
      credits: book.credits,
      usdCents: book.usdCents,
      remainingCredits: book.remainingCredits,
      remainingUsdCents: book.remainingUsdCents,
      amountLabel: formatBookCryptoAmount(asset, book.remainingUsdCents, price),
      convertedLabel: formatBookCryptoAmount(asset, book.usdCents, price),
      shopAddress: shopPayoutAddress(asset),
    };
  });
}

export async function convertTreasuryToShopFiat(input: {
  actorId: string;
  creditsEur?: number;
  creditsUsd?: number;
  creditsChf?: number;
  db?: PrismaClient;
}) {
  return convertTreasuryToShopCash({
    actorId: input.actorId,
    creditsEur: input.creditsEur,
    creditsUsd: input.creditsUsd,
    creditsChf: input.creditsChf,
    db: input.db,
  });
}

export async function convertTreasuryToShopCash(input: {
  actorId: string;
  creditsEur?: number;
  creditsUsd?: number;
  creditsChf?: number;
  creditsCrypto?: number;
  cryptoAsset?: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const creditsEur = Math.max(0, Math.floor(Number(input.creditsEur ?? 0)));
  const creditsUsd = Math.max(0, Math.floor(Number(input.creditsUsd ?? 0)));
  const creditsChf = Math.max(0, Math.floor(Number(input.creditsChf ?? 0)));
  const creditsCrypto = Math.max(0, Math.floor(Number(input.creditsCrypto ?? 0)));
  const cryptoAssetId = parseTreasuryCryptoAsset(input.cryptoAsset);

  if (creditsCrypto > 0 && !cryptoAssetId) {
    throw new ZeccaError(
      "Scegli Bitcoin, Ethereum, USDT, USDC o BNB.",
      "INVALID_ASSET",
    );
  }
  if (creditsEur <= 0 && creditsUsd <= 0 && creditsChf <= 0 && creditsCrypto <= 0) {
    throw new ZeccaError(
      "Indica i crediti da convertire in euro, dollari, franchi o crypto.",
      "INVALID_AMOUNT",
    );
  }

  const settings = await getSettings(db);
  const eurCents = creditsToFiatCents(creditsEur, settings.eurCentsPerCredit);
  const usdCents = creditsToFiatCents(creditsUsd, settings.usdCentsPerCredit);
  const chfCents = creditsToFiatCents(creditsChf, settings.chfCentsPerCredit);
  const cryptoUsdCents = creditsToFiatCents(creditsCrypto, settings.usdCentsPerCredit);
  const totalCredits = creditsEur + creditsUsd + creditsChf + creditsCrypto;

  const converted = await db.$transaction(async (tx) => {
    const treasury = await pocketBalance("TREASURY", null, tx);
    if (treasury < totalCredits) {
      throw new ZeccaError(
        `La tesoreria ha solo ${treasury} cr. Non puoi convertire ${totalCredits} cr.`,
        "TREASURY_SHORT",
      );
    }

    const entries = [];

    if (creditsEur > 0) {
      entries.push(
        await appendLedger(
          {
            type: "TREASURY_CONVERT_TO_EUR",
            amountCredits: creditsEur,
            fromPocket: "TREASURY",
            toPocket: "BURN",
            actorId: input.actorId,
            eurCents,
            usdCents: 0,
            fiatCurrency: "EUR",
            note: `Conversione tesoreria: ${creditsEur} cr → ${(eurCents / 100).toFixed(2)} EUR in cassa negozio`,
            metadata: { credits: creditsEur, eurCents },
          },
          tx,
        ),
      );
    }

    if (creditsUsd > 0) {
      entries.push(
        await appendLedger(
          {
            type: "TREASURY_CONVERT_TO_USD",
            amountCredits: creditsUsd,
            fromPocket: "TREASURY",
            toPocket: "BURN",
            actorId: input.actorId,
            eurCents: 0,
            usdCents,
            fiatCurrency: "USD",
            note: `Conversione tesoreria: ${creditsUsd} cr → ${(usdCents / 100).toFixed(2)} USD in cassa negozio`,
            metadata: { credits: creditsUsd, usdCents },
          },
          tx,
        ),
      );
    }

    if (creditsChf > 0) {
      entries.push(
        await appendLedger(
          {
            type: "TREASURY_CONVERT_TO_CHF",
            amountCredits: creditsChf,
            fromPocket: "TREASURY",
            toPocket: "BURN",
            actorId: input.actorId,
            eurCents: 0,
            usdCents: 0,
            chfCents,
            fiatCurrency: "CHF",
            note: `Conversione tesoreria: ${creditsChf} cr → ${(chfCents / 100).toFixed(2)} CHF in cassa negozio`,
            metadata: { credits: creditsChf, chfCents },
          },
          tx,
        ),
      );
    }

    if (creditsCrypto > 0 && cryptoAssetId) {
      const ticker = cryptoAsset(cryptoAssetId)?.ticker ?? cryptoAssetId;
      entries.push(
        await appendLedger(
          {
            type: "TREASURY_CONVERT_TO_CRYPTO",
            amountCredits: creditsCrypto,
            fromPocket: "TREASURY",
            toPocket: "BURN",
            actorId: input.actorId,
            eurCents: 0,
            usdCents: cryptoUsdCents,
            fiatCurrency: "USD",
            note:
              cryptoAssetId === "USDC"
                ? `Conversione tesoreria: ${creditsCrypto} cr → ${(cryptoUsdCents / 100).toFixed(2)} USDC a libro. Non è un invio Circle: deposita USDC vero sul SCA Base.`
                : `Conversione tesoreria: ${creditsCrypto} cr → ${(cryptoUsdCents / 100).toFixed(2)} USD in ${ticker} verso payout diretto`,
            metadata: {
              asset: cryptoAssetId,
              credits: creditsCrypto,
              usdCents: cryptoUsdCents,
              shopAddress: cryptoAssetId === "USDC" ? CIRCLE_SHOP_SCA_ADDRESS : shopPayoutAddress(cryptoAssetId),
            },
          },
          tx,
        ),
      );
    }

    return {
      creditsEur,
      creditsUsd,
      creditsChf,
      creditsCrypto,
      cryptoAsset: cryptoAssetId,
      eurCents,
      usdCents,
      chfCents,
      cryptoUsdCents,
      entries,
    };
  });

  const { rememberBookOp } = await import("@/lib/book-proof-store");
  for (const entry of converted.entries) {
    if (
      entry.type === "MINT" ||
      entry.type === "TREASURY_CONVERT_TO_EUR" ||
      entry.type === "TREASURY_CONVERT_TO_USD" ||
      entry.type === "TREASURY_CONVERT_TO_CHF" ||
      entry.type === "TREASURY_CONVERT_TO_CRYPTO"
    ) {
      await rememberBookOp({
        v: 1,
        id: entry.id,
        type: entry.type,
        amountCredits: entry.amountCredits,
        eurCents: entry.eurCents,
        usdCents: entry.usdCents,
        chfCents: entry.chfCents,
        asset: cryptoAssetId,
        note: entry.note ?? "",
        actorId: input.actorId,
        createdAt: entry.createdAt.toISOString(),
      });
    }
  }
  return converted;
}
