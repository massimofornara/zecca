import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ZeccaError } from "@/lib/errors";
import { appendLedger, pocketBalance } from "@/lib/zecca/ledger";
import { bookDhlExpress24h, fetchDhlTracking, shipProgress } from "@/lib/dhl";
import { assertShipping, shippingQuote, type ShippingInput } from "@/lib/shipping";

export type CartLine = { productId: string; quantity: number };

const orderInclude = {
  items: { include: { product: { include: { supplier: true } } } },
  shipments: { include: { supplier: true, items: { include: { product: true } } } },
  user: true,
} satisfies Prisma.OrderInclude;

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
      include: { supplier: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let total = 0;
    const lines: {
      productId: string;
      quantity: number;
      unitCredits: number;
      name: string;
      supplierId: string;
    }[] = [];

    for (const item of cleaned) {
      const product = byId.get(item.productId);
      if (!product || !product.active) {
        throw new ZeccaError("Uno dei pezzi non è più in vetrina.", "PRODUCT_GONE");
      }
      if (!product.supplierId || !product.supplier) {
        throw new ZeccaError(
          `«${product.name}» non ha un fornitore. Massimo non imballa: serve l’azienda che lo produce.`,
          "NO_SUPPLIER",
        );
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
        supplierId: product.supplierId,
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
        ? "I fornitori spediscono a casa di Massimo, San Rocco al Forno"
        : `I fornitori spediscono con DHL Express 24h a ${input.shipping.shipName}, ${input.shipping.shipCity}`;

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
        shipStatus: "AWAITING_SUPPLIER",
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCredits: l.unitCredits,
          })),
        },
      },
      include: { items: { include: { product: { include: { supplier: true } } } } },
    });

    await createShipmentsForOrder(created.id, tx);

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
      include: orderInclude,
    });
  });

  return fulfillSupplierShipments(order.id, db);
}

export async function createShipmentsForOrder(
  orderId: string,
  db: PrismaClient | Prisma.TransactionClient,
) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: { include: { supplier: true } } } }, shipments: true },
  });
  if (order.shipments.length > 0) return order.shipments;

  const grouped = new Map<string, typeof order.items>();
  for (const item of order.items) {
    const supplierId = item.product.supplierId;
    if (!supplierId || !item.product.supplier) {
      throw new ZeccaError("Un pezzo dell’ordine è senza fornitore.", "NO_SUPPLIER");
    }
    const list = grouped.get(supplierId) ?? [];
    list.push(item);
    grouped.set(supplierId, list);
  }

  const created = [];
  let first = true;
  for (const [supplierId, items] of grouped) {
    const supplier = items[0].product.supplier!;
    const inherit = first && order.trackingNumber;
    first = false;
    const shipment = await db.shipment.create({
      data: {
        orderId: order.id,
        supplierId,
        supplierName: supplier.name,
        supplierStreet: supplier.street,
        supplierCity: supplier.city,
        supplierPostal: supplier.postal,
        supplierPhone: supplier.phone,
        supplierEmail: supplier.email,
        trackingNumber: inherit ? order.trackingNumber : null,
        trackingUrl: inherit ? order.trackingUrl : null,
        dhlMessage: inherit
          ? order.dhlMessage
          : `${supplier.name} imballa a ${supplier.city}. Massimo non tocca il collo.`,
        dhlTrackStatus: inherit ? order.dhlTrackStatus : "In preparazione dal fornitore",
        dhlTrackDetail: inherit
          ? order.dhlTrackDetail
          : `${supplier.name} prepara il collo nella sua sede.`,
        dhlTrackedAt: inherit ? order.dhlTrackedAt : null,
        shipStatus: order.shipStatus === "SHIPPED" ? "SHIPPED" : "AWAITING_SUPPLIER",
        items: { connect: items.map((item) => ({ id: item.id })) },
      },
    });
    created.push(shipment);
  }
  return created;
}

