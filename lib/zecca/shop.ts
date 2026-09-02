import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";

export type CartLine = { productId: string; quantity: number };

export async function placeOrder(input: {
  userId: string;
  items: CartLine[];
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const cleaned = input.items
    .map((i) => ({ productId: i.productId, quantity: Math.floor(i.quantity) }))
    .filter((i) => i.quantity > 0);

  if (cleaned.length === 0) {
    throw new ZeccaError("Il carrello è vuoto.", "EMPTY_CART");
  }

  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: cleaned.map((i) => i.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let total = 0;
    const lines: { productId: string; quantity: number; unitCredits: number; name: string }[] =
      [];

    for (const item of cleaned) {
      const product = byId.get(item.productId);
      if (!product || !product.active) {
        throw new ZeccaError("Uno dei pezzi non è più in vetrina.", "PRODUCT_GONE");
      }
      if (product.stock < item.quantity) {
        throw new ZeccaError(
          `Scorte insufficienti per «${product.name}». Ne restano ${product.stock}.`,
          "OUT_OF_STOCK",
        );
      }
      total += product.priceCredits * item.quantity;
      lines.push({
        productId: product.id,
        quantity: item.quantity,
        unitCredits: product.priceCredits,
        name: product.name,
      });
    }

    const wallet = await pocketBalance("USER", input.userId, tx);
    if (wallet < total) {
      throw new ZeccaError(
        `Crediti insufficienti. Ti servono ${total} cr, ne hai ${wallet}.`,
        "INSUFFICIENT_CREDITS",
      );
    }

    const order = await tx.order.create({
      data: {
        userId: input.userId,
        totalCredits: total,
        status: "PAID",
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCredits: l.unitCredits,
          })),
        },
      },
    });

    for (const line of lines) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { decrement: line.quantity } },
      });
    }

    await appendLedger(
      {
        type: "SPEND_ON_ORDER",
        amountCredits: total,
        fromPocket: "USER",
        toPocket: "BURN",
        fromUserId: input.userId,
        actorId: input.userId,
        orderId: order.id,
        note: `Ordine ${order.id.slice(-6).toUpperCase()}: ${lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}`,
      },
      tx,
    );

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: { include: { product: true } } },
    });
  });
}
