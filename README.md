# Zecca

Zecca è una **zecca + bottega**. Massimo Fornara, lo zecchiere, è l’unico che può **coniare** crediti. I clienti comprano quei crediti in euro, li spendono in vetrina su oggetti della casa, e possono **prelevarli** verso un conto bancario o un wallet.

Non è un e-commerce a punti. I crediti vivono in un **libro mastro** immutabile. Non c’è una blockchain.

## Idea

1. **Conio** — Massimo scrive **qualsiasi quantità positiva**: i crediti nascono in tesoreria. Non sono euro di banca.
2. **Acquisto crediti** — Il cliente versa euro (demo o Stripe) e riceve crediti dalla tesoreria.
3. **Negozio** — E-commerce della bottega: **decine di pezzi** (dispensa, cantina, tavola, bottega, tessuti, corpo), ciascuno legato al fornitore che lo produce. Paghi in crediti. Al checkout Zecca apre da sola un collo DHL Express 24h **dalla sede di ogni azienda** (18 cr a casa del cliente, 0 cr se la destinazione è casa di Massimo). Massimo non imballa. Ricevuta, tracking pubblico. Con `DHL_API_KEY` + account si prenota il ritiro vero; senza, la lettera resta locale. Aggiorna il catalogo con `npm run db:catalog`.
4. **Forgia del Giorno** — Il calore di oggi dipende da quanto hai comprato *nella giornata*. A mezzanotte romana si azzera. Non blocca più il prelievo.
5. **Prelievo** — Chiunque abbia crediti può chiedere **euro, dollari o franchi** verso **IBAN** o un wallet. Crypto (BTC, ETH, USDT, USDC, BNB): alla conferma i crediti si **bruciano nel libro** e la pipeline tenta l’invio in pochi secondi (mint EVM, vault, liquidity). Senza binario acceso **i fondi non arrivano**: resta una ricevuta interna `ZECCA/…`, che **non** è un CRO UniCredit né un tx_hash Mempool. L’accredito bancario (SEPA Instant / Wise) e gli hash di rete si chiudono in **Zecchiere → Liquidazione**. USDT su Tron non parte da questa cassa. In Forgia: rate limit, whitelist e massimali sul gateway di uscita.
6. **Casa Fornara** — Le email `massimo.fornara.2212@gmail.com` e `mfornara93@gmail.com`, una volta iscritte, diventano zecchiere: generano crediti **senza pagare** (quantità scelta) e li prelevano in EUR su UniCredit o in USD su Wise. Non sono conti pre-creati: iscriviti con quella email e la password che scegli tu.
7. **Conversione tesoreria** — Massimo converte crediti ancora in casa in **euro, dollari, franchi o crypto** (BTC, ETH, USDT, USDC, BNB). Euro, dollari e franchi partono verso gli IBAN casa (UniCredit / Wise) nello stesso passo. Le crypto tentano mint o transfer verso il wallet indicato. **Arrivo = TRN o tx_hash.** Senza `ZECCA_SEPA_GATEWAY_*`, Wise Platform, minter o vault i destinatari non ricevono.

Soglie predefinite (modificabili da Massimo):

| Spesa oggi | Quota forgiata |
| --- | --- |
| 0–49 cr | 0% |
| 50–149 cr | 20% |
| 150–299 cr | 40% |
| 300+ cr | 70% |

Tassi iniziali (modificabili in **Zecchiere → Forgia**): **1 credito = 1,00 EUR**, **1 credito = 1,08 USD**, **1 credito = 0,94 CHF**. Sono tre prezzi indipendenti. Stessa pagina: policy del gateway crypto (massimale per invio, giornaliero, prelievi/ora, soglia minima, whitelist).

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

In Prelievo Massimo e Maxi possono scrivere **qualunque quantità** (anche a portafoglio vuoto): dopo la conferma i crediti si bruciano e la pipeline tenta l’invio. Senza vault, minter o banca collegata i fondi non arrivano. Gmail riconosce anche la stessa casella senza punti o con un +alias.

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
| Conferma invio crypto (fusioni) | Accettata alla conferma: mint EVM o coda di liquidazione, senza saldo di rete preventivo |
| Sito in HTTPS + `AUTH_SECRET` | Tu (hosting / Vercel) |
| Partita IVA / inquadramento se vendi in Italia | Tu (commercialista) |

Controlla lo stato: `npm run check:live`. In **Zecchiere → Tesoreria** vedi la stessa lista.

**Euro in ingresso (veri):** bonifico SEPA, senza Stripe e senza webhook.

1. Entra come zecchiere → **Versamenti** → salva IBAN e intestatario.
2. Il cliente in **Crediti** sceglie i crediti e preme *Paga con bonifico SEPA*.
3. Dispone il bonifico con la causale mostrata (importo esatto).
4. Tu in **Versamenti** confronti causale e importo in banca, spunti la conferma, accrediti.

**Euro, dollari o franchi in uscita (veri):** il cliente (o la casa) indica IBAN e valuta. Il bonifico lo disponi tu da UniCredit (EUR) o Wise (USD e CHF), poi incolli il CRO in **Liquidazione**. Un codice `ZECCA/…` non è un bonifico. Da Liquidazione scarichi la distinta CSV e, se hai impostato `ZECCA_SEPA_DEBTOR_IBAN`, il file pain.001 da caricare su UniCredit Corporate.

