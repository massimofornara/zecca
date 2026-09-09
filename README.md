# Zecca

Zecca è una **zecca + bottega**. Massimo Fornara, lo zecchiere, è l’unico che può **coniare** crediti. I clienti comprano quei crediti in euro, li spendono in vetrina su oggetti della casa, e possono **prelevarli** verso un conto bancario o un wallet.

Non è un e-commerce a punti. I crediti vivono in un **libro mastro** immutabile. Non c’è una blockchain.

## Idea

1. **Conio** — Massimo scrive **qualsiasi quantità positiva**: i crediti nascono in tesoreria. Non sono euro di banca.
2. **Acquisto crediti** — Il cliente versa euro (demo o Stripe) e riceve crediti dalla tesoreria.
3. **Negozio** — E-commerce della bottega: **decine di pezzi** (dispensa, cantina, tavola, bottega, tessuti, corpo), ciascuno legato al fornitore che lo produce. Paghi in crediti. Al checkout Zecca apre da sola un collo DHL Express 24h **dalla sede di ogni azienda** (18 cr a casa del cliente, 0 cr se la destinazione è casa di Massimo). Massimo non imballa. Ricevuta, tracking pubblico. Con `DHL_API_KEY` + account si prenota il ritiro vero; senza, la lettera resta locale. Aggiorna il catalogo con `npm run db:catalog`.
4. **Forgia del Giorno** — Il calore di oggi dipende da quanto hai comprato *nella giornata*. A mezzanotte romana si azzera. Non blocca più il prelievo.
5. **Prelievo** — Chiunque abbia crediti può chiedere **euro o dollari** verso **IBAN** o un wallet. Ogni prelievo chiuso ha una **ricevuta ufficiale** (`/ricevuta/…`) con hash SHA-256 del documento. In crypto serve anche l’**hash reale di rete** (Zecca lo verifica, non lo inventa). L’app non dispone bonifici e non spedisce crypto.
6. **Casa Fornara** — Le email `massimo.fornara.2212@gmail.com` e `mfornara93@gmail.com`, una volta iscritte, diventano zecchiere: generano crediti **senza pagare** (quantità scelta) e li prelevano in EUR su UniCredit o in USD su Wise. Non sono conti pre-creati: iscriviti con quella email e la password che scegli tu.
7. **Conversione tesoreria** — Massimo converte crediti ancora in casa in **euro e/o dollari della cassa negozio**. È un movimento contabile: non è un prelievo personale e non accredita un conto bancario.

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
| Massimo (casa) | `massimo@zecca.local` | `Conio2212!` |
| Cliente | `chiara@zecca.local` | `ForgiaChiara1` |
| Cliente | `luca@zecca.local` | `ForgiaLuca1` |

Chiara ha già speso oggi in bottega. Luca ha crediti e può già chiedere un prelievo, anche senza aver scaldato la forgia.

Le due Gmail della casa **non** sono nei conti dimostrativi. Iscriviti da **Iscriviti**:

| Nome | Email |
| --- | --- |
| Massimo | `massimo.fornara.2212@gmail.com` |
| Maxi | `mfornara93@gmail.com` |

In Portafoglio compare **Genera crediti senza pagare**. In Prelievo Massimo e Maxi possono scrivere **qualsiasi quantità** (anche a portafoglio vuoto): il pulsante **Genera e preleva** crea i crediti mancanti e apre la richiesta. Poi bonifico (UniCredit/Wise) oppure crypto (BTC, ETH, USDT, USDC) verso il wallet: la finestra mostra il valore da inviare. Gmail riconosce anche la stessa casella senza punti o con un +alias.

Conti bancari della casa:

| Banca | IBAN | Uso |
| --- | --- | --- |
| UniCredit | `IT22 B020 0822 8000 0010 3317 304` | Massimo Fornara · Euro (SEPA) |
| Wise | `BE06 9676 1482 0722` | NeoNoble Company · Dollari (SWIFT/estero) |

## Percorso da provare

1. Entra come Massimo, coni un lotto in **Zecchiere → Conio**.
2. Esci, entra come Luca, compra crediti in **Crediti** (pagamento demo: accredito immediato).
3. Metti in cesta un pezzo dalla **Vetrina**, scegli se spedirlo a casa tua o a casa di Massimo, e paga in crediti. Si apre la **ricevuta** con tracking.
4. In **Prelievo** indica i crediti, poi IBAN oppure la crypto e il wallet (la finestra mostra il valore).
5. Torna come Massimo: in **Ordini** apri l’ordine ai fornitori (non imballi: copi i dati e prenoti DHL dalla loro sede). In **Fusioni** copia IBAN/indirizzo e importo, poi conferma l’invio.

