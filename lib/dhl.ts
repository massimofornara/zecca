import { CASA_MASSIMO } from "@/lib/shipping";

const TEST_BASE = "https://express.api.dhl.com/mydhlapi/test";
const LIVE_BASE = "https://express.api.dhl.com/mydhlapi";

export const DHL_EXPRESS_24H_CREDITS = 18;

export function isDhlConfigured() {
  return Boolean(
    process.env.DHL_API_KEY &&
      process.env.DHL_API_SECRET &&
      process.env.DHL_ACCOUNT_NUMBER,
  );
}

export function isDhlLive() {
  return process.env.DHL_LIVE === "1";
}

export function dhlTrackingUrl(trackingNumber: string) {
  return `https://www.dhl.com/it-it/home/tracking.html?tracking-id=${encodeURIComponent(trackingNumber)}`;
}

export type DhlAddress = {
  name: string;
  street: string;
  city: string;
  postal: string;
  phone?: string | null;
  email?: string | null;
};

export type DhlBooking = {
  live: boolean;
  trackingNumber: string;
  trackingUrl: string;
  shipmentId: string | null;
  pickupRequested: boolean;
  message: string;
};

function authHeader() {
  const raw = `${process.env.DHL_API_KEY}:${process.env.DHL_API_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

function splitStreet(street: string) {
  const match = street.trim().match(/^(.*?)(?:\s+(\d+\w*))?$/);
  return {
    addressLine1: match?.[1] || street,
    addressLine2: match?.[2] || "1",
  };
}

function plannedPickup() {
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(10, 0, 0, 0);
  const offset = -when.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offset) % 60).padStart(2, "0");
  const iso = when.toISOString().slice(0, 19);
  return `${iso}GMT${sign}${hh}:${mm}`;
}

export async function bookDhlExpress24h(input: {
  orderRef: string;
  receiver: DhlAddress;
  description: string;
}): Promise<DhlBooking> {
  if (!isDhlConfigured()) {
    const trackingNumber = `JD14${Date.now().toString().slice(-10)}`;
    return {
      live: false,
      trackingNumber,
      trackingUrl: dhlTrackingUrl(trackingNumber),
      shipmentId: null,
      pickupRequested: false,
      message:
        "Lettera di vettura DHL Express 24h preparata in locale. Manca il contratto DHL (DHL_API_KEY, DHL_API_SECRET, DHL_ACCOUNT_NUMBER) per il ritiro vero.",
    };
  }

  const shipperStreet = splitStreet(CASA_MASSIMO.street);
  const receiverStreet = splitStreet(input.receiver.street);
  const body = {
    plannedShippingDateAndTime: plannedPickup(),
    pickup: {
      isRequested: true,
      closeTime: "18:00",
      location: "reception",
    },
    productCode: "N",
    accounts: [{ typeCode: "shipper", number: process.env.DHL_ACCOUNT_NUMBER }],
    customerDetails: {
      shipperDetails: {
        postalAddress: {
          postalCode: CASA_MASSIMO.postal,
          cityName: CASA_MASSIMO.city,
          countryCode: "IT",
          addressLine1: shipperStreet.addressLine1,
          addressLine2: shipperStreet.addressLine2,
        },
        contactInformation: {
          fullName: CASA_MASSIMO.name,
          companyName: "Zecca",
          phone: process.env.DHL_SHIPPER_PHONE || "+390184000000",
          email: process.env.DHL_SHIPPER_EMAIL || "massimo@zecca.local",
        },
      },
      receiverDetails: {
        postalAddress: {
          postalCode: input.receiver.postal.replace(/\s/g, ""),
          cityName: input.receiver.city,
          countryCode: "IT",
          addressLine1: receiverStreet.addressLine1,
          addressLine2: receiverStreet.addressLine2,
        },
        contactInformation: {
          fullName: input.receiver.name,
          phone: input.receiver.phone || process.env.DHL_SHIPPER_PHONE || "+390184000000",
          email: input.receiver.email || undefined,
        },
      },
    },
    content: {
      packages: [
        {
          weight: 1.2,
          dimensions: { length: 30, width: 20, height: 12 },
        },
      ],
      isCustomsDeclarable: false,
      description: input.description.slice(0, 70) || "Merce della bottega Zecca",
      incoterm: "DAP",
      unitOfMeasurement: "metric",
    },
    valueAddedServices: [{ serviceCode: "TK" }],
    customerReferences: [{ value: input.orderRef, typeCode: "CU" }],
  };

  const base = isDhlLive() ? LIVE_BASE : TEST_BASE;
  const response = await fetch(`${base}/shipments?strictValidation=true`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    shipmentTrackingNumber?: string;
    packages?: { trackingNumber?: string }[];
    detail?: string;
    message?: string;
    title?: string;
  };

  if (!response.ok) {
    const reason = payload.detail || payload.message || payload.title || `HTTP ${response.status}`;
    throw new Error(`DHL ha rifiutato la prenotazione: ${reason}`);
  }

  const trackingNumber =
    payload.shipmentTrackingNumber || payload.packages?.[0]?.trackingNumber || "";
  if (!trackingNumber) {
    throw new Error("DHL ha accettato la chiamata ma non ha restituito il tracking.");
  }

  return {
    live: isDhlLive(),
    trackingNumber,
    trackingUrl: dhlTrackingUrl(trackingNumber),
    shipmentId: trackingNumber,
    pickupRequested: true,
    message: isDhlLive()
      ? "Ritiro DHL Express 24h prenotato. Massimo deve avere il collo pronto."
      : "Spedizione creata sull’ambiente di test DHL (non è un ritiro sul serio).",
  };
}
