# Zecca

Zecca è una **zecca + bottega**. Massimo Fornara, lo zecchiere, è l’unico che può **coniare** crediti. I clienti comprano quei crediti in euro, li spendono in vetrina su oggetti della casa, e possono **prelevarli** verso un conto bancario o un wallet.

Non è un e-commerce a punti. I crediti vivono in un **libro mastro** immutabile. Non c’è una blockchain.

## Idea

1. **Conio** — Massimo scrive **qualsiasi quantità positiva**: i crediti nascono in tesoreria. Non sono euro di banca.
2. **Acquisto crediti** — Il cliente versa euro (demo o Stripe) e riceve crediti dalla tesoreria.
3. **Bottega** — Pezzi di massima fattura, pagati in crediti. Si spediscono a casa del cliente o a casa di Massimo (San Rocco al Forno). Ogni spesa di **oggi** (confine di calendario `Europe/Rome`) scalda la forgia.
4. **Forgia del Giorno** — Il calore di oggi dipende da quanto hai comprato *nella giornata*. A mezzanotte romana si azzera. Non blocca più il prelievo.
5. **Prelievo clienti** — Chiunque abbia crediti può chiedere euro verso **IBAN** o **wallet**. Massimo segna pagato dopo il bonifico o l’invio dal suo wallet (in demo: chiude il movimento). L’app non spedisce da sola.
6. **Conversione tesoreria** — Massimo converte crediti ancora in casa in **euro e/o dollari della cassa negozio**. È un movimento contabile: non è un prelievo personale e non accredita un conto bancario.

Soglie predefinite (modificabili da Massimo):

| Spesa oggi | Quota forgiata |
| --- | --- |
| 0–49 cr | 0% |
| 50–149 cr | 20% |
| 150–299 cr | 40% |
| 300+ cr | 70% |

Tassi iniziali (modificabili in **Zecchiere → Forgia**): **1 credito = 1,00 EUR** e **1 credito = 1,08 USD**. Sono due prezzi indipendenti, non un cambio EUR/USD derivato.

## Avvio

Serve **Node.js** (18 o successivo). I comandi vanno lanciati **nella cartella del progetto**, quella che contiene `package.json` — non sul Desktop e non in una cartella vuota.

1. Crea il repository (pulsante **Create repo** nell’agente, se non l’hai ancora fatto) e copialo in locale:

```bash
git clone <url-del-repo> zecca
cd zecca
```

2. Copia l’ambiente e avvia:

```bash
copy .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Su macOS/Linux usa `cp .env.example .env` al posto di `copy`.

Se `npm` risponde `Could not read package.json` / `ENOENT`, non sei nella cartella giusta: `cd` fino a vedere `package.json` (`dir package.json` su Windows, `ls package.json` altrove).

L’app ascolta su [http://127.0.0.1:4731](http://127.0.0.1:4731).

### Conti dimostrativi

| Ruolo | Email | Password |
| --- | --- | --- |
| Zecchiere (Massimo Fornara) | `massimo@zecca.local` | `Conio2212!` |
| Cliente | `chiara@zecca.local` | `ForgiaChiara1` |
| Cliente | `luca@zecca.local` | `ForgiaLuca1` |

Chiara ha già speso oggi in bottega. Luca ha crediti e può già chiedere un prelievo, anche senza aver scaldato la forgia.

## Percorso da provare

1. Entra come Massimo, coni un lotto in **Zecchiere → Conio**.
2. Esci, entra come Luca, compra crediti in **Crediti** (pagamento demo: accredito immediato).
3. Metti in cesta un pezzo dalla **Vetrina**, scegli se spedirlo a casa tua o a casa di Massimo, e paga in crediti.
4. In **Prelievo** chiedi euro verso IBAN o wallet (anche senza aver comprato oggi).
5. Torna come Massimo: in **Fusioni** copia IBAN/indirizzo e importo, poi conferma l’invio.

## Da fittizio a reale

Zecca **non diventa una banca**. I crediti restano un libro mastro. Per muovere euro veri servono Stripe (ingresso) e il tuo home banking (uscita). Nessun agente, me compreso, può inventare le chiavi o disporre un SEPA.

Cosa serve, e chi lo può fare:

| Passo | Chi |
| --- | --- |
| Account Stripe, verifica identità, conto collegato | Tu, su stripe.com |
| `STRIPE_SECRET_KEY` (`sk_test_` poi `sk_live_`) e `STRIPE_WEBHOOK_SECRET` nel `.env` | Tu (non inviarle in chat) |
| Webhook `checkout.session.completed` → `https://tuo-dominio/api/stripe/webhook` | Tu |
| Sito in HTTPS + `AUTH_URL` + `AUTH_SECRET` nuovo | Tu (hosting / Publish) |
| Partita IVA / inquadramento se vendi in Italia | Tu (commercialista) |
| Bonifici ai clienti (fusioni) | Tu, dal home banking |
| Codice (Checkout, webhook firmato, IBAN, blocco demo, checklist, blocco SEPA copiabile) | Questo repo |

