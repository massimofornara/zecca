import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { getLiveReport } from "../lib/live";

loadEnvConfig(process.cwd());

const report = await getLiveReport();
console.log("Zecca — stato fondi\n");
for (const check of report.checks) {
  console.log(`${check.ok ? "[ok]" : "[manca]"} ${check.title}`);
  console.log(`       ${check.detail}`);
}
console.log("");
console.log(
  report.readyForLive
    ? "Bonifico SEPA pronto: i clienti versano sul tuo IBAN, tu confermi. Stripe non serve."
    : report.readyForCardPayments
      ? "Carte Stripe in test. Per i soldi veri imposta l’IBAN in Zecchiere → Versamenti."
      : "Ancora dimostrativo: senza IBAN della zecca nessun euro entra.",
);
console.log("");
console.log("Suggerimento AUTH_SECRET (copialo tu nel .env, non in chat):");
console.log(randomBytes(32).toString("base64url"));
process.exit(report.readyForLive || report.readyForCardPayments ? 0 : 2);
