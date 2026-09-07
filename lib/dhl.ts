export type DhlShipper = {
  name: string;
  company: string;
  street: string;
  city: string;
  postal: string;
  phone?: string | null;
  email?: string | null;
};

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
  labelPath: string | null;
  trackStatus: string;
  trackDetail: string;
};

export type DhlTrack = {
  status: string;
  detail: string;
  live: boolean;
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
  shipper: DhlShipper;
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
      message: `Lettera di vettura DHL Express 24h preparata per ${input.shipper.company}. Manca il contratto DHL per il ritiro vero dalla sede del fornitore.`,
      labelPath: null,
      trackStatus: "In preparazione dal fornitore",
      trackDetail: `${input.shipper.name} imballa a ${input.shipper.city}. Massimo non tocca il collo.`,
    };
  }

  const shipperStreet = splitStreet(input.shipper.street);
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
          postalCode: input.shipper.postal,
          cityName: input.shipper.city,
          countryCode: "IT",
          addressLine1: shipperStreet.addressLine1,
          addressLine2: shipperStreet.addressLine2,
        },
        contactInformation: {
          fullName: input.shipper.name,
          companyName: input.shipper.company,
          phone: input.shipper.phone || process.env.DHL_SHIPPER_PHONE || "+390184000000",
          email: input.shipper.email || process.env.DHL_SHIPPER_EMAIL || "massimo@zecca.local",
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
    outputImageProperties: {
      printerDPI: 300,
      encodingFormat: "pdf",
      imageOptions: [
        {
          typeCode: "label",
          templateName: "ECOM26_84_001",
          isRequested: true,
          hideAccountNumber: true,
        },
      ],
    },
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
    documents?: { typeCode?: string; content?: string; imageFormat?: string }[];
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

  const labelPath = await saveDhlLabel(trackingNumber, payload.documents);

  return {
    live: isDhlLive(),
    trackingNumber,
    trackingUrl: dhlTrackingUrl(trackingNumber),
    shipmentId: trackingNumber,
    pickupRequested: true,
    message: isDhlLive()
      ? `Ritiro DHL Express 24h prenotato presso ${input.shipper.company}. Il fornitore deve avere il collo pronto.`
      : "Spedizione creata sull’ambiente di test DHL (non è un ritiro sul serio).",
    labelPath,
    trackStatus: isDhlLive() ? "Ritiro prenotato dal fornitore" : "Prenotata in test DHL",
    trackDetail: isDhlLive()
      ? `DHL passa da ${input.shipper.city}. Massimo non imballa.`
      : `Ambiente di test: nessuna furgone arriva da ${input.shipper.city}.`,
  };
}

async function saveDhlLabel(
  trackingNumber: string,
  documents?: { typeCode?: string; content?: string }[],
) {
  const label = documents?.find((doc) => doc.typeCode === "label" && doc.content);
  if (!label?.content) return null;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "public", "labels");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${trackingNumber.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
  await fs.writeFile(path.join(dir, filename), Buffer.from(label.content, "base64"));
  return `/labels/${filename}`;
}

export async function fetchDhlTracking(trackingNumber: string): Promise<DhlTrack> {
  if (!isDhlConfigured()) {
    return {
      live: false,
      status: "In preparazione",
      detail: "Senza contratto DHL lo stato resta quello del fornitore.",
    };
  }

  const base = isDhlLive() ? LIVE_BASE : TEST_BASE;
  const response = await fetch(
    `${base}/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
    {
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
      },
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    shipments?: {
      status?: string;
      events?: { description?: string; timestamp?: string; typeCode?: string }[];
    }[];
    detail?: string;
    message?: string;
  };

  if (!response.ok) {
    const reason = payload.detail || payload.message || `HTTP ${response.status}`;
    throw new Error(`DHL non ha restituito il tracking: ${reason}`);
  }

  const shipment = payload.shipments?.[0];
  const latest = shipment?.events?.[0];
  return {
    live: isDhlLive(),
    status: latest?.description || shipment?.status || "Aggiornato da DHL",
    detail: latest?.timestamp
      ? `Ultimo evento DHL: ${latest.timestamp}${latest.typeCode ? ` (${latest.typeCode})` : ""}`
      : "Nessun evento ancora sul collo.",
  };
}

export function shipProgress(order: {
  carrier: string;
  shipStatus: string;
  shipTo?: string;
  dhlTrackStatus?: string | null;
  dhlTrackDetail?: string | null;
}) {
  if (order.dhlTrackStatus) {
    return {
      status: order.dhlTrackStatus,
      detail: order.dhlTrackDetail || "Stato dal fornitore o da DHL.",
    };
  }
  if (order.shipStatus === "SHIPPED") {
    return {
      status: "In viaggio",
      detail:
        order.shipTo === "MASSIMO"
          ? "Il fornitore ha spedito verso casa di Massimo."
          : "Il fornitore ha consegnato il collo a DHL.",
    };
  }
  if (order.shipStatus === "BOOKED") {
    return { status: "Ritiro prenotato", detail: "DHL passa dalla sede del fornitore." };
  }
  return {
    status: "In preparazione dal fornitore",
    detail: "Chi produce il pezzo imballa. Massimo non tocca il collo.",
  };
}