Controlla lo stato: `npm run check:live`. In **Zecchiere → Tesoreria** vedi la stessa lista.

Senza le chiavi Stripe **nessuno**, me compreso, può far entrare euro veri.

**Euro in ingresso (veri):** Stripe Checkout.

1. Crea un account Stripe e le chiavi.
2. Nel `.env`:

```
AUTH_URL="https://tuo-dominio"
AUTH_SECRET="…generato da npm run check:live"
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

3. Webhook su `/api/stripe/webhook` per `checkout.session.completed`.
4. Riavvia. In **Crediti** compare *Paga in euro veri (Stripe)*. Il pagamento demo e i conti `@zecca.local` si spengono con la chiave live.

Senza queste variabili resta solo il pagamento dimostrativo: nessun euro si muove.

**Euro in uscita (veri):** il cliente indica IBAN oppure rete + indirizzo wallet. In **Fusioni** compare un blocco da incollare in banca o nel wallet del zecchiere. Massimo invia **dal proprio home banking o dal proprio wallet**, poi conferma. L’app non ha accesso ai conti e non spedisce crypto.

Non esiste un pulsante che “conia e manda” soldi a un IBAN.

## Conio e conversione in cassa negozio

1. **Zecchiere → Conio**: quantità libera. I crediti vanno in tesoreria crediti. Coniare **non** crea saldo bancario.
2. **Zecchiere → Forgia**: 1 cr = X EUR e 1 cr = Y USD (predefiniti 1,00 e 1,08).
3. **Zecchiere → Tesoreria** (o Fusioni): indica quanti crediti diventare euro e quanti dollari. Esempio: 10.000 cr coniato, 3.000 → EUR e 2.000 → USD: tesoreria crediti 5.000; cassa negozio +EUR e +USD; 5.000 cr restano crediti.
4. Il libro registra `TREASURY_CONVERT_TO_EUR` e `TREASURY_CONVERT_TO_USD`. I pentolini fiat si calcolano da quelle righe.
5. I clienti prelevano in **EUR** verso IBAN o wallet (coda Fusioni). Bonifici, invii wallet e Stripe restano un passo a parte.

`npm run test:flow` include mint → conversione 3.000 cr in EUR e 2.000 cr in USD e controlla saldi e libro.

## Architettura (fattibilità, MiCA, riserve)

Analisi della monetizzazione interna, on/off-ramp e rischi di conio scoperto: [`docs/architettura-monetizzazione.md`](docs/architettura-monetizzazione.md). In Tesoreria il riquadro **Copertura riserve** mostra il ratio euro Stripe / circolante.

## Libro mastro

Ogni movimento è una riga: `MINT`, `PURCHASE_CREDITS`, `SPEND_ON_ORDER`, `CASHOUT_REQUEST`, `CASHOUT_PAID`, `CASHOUT_REJECTED`, `TREASURY_CASHOUT`, `TREASURY_CONVERT_TO_EUR`, `TREASURY_CONVERT_TO_USD`, `RATE_CHANGE`. Tesoreria crediti e casse fiat si calcolano da lì.

## Test del flusso

```bash
npm run test:flow
```

Prova in isolamento (SQLite temporaneo): conio → acquisto crediti → ordine → prelievo IBAN e wallet → conversione tesoreria in EUR e USD nella cassa negozio.

## Stack

Next.js (App Router), TypeScript, Prisma, SQLite, Auth.js (email e password), Tailwind. Un comando, un file di database.
