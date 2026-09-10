# Zecca

Zecca è una **zecca + bottega**. Massimo Fornara, lo zecchiere, è l’unico che può **coniare** crediti. I clienti comprano quei crediti in euro, li spendono in vetrina su oggetti della casa, e possono **prelevarli** verso un conto bancario o un wallet.

Non è un e-commerce a punti. I crediti vivono in un **libro mastro** immutabile. Non sono satoshi né ether. Per i payout EVM il negozio avvia **Zecca Gasless** (chain ID 22120, gasPrice 0) e conia zUSD: hash veri su `/catena/tx`, non su Ethereum né su Etherscan.

## Idea

1. **Conio** — Massimo scrive **qualsiasi quantità positiva**: i crediti nascono in tesoreria. Non sono euro di banca.
2. **Acquisto crediti** — Il cliente versa euro (demo o Stripe) e riceve crediti dalla tesoreria.
3. **Negozio** — E-commerce della bottega: **decine di pezzi** (dispensa, cantina, tavola, bottega, tessuti, corpo), ciascuno legato al fornitore che lo produce. Paghi in crediti. Al checkout Zecca apre da sola un collo DHL Express 24h **dalla sede di ogni azienda** (18 cr a casa del cliente, 0 cr se la destinazione è casa di Massimo). Massimo non imballa. Ricevuta, tracking pubblico. Con `DHL_API_KEY` + account si prenota il ritiro vero; senza, la lettera resta locale. Aggiorna il catalogo con `npm run db:catalog`.
4. **Forgia del Giorno** — Il calore di oggi dipende da quanto hai comprato *nella giornata*. A mezzanotte romana si azzera. Non blocca più il prelievo.
5. **Prelievo** — Il conio crea crediti di libro, **non** euro di banca né USDC. I prelievi USDC escono solo se il wallet Circle SCA ha USDC vero. Il cliente chiede **bonifico SEPA su IBAN italiano** oppure **USDC su Base** verso qualsiasi `0x…` (MetaMask, Trust, deposito Kraken/MEXC su Base). 1 USDC = 1 USD di libro. IBAN: **«Segna bonifico disposto»**. USDC: invio automatico + **«Invia USDC»**; il cliente non firma e non paga il gas (Gas Station su Base). Senza Circle env: *Wallet negozio non configurato*. Stripe non versa sull’IBAN del cliente.
6. **Casa Fornara** — Le email `massimo.fornara.2212@gmail.com` e `mfornara93@gmail.com`, una volta iscritte, diventano zecchiere: generano crediti **senza pagare** (quantità scelta) e li prelevano in EUR su UniCredit o in USD su Wise. Non sono conti pre-creati: iscriviti con quella email e la password che scegli tu.
7. **Conversione tesoreria** — Massimo converte crediti ancora in casa in **euro, dollari, franchi o crypto** (BTC, ETH, USDT, USDC, BNB). Euro, dollari e franchi partono verso gli IBAN casa (UniCredit / Wise) nello stesso passo. Le crypto EVM tentano mint a gas zero su Zecca Gasless verso il wallet indicato. **Arrivo crypto EVM = tx_hash su /catena.** **Arrivo banca = TRN.** Senza `ZECCA_SEPA_GATEWAY_*` o Wise Platform i destinatari IBAN non ricevono.

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

In Prelievo Massimo e Maxi possono scrivere **qualunque quantità** (anche a portafoglio vuoto): dopo la conferma i crediti si bruciano e, per ETH/USDT/USDC/BNB, parte un mint a gas zero su Zecca Gasless. I bonifici SEPA/Wise restano fermi senza banca collegata.

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

**Euro in uscita verso il cliente (veri):** il cliente indica IBAN italiano e intestatario. Tu disponi il SEPA da UniCredit (fuori dall’app), poi in **Fusioni** premi **Segna bonifico disposto**. Quella ricevuta `DISPOTO/…` è un’attestazione tua, **non** un CRO. Se hai il CRO vero, puoi ancora chiudere con quello. Un payout Stripe **non** va sull’IBAN del cliente: Stripe paga solo il conto collegato al *tuo* account Stripe.

**USDC in uscita (automatico, Circle SCA + Gas Station, Base mainnet):** il cliente incolla un `0x…` — MetaMask, Trust Wallet, o il **deposito USDC sulla rete Base** di Kraken/MEXC (non Ethereum, non un altro token). Tasso: 1 credito = `usdCentsPerCredit` (**1 USDC = 1 USD** di libro). Alla conferma Zecca chiama lato server `POST /v1/w3s/developer/transactions/transfer` con `feeLevel: MEDIUM`. Su un wallet **SCA**, se in Console esiste una **policy Gas Station di default su BASE**, Circle sponsorizza il gas da solo: **nessun flag extra** nella request, il cliente **non firma** e **non paga il gas**. Il conio di crediti **non** crea USDC: senza saldo USDC sul wallet negozio l’invio non parte.

