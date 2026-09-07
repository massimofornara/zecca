import { ZeccaError } from "@/lib/errors";

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
    };
  }
  return {
    shipTo,
    shipName: String(formData.get("shipName") ?? "").trim(),
    shipStreet: String(formData.get("shipStreet") ?? "").trim(),
    shipCity: String(formData.get("shipCity") ?? "").trim(),
    shipPostal: String(formData.get("shipPostal") ?? "").trim(),
    shipNote: String(formData.get("shipNote") ?? "").trim() || null,
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
