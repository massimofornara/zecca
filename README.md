# Zecca

Zecca è una **zecca + bottega**. Massimo Fornara, lo zecchiere, è l’unico che può **coniare** crediti. I clienti comprano quei crediti in euro, li spendono in vetrina, e — se la **Forgia del Giorno** è calda — possono fonderli di nuovo in denaro.

Non è un e-commerce a punti. I crediti vivono in un **libro mastro** immutabile. Non c’è una blockchain.

## Idea

1. **Conio** — Massimo crea un lotto. I crediti nascono in *tesoreria*.
2. **Acquisto crediti** — Il cliente versa euro e riceve crediti dalla tesoreria. Se la tesoreria è corta, la vendita si ferma: bisogna coniare.
3. **Bottega** — Si paga in crediti. Ogni spesa di **oggi** (confine di calendario `Europe/Rome`) scalda la forgia.
4. **Forgia del Giorno** — La quota fondibile del portafoglio dipende da quanto hai comprato *nella giornata*, non da una fedeltà a vita. A mezzanotte romana il calore si azzera.
5. **Fusione** — Il cliente chiede di convertire il *forgiato* in euro. Massimo segna pagato (in demo: chiude il movimento; nella vita: bonifico o PayPal). Lo zecchiere può sempre fondere la tesoreria.

Soglie predefinite (modificabili da Massimo):

| Spesa oggi | Quota forgiata |
| --- | --- |
| 0–49 cr | 0% |
| 50–149 cr | 20% |
| 150–299 cr | 40% |
| 300+ cr | 70% |

Tasso iniziale: **1 credito = 1 EUR**.

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

Chiara ha già speso oggi in bottega: la sua forgia è tiepida. Luca ha crediti ma non ha ancora scaldato il metallo.

## Percorso da provare

1. Entra come Massimo, coni un lotto in **Zecchiere → Conio**.
2. Esci, entra come Luca, compra crediti in **Crediti** (pagamento demo: accredito immediato).
3. Metti in cesta un pezzo dalla **Vetrina** e paga in crediti.
4. Guarda la **Forgia** nel portafoglio: il calore sale, una quota diventa fondibile.
5. In **Fusione** chiedi di convertire.
6. Torna come Massimo: la richiesta è in **Fusioni**. Segna pagata. Il libro mastro registra tutto.

## Fondi reali

Zecca **non è una banca** e **non dispone bonifici**. I crediti sono un libro mastro.

**Euro in ingresso (veri):** Stripe Checkout.

1. Crea un account Stripe e le chiavi.
2. Nel `.env`:

```
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

3. Webhook su `/api/stripe/webhook` per `checkout.session.completed`.
4. Riavvia. In **Crediti** compare *Paga in euro veri (Stripe)*. Il pagamento demo si nasconde (per riaverlo: `ZECCA_ALLOW_DEMO_PAY=1`).

Senza queste variabili resta solo il pagamento dimostrativo: nessun euro si muove.

**Euro in uscita (veri):** il cliente indica IBAN e intestatario. Il zecchiere fa il SEPA **dal proprio home banking**, poi conferma in **Fusioni**. L’app non ha accesso ai conti.

Non esiste un pulsante che “conia e manda” soldi a un IBAN.

## Libro mastro

Ogni movimento è una riga: `MINT`, `PURCHASE_CREDITS`, `SPEND_ON_ORDER`, `CASHOUT_REQUEST`, `CASHOUT_PAID`, `CASHOUT_REJECTED`, `TREASURY_CASHOUT`, `RATE_CHANGE`. Tesoreria e portafogli si calcolano da lì.

## Test del flusso

```bash
npm run test:flow
```

Prova in isolamento (SQLite temporaneo): conio → acquisto crediti → ordine → sblocco forgia → richiesta di fusione visibile all’admin → pagamento.

## Stack

Next.js (App Router), TypeScript, Prisma, SQLite, Auth.js (email e password), Tailwind. Un comando, un file di database.
