import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { getLiveReport } from "../lib/live";

loadEnvConfig(process.cwd());

const report = getLiveReport();
console.log("Zecca — stato fondi\n");
for (const check of report.checks) {
  console.log(`${check.ok ? "[ok]" : "[manca]"} ${check.title}`);
  console.log(`       ${check.detail}`);
}
console.log("");
console.log(
  report.readyForLive
    ? "Pronto per carte live (Stripe live + webhook + HTTPS + segreto). I bonifici restano tuoi."
    : report.readyForCardPayments
      ? "Pronto per carte in test Stripe. Per il live servono sk_live_, webhook live e AUTH_URL https."
      : "Ancora dimostrativo: senza chiavi Stripe nessun euro entra.",
);
console.log("");
console.log("Suggerimento AUTH_SECRET (copialo tu nel .env, non in chat):");
console.log(randomBytes(32).toString("base64url"));
process.exit(report.readyForCardPayments ? 0 : 2);
