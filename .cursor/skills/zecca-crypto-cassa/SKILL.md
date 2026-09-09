---
name: zecca-crypto-cassa
description: Rules for Zecca treasury crypto conversion, the on-chain shop vault (cassa di rete), and payouts to MetaMask, Trust Wallet, or exchanges. Use when editing Tesoreria, Fusioni, Prelievo, shop-payout, btc-payout, shop-vault, internal wallets, or when the user asks to fill BTC/ETH/USDT/USDC/BNB from minted credits.
---

# Zecca crypto e cassa di rete

Zecca è un **libro mastro** (SQLite/Prisma). I crediti non sono Bitcoin, ether, USDT, USDC o BNB.

## Due casse distinte

| Cosa | Dove | Cosa mostra |
| --- | --- | --- |
| Wallet interni / conversione tesoreria | `TREASURY_CONVERT_TO_CRYPTO` | Libro: valore USD dei crediti |
| Cassa di rete | `getShopNetworkVault()` | Saldo **on-chain** (Mempool, Etherscan, BscScan) |

Convertire crediti **non** accredita `bc1…` né `0x…`. Non sommare i crediti convertiti alle schede della cassa di rete.

## Prelievo verso MetaMask / Trust / exchange

1. Il negozio firma e trasmette (`sendShopCryptoPayout` / `sendShopBtcPayout`).
2. Il destinatario **non** firma.
3. L’hash esiste solo dopo un broadcast reale con saldo (e gas per USDT/USDC).
4. Crypto: BTC, ETH, USDT (ERC-20), USDC (ERC-20), BNB. Non TRX da questa cassa.

Chiavi: `ZECCA_EVM_PRIVATE_KEY` (altrimenti HMAC di `AUTH_SECRET`); `ZECCA_BTC_WIF` o `ZECCA_BTC_PRIVATE_KEY` (altrimenti HMAC BIP84). Senza fondi on-chain l’invio fallisce con `INSUFFICIENT_SHOP_FUNDS`.

## Vietato

- Inventare txid / hash `0x` / txid Bitcoin, o chiudere un prelievo come `PAID` senza broadcast verificato.
- Mostrare i BTC/ETH del libro come saldo Mempool/Etherscan.
- Saltare il controllo di saldo a zero per “far arrivare” i fondi.
- Mintare token che impersonano USDT/USDC.
- Testnet/signet presentati come mainnet.

`scripts/test-flow.ts` deve continuare a rifiutare un hash inventato.

## Cosa fare invece

- Tesoreria: cassa di rete = saldo vero + indirizzo da caricare per ogni asset.
- Wallet interni = libro; accanto, riga Rete.
- Copia UI in **italiano**, onesta.
- Se manca saldo: errore chiaro, prelievo `PENDING`, niente hash finto.

UI: `app/zecchiere/page.tsx`, `components/zecchiere/FusioniForms.tsx`. Invio: `lib/zecca/shop-payout.ts`, `btc-payout.ts`, `shop-vault.ts`, `cashout.ts`, `convert.ts`.
