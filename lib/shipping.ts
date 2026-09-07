import { ZeccaError } from "@/lib/errors";
import { DHL_EXPRESS_24H_CREDITS } from "@/lib/dhl";

export const SHIP_TO = {
  CUSTOMER: "CUSTOMER",
  MASSIMO: "MASSIMO",
} as const;

export type ShipTo = (typeof SHIP_TO)[keyof typeof SHIP_TO];

export const CASA_MASSIMO = {
  name: "Massimo Fornara",
  street: "Casa della Zecca, via del Frantoio 1",
  city: "San Rocco al Forno",
  postal: "18012",
  country: "Italia",
};

export type ShippingInput = {
  shipTo: ShipTo;
  shipName: string;
  shipStreet: string;
  shipCity: string;
  shipPostal: string;
  shipNote?: string | null;
  shipPhone?: string | null;
};

export function parseShipping(formData: FormData): ShippingInput {
  const shipTo = String(formData.get("shipTo") ?? "") === "MASSIMO" ? "MASSIMO" : "CUSTOMER";
  if (shipTo === "MASSIMO") {
    return {
      shipTo,
      shipName: CASA_MASSIMO.name,
      shipStreet: CASA_MASSIMO.street,
      shipCity: CASA_MASSIMO.city,
      shipPostal: CASA_MASSIMO.postal,
      shipNote: String(formData.get("shipNote") ?? "").trim() || null,
      shipPhone: process.env.DHL_SHIPPER_PHONE || "+390184000000",
    };
  }
  return {
    shipTo,
    shipName: String(formData.get("shipName") ?? "").trim(),
    shipStreet: String(formData.get("shipStreet") ?? "").trim(),
    shipCity: String(formData.get("shipCity") ?? "").trim(),
    shipPostal: String(formData.get("shipPostal") ?? "").trim(),
    shipNote: String(formData.get("shipNote") ?? "").trim() || null,
    shipPhone: String(formData.get("shipPhone") ?? "").trim() || null,
  };
}

export function assertShipping(shipping: ShippingInput) {
  if (shipping.shipTo === "MASSIMO") return;
  if (shipping.shipName.length < 2) {
    throw new ZeccaError("Indica il nome di chi riceve il collo.", "INVALID_SHIPPING");
  }
  if (shipping.shipStreet.length < 4) {
    throw new ZeccaError("Indica via e numero civico.", "INVALID_SHIPPING");
  }
  if (shipping.shipCity.length < 2) {
    throw new ZeccaError("Indica la città.", "INVALID_SHIPPING");
  }
  if (!/^\d{5}$/.test(shipping.shipPostal.replace(/\s/g, ""))) {
    throw new ZeccaError("Il CAP deve avere 5 cifre.", "INVALID_SHIPPING");
  }
  const phone = (shipping.shipPhone ?? "").replace(/\s/g, "");
  if (phone.length < 8) {
    throw new ZeccaError("Per DHL Express serve un telefono di chi riceve.", "INVALID_SHIPPING");
  }
}

export function shippingQuote(shipTo: ShipTo) {
  if (shipTo === "MASSIMO") {
    return {
      carrier: "HAND",
      service: "FORNITORE_A_MASSIMO",
      credits: 0,
      label: "I fornitori spediscono a casa di Massimo",
    };
  }
  return {
    carrier: "DHL_EXPRESS",
    service: "EXPRESS_24H",
    credits: DHL_EXPRESS_24H_CREDITS,
    label: "DHL Express 24h",
  };
}

export function formatShipping(shipping: {
  shipTo: string;
  shipName: string | null;
  shipStreet: string | null;
  shipCity: string | null;
  shipPostal: string | null;
}) {
  const who =
    shipping.shipTo === "MASSIMO" ? "Casa di Massimo (San Rocco al Forno)" : "Casa del cliente";
  const lines = [shipping.shipName, shipping.shipStreet, [shipping.shipPostal, shipping.shipCity].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
  return { who, lines };
}
