# Pipeline di settlement esecutivo — Zecca

Il libro mastro brucia i crediti. I binari esterni consegnano valore. **EXECUTED** esiste solo con TRN bancario o `tx_hash` verificabile. Nessun hash di comodo.

```mermaid
flowchart TD
  burn[Burn crediti sul libro] --> pipe{Pipeline}
  pipe --> mint[evm-minter mint to amount]
  pipe --> hot[hot-wallet transfer]
  pipe --> lp[liquidity POST /v1/disburse]
  pipe --> sepa[SEPA Instant POST /v1/payments]
  pipe --> wise[Wise quote + transfer + fund]
  mint -->|tx_hash| executed[EXECUTED]
  hot -->|tx_hash| executed
  lp -->|tx_hash| executed
  lp -->|id provider| dispatched[DISPATCHED]
  sepa -->|TRN/CRO| executed
  wise -->|transfer id funded| executed
  mint -->|fail| next1[passo successivo]
  hot -->|vault zero| next1
  next1 --> lp
  next1 --> queued[QUEUED ricevuta tesoreria]
  sepa -->|no gateway| queued
  wise -->|no token| queued
```

## Crypto

| Asset | Binario 1 | Binario 2 | Binario 3 |
| --- | --- | --- | --- |
| USDT / USDC / ZECCA | `mint(to, amount)` sul contratto con `MINTER_ROLE` | transfer ERC-20 se il vault ha token | liquidity gateway |
| ETH / BNB nativi | hot wallet se c’è gas+saldo | `ZECCA_LIQUIDITY_URL` | coda tesoreria |
| BTC | hot wallet UTXO | liquidity gateway | coda tesoreria |

USDT/USDC di protocollo **non** sono Tether/Circle. MetaMask deve aggiungere l’address del contratto Zecca (`contracts/ZeccaMinter.sol`).

## Fiat

| Valuta | Provider | Env |
| --- | --- | --- |
| EUR | BaaS/SEPA Instant (`instant: true`, timeout 8s) | `ZECCA_SEPA_GATEWAY_URL` + `ZECCA_SEPA_GATEWAY_TOKEN` |
| USD / CHF | Wise Platform | `WISE_API_TOKEN`, `WISE_PROFILE_ID`, `WISE_USD_RECIPIENT_ID`, `WISE_CHF_RECIPIENT_ID` |

## Integrazione (build)

```bash
npx tsx scripts/check-settlement-providers.ts
npx tsx scripts/deploy-zecca-minter.ts
npx tsx scripts/transmit-all.ts
```

HMAC del body JSON: header `X-Zecca-Signature` = HMAC-SHA256(`ZECCA_LIQUIDITY_TOKEN` o token SEPA).

Risposta liquidity attesa:

```json
{ "tx_hash": "0x…64 hex…" }
```

oppure `{ "id": "disbursal_…" }` → stato DISPATCHED, non EXECUTED.

Risposta SEPA attesa: `{ "trn": "…" }` o `{ "cro": "…" }`.
