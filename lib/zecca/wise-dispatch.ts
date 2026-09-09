/**
 * Disposizione Wise: solo se ci sono token veri.
 * Senza WISE_API_TOKEN + WISE_PROFILE_ID non parte nulla e non si inventa un ID.
 */

export type WiseApiConfig = {
  token: string;
  profileId: string;
  host: string;
};

export type WiseDispatchResult =
  | { ok: true; transferId: string }
  | { ok: false; code: string; message: string };

export function wiseApiConfig(): WiseApiConfig | null {
  const token = process.env.WISE_API_TOKEN?.trim();
  const profileId = process.env.WISE_PROFILE_ID?.trim();
  if (!token || !profileId) return null;
  const host = (process.env.WISE_API_HOST?.trim() || "https://api.wise.com").replace(/\/$/, "");
  return { token, profileId, host };
}

export function wiseDispatchBlocker(): string | null {
  if (wiseApiConfig()) return null;
  return "WISE_API_TOKEN e WISE_PROFILE_ID assenti: Zecca non può prendere in carico un bonifico Wise. Serve il token API del conto NeoNoble, oppure il bonifico dal home banking e il CRO incollato qui.";
}

/**
 * Prova a creare un trasferimento Wise. Senza config torna null (nessun ID finto).
 * Con config, verifica il token; non crea il payout se manca il destinatario Wise già anagrafato.
 */
export async function tryWisePayout(input: {
  currency: "USD" | "CHF";
  amountCents: number;
  iban: string;
  holder: string;
  reference: string;
}): Promise<WiseDispatchResult | null> {
  const cfg = wiseApiConfig();
  if (!cfg) return null;
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message: "Importo Wise non valido.",
    };
  }

  try {
    const profiles = await fetch(`${cfg.host}/v1/profiles`, {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/json",
      },
    });
    if (!profiles.ok) {
      return {
        ok: false,
        code: "WISE_AUTH",
        message: `Wise ha rifiutato il token (HTTP ${profiles.status}). Nessun ID transazione inventato.`,
      };
    }
  } catch {
    return {
      ok: false,
      code: "WISE_UNREACHABLE",
      message: "Wise non raggiungibile da questo runtime. Nessun ID transazione inventato.",
    };
  }

  return {
    ok: false,
    code: "WISE_RECIPIENT_NOT_WIRED",
    message: `Token Wise valido, ma il destinatario ${input.holder} ${input.iban} non è collegato come recipient API. Completa l’anagrafica Wise (recipient + quote + fund) oppure disponi il bonifico dal home banking e incolla l’ID. Riferimento libro: ${input.reference}.`,
  };
}
