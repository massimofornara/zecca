import { createHash } from "node:crypto";

function bootAuthSecret() {
  const current = process.env.AUTH_SECRET?.trim();
  if (current && current.length >= 32) return;
  const material = [
    process.env.VERCEL_PROJECT_ID,
    process.env.VERCEL_URL,
    process.env.AUTH_URL,
    "zecca-auth-bootstrap",
  ]
    .filter(Boolean)
    .join(":");
  process.env.AUTH_SECRET = createHash("sha256").update(material).digest("hex");
}

function bootPublicUrl() {
  if (process.env.AUTH_URL?.trim()) return;
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_URL;
  if (!host) return;
  const url = host.startsWith("http") ? host : `https://${host}`;
  process.env.AUTH_URL = url;
  process.env.NEXTAUTH_URL ??= url;
}

process.env.AUTH_TRUST_HOST ??= "true";
bootAuthSecret();
bootPublicUrl();