**Crypto in uscita:** alla conferma i crediti si bruciano. Su EVM, se è configurato `ZECCA_TOKEN_ADDRESS`, il negozio invoca `mint(to, amount)` sul contratto Zecca (token proprietario, non USDT/ETH/BNB). Su Bitcoin la richiesta entra in coda di liquidazione con ricevuta interna `ZECCA/…` — senza interrogare Mempool e senza chiedere un hash a mano. Il destinatario non firma. In **Liquidazione** puoi ritentare l’invio: se il vault è a zero non nasce nessun tx_hash. Per un minter proprio: `ZECCA_TOKEN_ADDRESS`, `ZECCA_TOKEN_CHAIN_ID`, `ZECCA_TOKEN_DECIMALS`. Per un payout Bitcoin già firmato in un secondo tempo: `ZECCA_BTC_WIF` o `ZECCA_BTC_PRIVATE_KEY`. Per Wise API: `WISE_API_TOKEN` + `WISE_PROFILE_ID` (senza token non parte nulla).

Su Vercel il SQLite in `/tmp` è per istanza. Senza `DATABASE_URL` Postgres il libro non è condiviso: la prova firmata nel cookie è quella che fa funzionare chiusura e ricevuta.

## Conio e conversione in cassa negozio

1. **Zecchiere → Conio**: quantità libera. I crediti vanno in tesoreria crediti. Coniare **non** crea saldo bancario.
2. **Zecchiere → Forgia**: 1 cr = X EUR, 1 cr = Y USD, 1 cr = Z CHF (predefiniti 1,00, 1,08 e 0,94).
3. **Zecchiere → Tesoreria** (o Fusioni): indica quanti crediti diventare euro, dollari, franchi o crypto. Per la crypto scrivi il wallet: alla conferma i crediti si bruciano e il prelievo viene accettato (mint EVM se il contratto Zecca è configurato, altrimenti coda di liquidazione con ricevuta interna). Esempio: 10.000 cr coniato, 3.000 → EUR, 2.000 → USD, 500 → CHF e 1.000 → BTC verso `bc1…`.
4. Il libro registra `TREASURY_CONVERT_TO_EUR`, `TREASURY_CONVERT_TO_USD`, `TREASURY_CONVERT_TO_CHF` e `TREASURY_CONVERT_TO_CRYPTO`. I pentolini fiat si calcolano da quelle righe. Il payout crypto brucia i crediti e accetta la richiesta verso il wallet indicato.
5. I clienti (e la casa) prelevano in **EUR, USD o CHF** verso IBAN (bonifico a mano da UniCredit o Wise) oppure in crypto dal wallet del negozio. Se resta crypto sul libro, Massimo può prelevare di nuovo da Tesoreria verso un altro indirizzo. Il gateway applica rate limit, whitelist (se attiva) e massimali temporali.

`npm run test:flow` include mint → conversione 3.000 cr in EUR, 2.000 cr in USD e 500 cr in CHF, conversione crypto in cassa virtuale, policy di prelievo (whitelist, rate limit, checksum) e prelievo verso il wallet indicato nel form (senza inventare hash).

## Architettura (fattibilità, MiCA, riserve)

Analisi della monetizzazione interna, on/off-ramp e rischi di conio scoperto: [`docs/architettura-monetizzazione.md`](docs/architettura-monetizzazione.md). Pipeline esecutiva mint / liquidity / Wise / SEPA: [`docs/pipeline-settlement.md`](docs/pipeline-settlement.md). Check provider: `npm run check:settlement`.

In produzione: KMS secp256k1 con `MINTER_ROLE` in `GET /api/rails/kms`; binario SEPA autenticato in `GET /api/rails/sepa` e `POST /api/rails/sepa/v1/payments`. Senza gas o BaaS upstream non nascono tx_hash né CRO UniCredit.

Deploy on-chain di `ZeccaToken` (solo se il signer ha gas; **non** inventa `tx_hash`): `npm run token:balances` poi `ZECCA_TOKEN_CHAIN_ID=1 npm run token:deploy`. Il constructor assegna `DEFAULT_ADMIN_ROLE` e `MINTER_ROLE` all’admin KMS/sealed. Senza ETH/BNB sul firmatario lo script esce con `NO_GAS`. Gli euro su UniCredit restano `pain.001` finché non c’è `ZECCA_SEPA_GATEWAY_*` o un conto ordinante `ZECCA_SEPA_DEBTOR_IBAN`.

## Libro mastro

Ogni movimento è una riga: `MINT`, `HOUSE_GRANT`, `PURCHASE_CREDITS`, `SPEND_ON_ORDER`, `CASHOUT_REQUEST`, `CASHOUT_PAID`, `CASHOUT_REJECTED`, `TREASURY_CASHOUT`, `TREASURY_CONVERT_TO_EUR`, `TREASURY_CONVERT_TO_USD`, `TREASURY_CONVERT_TO_CHF`, `TREASURY_CONVERT_TO_CRYPTO`, `TREASURY_CRYPTO_WITHDRAW`, `RATE_CHANGE`. Tesoreria crediti, casse fiat e wallet interni crypto si calcolano da lì.

## Test del flusso

```bash
npm run test:flow
```

Prova in isolamento (SQLite temporaneo): conio → acquisto crediti → ordine → prelievo IBAN e wallet → conversione tesoreria in EUR, USD e crypto nei wallet interni → generazione casa senza pagamento e prelievo IBAN in USD.

## Stack

Next.js (App Router), TypeScript, Prisma, SQLite, Auth.js (email e password), Tailwind. Un comando, un file di database.
