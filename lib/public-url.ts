export function publicOrigin(requestUrl?: string) {
  const fromEnv = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* ignore malformed */
    }
  }
  const vercelHost = (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, "")}`;
  }
  if (requestUrl) return new URL(requestUrl).origin;
  return "";
}
