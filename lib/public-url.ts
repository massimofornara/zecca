import "@/lib/boot-env";

function vercelHttpsOrigin() {
  const host = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_URL ||
    ""
  ).trim();
  if (!host) return "";
  return `https://${host.replace(/^https?:\/\//, "")}`;
}

function isLoopback(origin: string) {
  return /127\.0\.0\.1|localhost/i.test(origin);
}

export function publicOrigin(requestUrl?: string) {
  const fromEnv = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (fromEnv) {
    try {
      const origin = new URL(fromEnv).origin;
      if (process.env.VERCEL && isLoopback(origin)) {
        return vercelHttpsOrigin() || origin;
      }
      return origin;
    } catch {
      /* ignore malformed */
    }
  }
  const vercel = vercelHttpsOrigin();
  if (vercel) return vercel;
  if (requestUrl) return new URL(requestUrl).origin;
  return "";
}

/** Path assolute sul sito. Mai persistere http://127.0.0.1 in produzione. */
export function siteHref(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = publicOrigin();
  if (!origin || (process.env.VERCEL && isLoopback(origin))) return normalized;
  return `${origin}${normalized}`;
}

export function sqliteEphemeral() {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  return Boolean(process.env.VERCEL) && !url.startsWith("postgres");
}