export async function fulfillSupplierShipments(orderId: string, db: PrismaClient = defaultPrisma) {
  await createShipmentsForOrder(orderId, db);
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      shipments: { include: { items: { include: { product: true } }, supplier: true } },
      user: true,
    },
  });

  for (const shipment of order.shipments) {
    try {
      const booking = await bookDhlExpress24h({
        orderRef: `${order.id.slice(-6).toUpperCase()}-${shipment.supplierName.slice(0, 8).toUpperCase()}`,
        shipper: {
          name: shipment.supplierName,
          company: shipment.supplier.company,
          street: shipment.supplierStreet,
          city: shipment.supplierCity,
          postal: shipment.supplierPostal,
          phone: shipment.supplierPhone,
          email: shipment.supplierEmail,
        },
        receiver: {
          name: order.shipName ?? "Cliente",
          street: order.shipStreet ?? "",
          city: order.shipCity ?? "",
          postal: order.shipPostal ?? "",
          phone: order.shipPhone,
          email: order.user.email,
        },
        description: shipment.items.map((i) => i.product.name).join(", "),
      });
      await db.shipment.update({
        where: { id: shipment.id },
        data: {
          trackingNumber: booking.trackingNumber,
          trackingUrl: booking.trackingUrl,
          dhlShipmentId: booking.shipmentId,
          dhlMessage: booking.message,
          dhlLabelPath: booking.labelPath,
          dhlTrackStatus: booking.trackStatus,
          dhlTrackDetail: booking.trackDetail,
          dhlTrackedAt: new Date(),
          shipStatus: booking.pickupRequested ? "BOOKED" : "AWAITING_SUPPLIER",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prenotazione DHL non riuscita.";
      await db.shipment.update({
        where: { id: shipment.id },
        data: { dhlMessage: message, shipStatus: "AWAITING_SUPPLIER" },
      });
    }
  }

  return syncOrderFromShipments(orderId, db);
}

export async function fulfillDhlOrder(orderId: string, db: PrismaClient = defaultPrisma) {
  return fulfillSupplierShipments(orderId, db);
}

async function syncOrderFromShipments(orderId: string, db: PrismaClient = defaultPrisma) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { shipments: true },
  });
  const primary = order.shipments[0];
  const allShipped = order.shipments.length > 0 && order.shipments.every((s) => s.shipStatus === "SHIPPED");
  const anyBooked = order.shipments.some((s) => s.shipStatus === "BOOKED" || s.shipStatus === "SHIPPED");
  return db.order.update({
    where: { id: orderId },
    data: {
      trackingNumber: primary?.trackingNumber ?? order.trackingNumber,
      trackingUrl: primary?.trackingUrl ?? order.trackingUrl,
      dhlShipmentId: primary?.dhlShipmentId ?? order.dhlShipmentId,
      dhlMessage: order.shipments.map((s) => `${s.supplierName}: ${s.dhlMessage || s.shipStatus}`).join(" · "),
      dhlLabelPath: primary?.dhlLabelPath ?? order.dhlLabelPath,
      dhlTrackStatus: primary?.dhlTrackStatus ?? order.dhlTrackStatus,
      dhlTrackDetail: primary?.dhlTrackDetail ?? order.dhlTrackDetail,
      dhlTrackedAt: primary?.dhlTrackedAt ?? order.dhlTrackedAt,
      shipStatus: allShipped ? "SHIPPED" : anyBooked ? "BOOKED" : "AWAITING_SUPPLIER",
      shippedAt: allShipped ? new Date() : order.shippedAt,
    },
    include: orderInclude,
  });
}

export async function refreshOrderTracking(orderId: string, db: PrismaClient = defaultPrisma) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { shipments: true },
  });
  if (order.shipments.length === 0) {
    const local = shipProgress(order);
    return db.order.update({
      where: { id: order.id },
      data: {
        dhlTrackStatus: local.status,
        dhlTrackDetail: local.detail,
        dhlTrackedAt: new Date(),
      },
      include: orderInclude,
    });
  }

  for (const shipment of order.shipments) {
    if (!shipment.trackingNumber) {
      const local = shipProgress(shipment);
      await db.shipment.update({
        where: { id: shipment.id },
        data: {
          dhlTrackStatus: local.status,
          dhlTrackDetail: local.detail,
          dhlTrackedAt: new Date(),
        },
      });
      continue;
    }
    try {
      const track = await fetchDhlTracking(shipment.trackingNumber);
      await db.shipment.update({
        where: { id: shipment.id },
        data: {
          dhlTrackStatus: track.status,
          dhlTrackDetail: track.detail,
          dhlTrackedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tracking DHL non disponibile.";
      const local = shipProgress(shipment);
      await db.shipment.update({
        where: { id: shipment.id },
        data: {
          dhlMessage: message,
          dhlTrackStatus: local.status,
          dhlTrackDetail: local.detail,
          dhlTrackedAt: new Date(),
        },
      });
    }
  }

  return syncOrderFromShipments(orderId, db);
}

export async function markSupplierShipped(orderId: string, db: PrismaClient = defaultPrisma) {
  await db.shipment.updateMany({
    where: { orderId },
    data: {
      shipStatus: "SHIPPED",
      shippedAt: new Date(),
      dhlTrackStatus: "Ritiro avvenuto dal fornitore",
      dhlTrackDetail: "Il produttore ha consegnato il collo a DHL. Massimo non ha imballato.",
      dhlTrackedAt: new Date(),
    },
  });
  return syncOrderFromShipments(orderId, db);
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
