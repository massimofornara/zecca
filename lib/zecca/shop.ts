import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { bookDhlExpress24h, fetchDhlTracking, shipProgress } from "@/lib/dhl";
import { assertShipping, shippingQuote, type ShippingInput } from "@/lib/shipping";

export type CartLine = { productId: string; quantity: number };

export async function placeOrder(input: {
  userId: string;
  items: CartLine[];
  shipping: ShippingInput;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const cleaned = input.items
    .map((i) => ({ productId: i.productId, quantity: Math.floor(i.quantity) }))
    .filter((i) => i.quantity > 0);

  if (cleaned.length === 0) {
    throw new ZeccaError("Il carrello è vuoto.", "EMPTY_CART");
  }
  assertShipping(input.shipping);
  const quote = shippingQuote(input.shipping.shipTo);

  const order = await db.$transaction(async (tx) => {
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

    const payable = total + quote.credits;
    const wallet = await pocketBalance("USER", input.userId, tx);
    if (wallet < payable) {
      throw new ZeccaError(
        `Crediti insufficienti. Ti servono ${payable} cr (merce + ${quote.label}), ne hai ${wallet}.`,
        "INSUFFICIENT_CREDITS",
      );
    }

    const destNote =
      input.shipping.shipTo === "MASSIMO"
        ? "Consegna in casa di Massimo, San Rocco al Forno"
        : `DHL Express 24h a ${input.shipping.shipName}, ${input.shipping.shipCity}`;

    const created = await tx.order.create({
      data: {
        userId: input.userId,
        totalCredits: payable,
        status: "PAID",
        shipTo: input.shipping.shipTo,
        shipName: input.shipping.shipName,
        shipStreet: input.shipping.shipStreet,
        shipCity: input.shipping.shipCity,
        shipPostal: input.shipping.shipPostal,
        shipNote: input.shipping.shipNote,
        shipPhone: input.shipping.shipPhone,
        carrier: quote.carrier,
        service: quote.service,
        shippingCredits: quote.credits,
        shipStatus: quote.carrier === "DHL_EXPRESS" ? "TO_PACK" : "SHIPPED",
        shippedAt: quote.carrier === "HAND" ? new Date() : null,
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
        amountCredits: payable,
        fromPocket: "USER",
        toPocket: "BURN",
        fromUserId: input.userId,
        actorId: input.userId,
        orderId: created.id,
        note: `Ordine ${created.id.slice(-6).toUpperCase()}: ${lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}. ${destNote}`,
      },
      tx,
    );

    return tx.order.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: { include: { product: true } } },
    });
  });

  if (order.carrier === "DHL_EXPRESS") {
    return fulfillDhlOrder(order.id, db);
  }
  return order;
}

export async function fulfillDhlOrder(orderId: string, db: PrismaClient = defaultPrisma) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: true } }, user: true },
  });
  if (order.carrier !== "DHL_EXPRESS") return order;
  try {
    const booking = await bookDhlExpress24h({
      orderRef: order.id.slice(-8).toUpperCase(),
      receiver: {
        name: order.shipName ?? "Cliente",
        street: order.shipStreet ?? "",
        city: order.shipCity ?? "",
        postal: order.shipPostal ?? "",
        phone: order.shipPhone,
        email: order.user.email,
      },
      description: order.items.map((i) => i.product.name).join(", "),
    });
    return db.order.update({
      where: { id: order.id },
      data: {
        trackingNumber: booking.trackingNumber,
        trackingUrl: booking.trackingUrl,
        dhlShipmentId: booking.shipmentId,
        dhlMessage: booking.message,
        dhlLabelPath: booking.labelPath,
        dhlTrackStatus: booking.trackStatus,
        dhlTrackDetail: booking.trackDetail,
        dhlTrackedAt: new Date(),
        shipStatus: booking.pickupRequested ? "BOOKED" : "TO_PACK",
      },
      include: { items: { include: { product: true } }, user: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prenotazione DHL non riuscita.";
    return db.order.update({
      where: { id: order.id },
      data: { dhlMessage: message, shipStatus: "TO_PACK" },
      include: { items: { include: { product: true } }, user: true },
    });
  }
}

export async function refreshOrderTracking(orderId: string, db: PrismaClient = defaultPrisma) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.carrier !== "DHL_EXPRESS" || !order.trackingNumber) {
    const local = shipProgress(order);
    return db.order.update({
      where: { id: order.id },
      data: {
        dhlTrackStatus: local.status,
        dhlTrackDetail: local.detail,
        dhlTrackedAt: new Date(),
      },
      include: { items: { include: { product: true } }, user: true },
    });
  }

  try {
    const track = await fetchDhlTracking(order.trackingNumber);
    return db.order.update({
      where: { id: order.id },
      data: {
        dhlTrackStatus: track.status,
        dhlTrackDetail: track.detail,
        dhlTrackedAt: new Date(),
      },
      include: { items: { include: { product: true } }, user: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracking DHL non disponibile.";
    const local = shipProgress(order);
    return db.order.update({
      where: { id: order.id },
      data: {
        dhlMessage: message,
        dhlTrackStatus: local.status,
        dhlTrackDetail: local.detail,
        dhlTrackedAt: new Date(),
      },
      include: { items: { include: { product: true } }, user: true },
    });
  }
}

export async function lastCustomerAddress(userId: string, db: PrismaClient = defaultPrisma) {
  const previous = await db.order.findFirst({
    where: { userId, shipTo: "CUSTOMER", shipStreet: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!previous?.shipName || !previous.shipStreet || !previous.shipCity || !previous.shipPostal) {
    return null;
  }
  return {
    shipName: previous.shipName,
    shipStreet: previous.shipStreet,
    shipCity: previous.shipCity,
    shipPostal: previous.shipPostal,
    shipPhone: previous.shipPhone ?? "",
  };
}