### Setup Circle (esatto)

1. Account su [console.circle.com](https://console.circle.com) → **API Keys** → chiave live (`PREFIX:ID:SECRET`).
2. **Developer-controlled wallets** → entity secret (32 byte hex), registralo, **salva il recovery file**.
3. Crea un wallet **SCA** sulla blockchain **BASE** (mainnet). Esempio attuale: walletId `8f8958e0-c20d-5514-9725-b45e91471064`, address `0xaa7b4d75b80b145163d1f1caacd8b1b468fcca08`. In Vercel `CIRCLE_WALLET_ID` deve essere questo SCA, non il vecchio EOA.
4. **Finanzia il SCA solo con USDC nativo Base** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Non serve ETH nel wallet se Gas Station è attivo.
5. **Gas Station (obbligatorio per il gasless su mainnet):**
   1. Console → **Wallets → Gas Station** (o **Policies**).
   2. Crea una policy sulla rete **Base**.
   3. Impostala come **default** e **attivala**.
   4. Collega un metodo di pagamento Circle per lo sponsored gas (carta). Senza policy default attiva, il transfer SCA **non** è gasless: Circle rifiuta o chiede gas, la fusione resta aperta. Zecca **non** mette ETH nel wallet al posto tuo.
6. Env Vercel (Production):

| Variabile | Obbligatoria | Valore |
| --- | --- | --- |
| `CIRCLE_API_KEY` | sì | chiave Console |
| `CIRCLE_WALLET_ID` | sì | UUID del wallet **SCA** BASE |
| `CIRCLE_ENTITY_SECRET` | sì | 64 hex dell’entity secret |
| `CIRCLE_API_HOST` | no | default `https://api.circle.com` (sandbox: `https://api-sandbox.circle.com`) |
| `CIRCLE_USDC_TOKEN_ID` | no | UUID token Circle, se lo usi al posto dell’address |
| `CIRCLE_USDC_TOKEN_ADDRESS` | no | default `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | no | solo incassi carte. **Non** paga l’IBAN cliente. |

7. Redeploy. `npm run check:live` deve mostrare Circle USDC come pronto. Senza le tre env, o con wallet SCA vuoto di USDC, l’invio fallisce in chiaro e la fusione resta **aperta**. I segreti restano solo in env, mai nel client.

### MetaMask / Trust Wallet (cliente)

Rete **Base mainnet**, non Ethereum:

| Campo | Valore |
| --- | --- |
| Nome rete | Base |
| RPC | `https://mainnet.base.org` |
| Chain ID | `8453` |
| Valuta | ETH |
| Explorer | `https://basescan.org` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

In MetaMask: Impostazioni → Reti → Aggiungi rete. In Trust: Impostazioni → Reti → Base. Su Kraken o MEXC: genera un **deposito USDC / Base** e incolla quell’indirizzo `0x…`. Un deposito Ethereum o un altro token non riceve questo invio.

**Euro, dollari o franchi casa:** IBAN UniCredit/Wise come prima. Distinta CSV e pain.001 da **Liquidazione** se `ZECCA_SEPA_DEBTOR_IBAN` è impostato. Un codice `ZECCA/…` non è un bonifico.

**Altre crypto casa:** Zecca Gasless (zUSD, chain 22120) o minter/vault. Non è USDC Circle.

Su Vercel il SQLite in `/tmp` è per istanza. Senza `DATABASE_URL` Postgres il libro non è condiviso: la prova firmata nel cookie è quella che fa funzionare chiusura e ricevuta.

## Conio e conversione in cassa negozio

1. **Zecchiere → Conio**: quantità libera. I crediti vanno in tesoreria crediti. Coniare **non** crea saldo bancario.
2. **Zecchiere → Forgia**: 1 cr = X EUR, 1 cr = Y USD, 1 cr = Z CHF (predefiniti 1,00, 1,08 e 0,94).
3. **Zecchiere → Tesoreria** (o Fusioni): indica quanti crediti diventare euro, dollari, franchi o crypto. **USDC** va solo a libro: non parte nessun token. Deposita USDC nativo Base sul SCA `0xaa7b4d75b80b145163d1f1caacd8b1b468fcca08`, premi «Aggiorna saldo Circle», poi preleva verso MetaMask/Trust/Kraken (deposito USDC Base). Altre crypto: alla conferma i crediti si bruciano e il prelievo viene accettato (mint EVM se configurato, altrimenti coda). Esempio: 10.000 cr coniato, 3.000 → EUR, 2.000 → USD, 500 → CHF, 1.000 → USDC a libro (poi deposito Circle) e BTC verso `bc1…`.
4. Il libro registra `TREASURY_CONVERT_TO_EUR`, `TREASURY_CONVERT_TO_USD`, `TREASURY_CONVERT_TO_CHF` e `TREASURY_CONVERT_TO_CRYPTO`. I pentolini fiat si calcolano da quelle righe. Il payout crypto brucia i crediti e accetta la richiesta verso il wallet indicato.
5. I clienti (e la casa) prelevano in **EUR, USD o CHF** verso IBAN (bonifico a mano da UniCredit o Wise) oppure in crypto dal wallet del negozio. Se resta crypto sul libro, Massimo può prelevare di nuovo da Tesoreria verso un altro indirizzo. Il gateway applica rate limit, whitelist (se attiva) e massimali temporali.

**USDC verso Kraken / MetaMask (convert → deposita → preleva):**

1. **Conio** i crediti in tesoreria (solo libro).
2. **Fusioni / Tesoreria**: converti crediti → USDC. Il pentolino libro sale; **nessun** token esce.
3. Deposita USDC nativo Base sul SCA `0xaa7b4d75b80b145163d1f1caacd8b1b468fcca08`. Premi **Aggiorna saldo Circle**.
4. Se libro > catena, il banner chiede la differenza. I prelievi sono limitati a `min(libro, saldo Circle)`.
5. Cliente o casa in **Prelievo**: USDC, indirizzo `0x…` (es. deposito Kraken USDC su Base `0x9b4a778c812a891ECFaAaE95483B5DCB21F6917e`). Conferma. Circle invia; PAID solo se l’API accetta. Hash su BaseScan, mai su localhost `/catena`.

Senza Postgres su Vercel il SQLite è in `/tmp` per istanza: i conii restano anche in un cookie firmato e vengono riallineati al reload. Per un libro condiviso usa `DATABASE_URL` Postgres.



## Architettura (fattibilità, MiCA, riserve)

Analisi della monetizzazione interna, on/off-ramp e rischi di conio scoperto: [`docs/architettura-monetizzazione.md`](docs/architettura-monetizzazione.md). Pipeline esecutiva mint / liquidity / Wise / SEPA: [`docs/pipeline-settlement.md`](docs/pipeline-settlement.md). Check provider: `npm run check:settlement`.

In produzione: KMS secp256k1 con `MINTER_ROLE` in `GET /api/rails/kms`; catena gasless in-process in `GET /api/rails/chain` e `POST /api/rails/chain/rpc` (anche su Vercel serverless: niente porta TCP, replay delle raw tx dal libro). API stile Etherscan sulla stessa origine: `GET /api/rails/chain/v2/api?module=proxy&action=eth_getTransactionReceipt&txhash=`. Ethereum mainnet e etherscan.io non includono questi hash. Senza BaaS upstream non nascono CRO UniCredit.

Mint a gas zero (esegue e stampa un tx_hash reale sulla catena 22120): `npm run token:gasless`. Explorer: [http://127.0.0.1:4731/catena](http://127.0.0.1:4731/catena). Per spegnere la catena nei test: `ZECCA_GASLESS=0`.

## Libro mastro

Ogni movimento è una riga: `MINT`, `HOUSE_GRANT`, `PURCHASE_CREDITS`, `SPEND_ON_ORDER`, `CASHOUT_REQUEST`, `CASHOUT_PAID`, `CASHOUT_REJECTED`, `TREASURY_CASHOUT`, `TREASURY_CONVERT_TO_EUR`, `TREASURY_CONVERT_TO_USD`, `TREASURY_CONVERT_TO_CHF`, `TREASURY_CONVERT_TO_CRYPTO`, `TREASURY_CRYPTO_WITHDRAW`, `RATE_CHANGE`. Tesoreria crediti, casse fiat e wallet interni crypto si calcolano da lì.

## Test del flusso

```bash
npm run test:flow
```

Prova in isolamento (SQLite temporaneo): conio → acquisto crediti → ordine → prelievo IBAN italiano (BIC, rifiuto IBAN estero) e wallet → **Segna bonifico disposto** → USDC Circle (errore senza env, mock con fetch) → conversione tesoreria in EUR, USD e crypto → generazione casa e prelievo IBAN Wise (BE).

## Stack

Next.js (App Router), TypeScript, Prisma, SQLite, Auth.js (email e password), Tailwind. Un comando, un file di database.
