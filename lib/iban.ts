export function normalizeIban(raw: string) {
  return raw.replace(/[\s.-]+/g, "").toUpperCase();
}

export function isValidIban(raw: string) {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("IT") && iban.length !== 27) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of digits) {
    rest = (rest * 10 + Number(ch)) % 97;
  }
  return rest === 1;
}

export function formatIbanDisplay(raw: string) {
  const iban = normalizeIban(raw);
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export function isItalianIban(raw: string) {
  const iban = normalizeIban(raw);
  return iban.startsWith("IT") && iban.length === 27 && isValidIban(iban);
}

export function maskIban(raw: string) {
  const iban = normalizeIban(raw);
  if (iban.length < 10) return iban ? "••••" : "";
  return `${iban.slice(0, 4)}••••••••••••${iban.slice(-4)}`;
}

export function normalizeBic(raw: string) {
  return raw.replace(/[\s.-]+/g, "").toUpperCase();
}

export function isValidBic(raw: string) {
  const bic = normalizeBic(raw);
  if (!bic) return true;
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
}
