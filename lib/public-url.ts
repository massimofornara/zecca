export function publicOrigin(requestUrl?: string) {
  const fromEnv = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* ignore malformed */
    }
  }
  if (requestUrl) return new URL(requestUrl).origin;
  return "";
}