## Da fittizio a reale

Zecca **non diventa una banca**. I crediti restano un libro mastro. Gli euro veri entrano con un **bonifico SEPA** sul conto della zecca (Massimo conferma a mano). Escono con un bonifico o un invio wallet che fai tu dal home banking. Stripe è facoltativo. Nessun webhook.

Cosa serve, e chi lo può fare:

| Passo | Chi |
| --- | --- |
| IBAN della zecca in **Zecchiere → Versamenti** | Tu |
| Bonifico del cliente con causale `ZECCA-XXXXXX` | Il cliente, dalla sua banca |
| Conferma incasso in **Versamenti** | Tu, dopo aver visto l’accredito |
| Bonifici ai clienti (fusioni) | Tu, dal home banking |
| Sito in HTTPS + `AUTH_SECRET` | Tu (hosting / Vercel) |
| Partita IVA / inquadramento se vendi in Italia | Tu (commercialista) |

Controlla lo stato: `npm run check:live`. In **Zecchiere → Tesoreria** vedi la stessa lista.

**Euro in ingresso (veri):** bonifico SEPA, senza Stripe e senza webhook.

1. Entra come zecchiere → **Versamenti** → salva IBAN e intestatario.
2. Il cliente in **Crediti** sceglie i crediti e preme *Paga con bonifico SEPA*.
3. Dispone il bonifico con la causale mostrata (importo esatto).
4. Tu in **Versamenti** confronti causale e importo in banca, spunti la conferma, accrediti.

**Euro o dollari in uscita (veri):** il cliente (o la casa) indica IBAN e valuta. In **Fusioni** compare un blocco da incollare in banca. Tu invii **dal proprio home banking**, poi confermi. L’app non ha accesso ai conti.

Non esiste un pulsante che “conia e manda” soldi a un IBAN da sola. Le due email della casa generano crediti nel libro e aprono la richiesta di bonifico: il giro di denaro resta in banca.

## Conio e conversione in cassa negozio

1. **Zecchiere → Conio**: quantità libera. I crediti vanno in tesoreria crediti. Coniare **non** crea saldo bancario.
2. **Zecchiere → Forgia**: 1 cr = X EUR e 1 cr = Y USD (predefiniti 1,00 e 1,08).
3. **Zecchiere → Tesoreria** (o Fusioni): indica quanti crediti diventare euro e quanti dollari. Esempio: 10.000 cr coniato, 3.000 → EUR e 2.000 → USD: tesoreria crediti 5.000; cassa negozio +EUR e +USD; 5.000 cr restano crediti.
4. Il libro registra `TREASURY_CONVERT_TO_EUR` e `TREASURY_CONVERT_TO_USD`. I pentolini fiat si calcolano da quelle righe.
5. I clienti (e la casa) prelevano in **EUR o USD** verso IBAN. Bonifici e invii wallet restano un passo a parte.

`npm run test:flow` include mint → conversione 3.000 cr in EUR e 2.000 cr in USD e controlla saldi e libro.

## Architettura (fattibilità, MiCA, riserve)

Analisi della monetizzazione interna, on/off-ramp e rischi di conio scoperto: [`docs/architettura-monetizzazione.md`](docs/architettura-monetizzazione.md). In Tesoreria il riquadro **Copertura riserve** mostra il ratio euro Stripe / circolante.

## Libro mastro

Ogni movimento è una riga: `MINT`, `HOUSE_GRANT`, `PURCHASE_CREDITS`, `SPEND_ON_ORDER`, `CASHOUT_REQUEST`, `CASHOUT_PAID`, `CASHOUT_REJECTED`, `TREASURY_CASHOUT`, `TREASURY_CONVERT_TO_EUR`, `TREASURY_CONVERT_TO_USD`, `RATE_CHANGE`. Tesoreria crediti e casse fiat si calcolano da lì.

## Test del flusso

```bash
npm run test:flow
```

Prova in isolamento (SQLite temporaneo): conio → acquisto crediti → ordine → prelievo IBAN e wallet → conversione tesoreria in EUR e USD nella cassa negozio → generazione casa senza pagamento e prelievo IBAN in USD.

## Stack

Next.js (App Router), TypeScript, Prisma, SQLite, Auth.js (email e password), Tailwind. Un comando, un file di database.
