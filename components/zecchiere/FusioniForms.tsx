"use client";

import { useActionState, useMemo, useState } from "react";
import {
  resolveCashoutAction,
  treasuryConvertAction,
  treasuryCryptoWithdrawAction,
  type InternalWithdrawState,
} from "@/actions/admin";
import { CopyField } from "@/components/copy/CopyField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { CashoutReceipt } from "@/components/shop/CashoutReceipt";
import { SettleCashoutForm } from "@/components/shop/SettleCashoutForm";
import { ErrorBanner, OkBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { formatCashoutValue, formatCredits, formatEurFromCents, formatFiatFromCents, formatUsdFromCents } from "@/lib/format";
import { destinationInstruction } from "@/lib/payout";
import { CRYPTO_ASSETS, isValidWalletAddress, walletNetworkLabel } from "@/lib/wallet";
import { housePayoutByIban } from "@/lib/zecca/house-accounts";
import type { InternalCryptoWallet, TreasuryCryptoAsset } from "@/lib/zecca/convert";
import type { ShopVaultAsset } from "@/lib/zecca/shop-vault";
import { isShopSendableNetwork } from "@/lib/evm-send";
import { explorerSearchLabel } from "@/lib/receipt";

const CRYPTO_CHOICES = CRYPTO_ASSETS.filter((asset) =>
  isShopSendableNetwork(asset.id),
) as { id: TreasuryCryptoAsset; label: string; ticker: string; hint: string }[];

const chip =
  "metal-frame relative z-20 flex cursor-pointer items-start gap-2 rounded-md bg-background/40 px-3 py-2 text-sm has-[:checked]:bg-primary/15 has-[:checked]:text-primary has-[:checked]:ring-1 has-[:checked]:ring-primary/40";

export function TreasuryConvertForm({
  treasury,
  eurCentsPerCredit,
  usdCentsPerCredit,
  chfCentsPerCredit,
  vault = [],
}: {
  treasury: number;
  eurCentsPerCredit: number;
  usdCentsPerCredit: number;
  chfCentsPerCredit: number;
  vault?: ShopVaultAsset[];
}) {
  const [state, action] = useActionState(
    treasuryConvertAction,
    null as InternalWithdrawState | null,
  );
  const [creditsEur, setCreditsEur] = useState(0);
  const [creditsUsd, setCreditsUsd] = useState(0);
  const [creditsChf, setCreditsChf] = useState(0);
  const [creditsCrypto, setCreditsCrypto] = useState(0);
  const [cryptoAsset, setCryptoAsset] = useState<TreasuryCryptoAsset>("BTC");
  const [walletAddress, setWalletAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const previewEur = useMemo(() => {
    const amount = creditsEur > 0 ? Math.floor(creditsEur) : 0;
    return formatFiatFromCents(amount * eurCentsPerCredit, "EUR");
  }, [creditsEur, eurCentsPerCredit]);

  const previewUsd = useMemo(() => {
    const amount = creditsUsd > 0 ? Math.floor(creditsUsd) : 0;
    return formatFiatFromCents(amount * usdCentsPerCredit, "USD");
  }, [creditsUsd, usdCentsPerCredit]);

  const previewChf = useMemo(() => {
    const amount = creditsChf > 0 ? Math.floor(creditsChf) : 0;
    return formatFiatFromCents(amount * chfCentsPerCredit, "CHF");
  }, [creditsChf, chfCentsPerCredit]);

  const selectedCrypto =
    CRYPTO_CHOICES.find((asset) => asset.id === cryptoAsset) ?? CRYPTO_CHOICES[0];
  const previewCrypto = useMemo(() => {
    const amount = creditsCrypto > 0 ? Math.floor(creditsCrypto) : 0;
    return `${formatUsdFromCents(amount * usdCentsPerCredit)} in ${selectedCrypto.ticker}`;
  }, [creditsCrypto, usdCentsPerCredit, selectedCrypto.ticker]);

  const cryptoAmount = creditsCrypto > 0 ? Math.floor(creditsCrypto) : 0;
  const destOk = cryptoAmount <= 0 || isValidWalletAddress(walletAddress, cryptoAsset);
  const selectedVault = vault.find((item) => item.id === cryptoAsset);
  const pending = Boolean(state?.receiptId && (state.pending || state.status === "PENDING"));
  const paid = Boolean(state?.receiptId && state.status === "PAID");

  if (paid && state?.receiptId) {
    return (
      <div className="mt-4 space-y-3">
        <OkBanner message={state.ok} />
        <CashoutReceipt
          cashoutId={state.receiptId}
          receiptKind={state.receiptKind ?? null}
          receiptRef={state.receiptRef ?? null}
          receiptUrl={state.receiptUrl ?? null}
          receiptHash={state.receiptHash ?? null}
          walletNetwork={state.walletNetwork}
          proofToken={state.proofToken}
        />
      </div>
    );
  }

  if (pending && state?.receiptId) {
    return (
      <div className="mt-4 space-y-3">
        <OkBanner message={state.ok} />
        <p className="text-sm text-muted-foreground">
          Destinazione <span className="font-ledger">{state.walletAddress}</span>. Conversione
          sul libro (cassa virtuale): il negozio invia dalla liquidità on-chain se c’è. MetaMask,
          Trust Wallet o l’exchange ricevono senza firmare.
        </p>
        {state.instruction ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background/50 p-3 font-ledger text-xs ring-1 ring-primary/20">
            {state.instruction}
          </pre>
        ) : null}
        <SettleCashoutForm
          cashoutId={state.receiptId}
          payoutKind="WALLET"
          proofToken={state.proofToken}
          walletAddress={state.walletAddress}
          walletNetwork={state.walletNetwork}
          usdCents={state.usdCents}
          shopAddress={
            vault.find((item) => item.id === state.walletNetwork)?.address ?? selectedVault?.address
          }
          initialError={state.error}
        />
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        if (cryptoAmount > 0 && !isValidWalletAddress(walletAddress, cryptoAsset)) {
          event.preventDefault();
          setFormError(`Indirizzo non valido per ${selectedCrypto.label}.`);
        }
      }}
    >
      <ErrorBanner message={formError || state?.error} />
      <OkBanner message={state?.ok} />
      <p className="text-sm text-muted-foreground">
        Euro, dollari e franchi svizzeri restano nella <strong>cassa negozio</strong>. BTC, ETH,
        USDT, USDC e BNB bruciano i crediti nel libro (<strong>cassa virtuale</strong>). L’hash
        nasce solo all’uscita, se il wallet operativo ha già quelle monete. Chi riceve non firma.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Crediti → euro (negozio)
          <Input
            name="creditsEur"
            type="number"
            min={0}
            value={creditsEur || ""}
            onChange={(e) => setCreditsEur(Number(e.target.value))}
            className="mt-1 font-ledger"
            placeholder="0"
          />
          <span className="mt-1 block font-ledger text-ember">{previewEur}</span>
        </label>
        <label className="text-sm">
          Crediti → dollari (negozio)
          <Input
            name="creditsUsd"
            type="number"
            min={0}
            value={creditsUsd || ""}
            onChange={(e) => setCreditsUsd(Number(e.target.value))}
            className="mt-1 font-ledger"
            placeholder="0"
          />
          <span className="mt-1 block font-ledger text-ember">{previewUsd}</span>
        </label>
        <label className="text-sm">
          Crediti → franchi svizzeri (negozio)
          <Input
            name="creditsChf"
            type="number"
            min={0}
            value={creditsChf || ""}
            onChange={(e) => setCreditsChf(Number(e.target.value))}
            className="mt-1 font-ledger"
            placeholder="0"
          />
          <span className="mt-1 block font-ledger text-ember">{previewChf}</span>
        </label>
      </div>
      <div className="space-y-3 rounded-md bg-background/40 p-4 ring-1 ring-primary/15">
        <p className="text-sm font-medium">Crediti → crypto (cassa virtuale, poi payout on-chain)</p>
        <input type="hidden" name="cryptoAsset" value={cryptoAsset} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CRYPTO_CHOICES.map((asset) => (
            <label key={asset.id} className={chip}>
              <input
                type="radio"
                className="mt-1"
                checked={cryptoAsset === asset.id}
                onChange={() => {
                  setCryptoAsset(asset.id);
                  setFormError(null);
                }}
              />
              <span>
                <span className="block">{asset.label}</span>
                <span className="block text-xs text-muted-foreground">{asset.ticker}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="block text-sm">
          Crediti da convertire in {selectedCrypto.label}
          <Input
            name="creditsCrypto"
            type="number"
            min={0}
            value={creditsCrypto || ""}
            onChange={(e) => setCreditsCrypto(Number(e.target.value))}
            className="mt-1 font-ledger"
            placeholder="0"
          />
          <span className="mt-1 block font-ledger text-ember">{previewCrypto}</span>
        </label>
        {cryptoAmount > 0 ? (
          <label className="block text-sm">
            Wallet di destinazione (MetaMask, Trust Wallet, exchange)
            <Input
              name="walletAddress"
              required
              value={walletAddress}
              onChange={(e) => {
                setWalletAddress(e.target.value);
                setFormError(null);
              }}
              className="mt-1 font-ledger"
              placeholder={selectedCrypto.hint}
              autoComplete="off"
            />
            {walletAddress.trim() && !destOk ? (
              <span className="mt-1 block text-xs text-destructive">
                Indirizzo non valido per {selectedCrypto.ticker}.
              </span>
            ) : (
              <span className="mt-1 block text-xs text-muted-foreground">
                Il burn va in cassa virtuale; l’hash nasce all’uscita dalla liquidità on-chain
                {selectedVault?.address ? ` (${selectedVault.address})` : ""}. Un altro wallet? Un
                altro invio, stesso form.
              </span>
            )}
          </label>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Disponibili: {formatCredits(treasury)}. Tasso: 1 cr = {formatEurFromCents(eurCentsPerCredit)}{" "}
        · 1 cr = {formatFiatFromCents(usdCentsPerCredit, "USD")} · 1 cr ={" "}
        {formatFiatFromCents(chfCentsPerCredit, "CHF")}
      </p>
      <SubmitButton
        pendingLabel={cryptoAmount > 0 ? "Conversione e invio…" : "Conversione in corso…"}
      >
        {cryptoAmount > 0 ? `Converti e invia ${selectedCrypto.ticker}` : "Converti Tesoreria"}
      </SubmitButton>
    </form>
  );
}

export function InternalCryptoWithdrawForm({
  wallets,
  vault = [],
  usdCentsPerCredit,
}: {
  wallets: InternalCryptoWallet[];
  vault?: ShopVaultAsset[];
  usdCentsPerCredit: number;
}) {
  const [state, action] = useActionState(
    treasuryCryptoWithdrawAction,
    null as InternalWithdrawState | null,
  );
  const funded = wallets.filter((wallet) => wallet.remainingCredits > 0);
  const [asset, setAsset] = useState<TreasuryCryptoAsset>(funded[0]?.asset ?? "BTC");
  const [credits, setCredits] = useState(funded[0]?.remainingCredits ?? 0);
  const [walletAddress, setWalletAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const selected = wallets.find((wallet) => wallet.asset === asset) ?? wallets[0];
  const selectedVault = vault.find((item) => item.id === asset);
  const amount = Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
  const usdLabel = formatUsdFromCents(amount * usdCentsPerCredit);
  const pending = Boolean(state?.receiptId && (state.pending || state.status === "PENDING"));
  const paid = Boolean(state?.receiptId && state.status === "PAID");

  function pickAsset(next: TreasuryCryptoAsset) {
    setAsset(next);
    const wallet = wallets.find((item) => item.asset === next);
    setCredits(wallet?.remainingCredits ?? 0);
    setFormError(null);
  }

  if (paid && state?.receiptId) {
    return (
      <div className="mt-4 space-y-3">
        <OkBanner message={state.ok} />
        <CashoutReceipt
          cashoutId={state.receiptId}
          receiptKind={state.receiptKind ?? null}
          receiptRef={state.receiptRef ?? null}
          receiptUrl={state.receiptUrl ?? null}
          receiptHash={state.receiptHash ?? null}
          walletNetwork={state.walletNetwork}
          proofToken={state.proofToken}
        />
      </div>
    );
  }

  if (pending && state?.receiptId) {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Destinazione <span className="font-ledger">{state.walletAddress}</span>. Il negozio
          invia dalla liquidità on-chain: MetaMask, Trust Wallet o l’exchange ricevono senza
          firmare.
        </p>
        {state.instruction ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background/50 p-3 font-ledger text-xs ring-1 ring-primary/20">
            {state.instruction}
          </pre>
        ) : null}
        <SettleCashoutForm
          cashoutId={state.receiptId}
          payoutKind="WALLET"
          proofToken={state.proofToken}
          walletAddress={state.walletAddress}
          walletNetwork={state.walletNetwork}
          usdCents={state.usdCents}
          shopAddress={
            vault.find((item) => item.id === state.walletNetwork)?.address ??
            wallets.find((wallet) => wallet.asset === state.walletNetwork)?.shopAddress
          }
          initialError={state.error}
        />
      </div>
    );
  }

  if (funded.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        I wallet interni sono vuoti. Converti crediti di tesoreria in BTC, ETH, USDT, USDC o BNB
        indicando il wallet nel form di conversione, poi preleva da qui se resta saldo.
      </p>
    );
  }

  return (
    <form
      action={action}
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        if (!isValidWalletAddress(walletAddress, asset)) {
          event.preventDefault();
          setFormError(`Indirizzo non valido per ${selected?.label ?? asset}.`);
        }
      }}
    >
      <ErrorBanner message={formError || state?.error} />
      <OkBanner message={state?.ok} />
      <input type="hidden" name="cryptoAsset" value={asset} />
      <input type="hidden" name="confirmed" value="on" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {wallets.map((wallet) => {
          const rete = vault.find((item) => item.id === wallet.asset);
          return (
            <label key={wallet.asset} className={chip}>
              <input
                type="radio"
                className="mt-1"
                checked={asset === wallet.asset}
                disabled={wallet.remainingCredits <= 0}
                onChange={() => pickAsset(wallet.asset)}
              />
              <span>
                <span className="block">{wallet.label}</span>
                <span className="block font-ledger text-xs text-ember">{wallet.amountLabel}</span>
                <span className="block text-xs text-muted-foreground">
                  Libro {formatCredits(wallet.remainingCredits)} · Rete {rete?.amountLabel ?? "—"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {selectedVault?.address ? (
        <div className="rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
          <CopyField label={`Wallet operativo ${selectedVault.ticker} (on-chain)`} value={selectedVault.address} mono />
          {selectedVault.explorer ? (
            <a
              href={selectedVault.explorer}
              className="mt-2 inline-block text-xs underline hover:text-primary"
              target="_blank"
              rel="noreferrer"
            >
              Verifica su {selectedVault.id === "BTC" ? "Mempool" : selectedVault.id === "BNB" ? "BscScan" : "Etherscan"}
            </a>
          ) : null}
          {!selectedVault.hasFunds ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Ora la rete ha {selectedVault.amountLabel}. Finché questo indirizzo è a zero il negozio
              non può creare l’hash: i crediti del libro non sono {selectedVault.ticker}.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Crediti da prelevare
          <Input
            name="credits"
            type="number"
            min={1}
            max={selected?.remainingCredits ?? 0}
            value={amount || ""}
            onChange={(e) => setCredits(Number(e.target.value))}
            className="mt-1 font-ledger"
          />
          <span className="mt-1 block font-ledger text-ember">
            {usdLabel} in {selected?.ticker}
          </span>
        </label>
        <label className="text-sm">
          Wallet di destinazione (MetaMask, Trust Wallet, exchange)
          <Input
            name="walletAddress"
            value={walletAddress}
            onChange={(e) => {
              setWalletAddress(e.target.value);
              setFormError(null);
            }}
            className="mt-1 font-ledger"
            placeholder={CRYPTO_CHOICES.find((item) => item.id === asset)?.hint}
            autoComplete="off"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Massimo preleva dalla cassa virtuale. Il negozio invia {selected?.ticker} dalla liquidità
        on-chain ({selectedVault?.amountLabel ?? "saldo in lettura"}): MetaMask, Trust Wallet o
        l’exchange ricevono senza firmare. Rate limit, whitelist e massimali sono in Forgia.
      </p>
      <SubmitButton pendingLabel="Invio sulla rete…">
        Preleva: il negozio invia e genera l’hash
      </SubmitButton>
    </form>
  );
}

export function PendingCashoutCard({
  id,
  name,
  email,
  credits,
  eurCents,
  usdCents,
  chfCents = 0,
  currency,
  payoutKind,
  iban,
  ibanHolder,
  walletAddress,
  walletNetwork,
  createdLabel,
  shopAddress,
}: {
  id: string;
  name: string;
  email: string;
  credits: number;
  eurCents: number;
  usdCents: number;
  chfCents?: number;
  currency: string;
  payoutKind: string;
  iban: string | null;
  ibanHolder: string | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  createdLabel: string;
  shopAddress?: string | null;
}) {
  const [payState, payAction] = useActionState(resolveCashoutAction, null);
  const [rejectState, rejectAction] = useActionState(resolveCashoutAction, null);
  const amountLabel = formatCashoutValue({ currency, eurCents, usdCents, chfCents });

  const dest = destinationInstruction({
    payoutKind,
    holder: ibanHolder,
    iban,
    walletAddress,
    walletNetwork,
    currency,
    eurCents,
    usdCents,
    chfCents,
    cashoutId: id,
  });
  const isWallet = dest?.kind === "WALLET";
  const isUsd = currency === "USD";
  const isChf = currency === "CHF";
  const houseBank = housePayoutByIban(iban, currency);

  return (
    <li className="metal-frame rounded-md bg-card p-4">
      <p>
        {name} <span className="text-muted-foreground">({email})</span>
      </p>
      <p className="font-ledger text-ember">
        {formatCredits(credits)} → {amountLabel}
        {isWallet
          ? ` · ${walletNetworkLabel(walletNetwork)}`
          : houseBank
            ? ` · ${houseBank.bank} · ${houseBank.preferredCurrency}`
            : isUsd
              ? " · IBAN · USD"
              : isChf
                ? " · IBAN · CHF"
                : " · IBAN · EUR"}
      </p>
      <p className="text-xs text-muted-foreground">{createdLabel}</p>

      {dest?.kind === "IBAN" && ibanHolder ? (
        <div className="mt-4 space-y-3 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Da incollare in banca</p>
          {houseBank ? <CopyField label="Banca" value={houseBank.bank} /> : null}
          <CopyField label="Beneficiario" value={ibanHolder} />
          <CopyField label="IBAN" value={dest.ibanDisplay} mono />
          <CopyField label="Importo" value={dest.amountLabel ?? amountLabel} mono />
          <CopyField label="Causale" value={dest.causal} mono />
          <CopyField label="Tutto il blocco" value={dest.text} />
        </div>
      ) : dest?.kind === "WALLET" && walletAddress ? (
        <div className="mt-4 space-y-3 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Destinazione: il negozio invia qui</p>
          <CopyField label="Crypto" value={walletNetworkLabel(walletNetwork)} />
          <CopyField label="Indirizzo che riceve" value={walletAddress} mono />
          <CopyField label="Importo" value={dest.amountLabel ?? amountLabel} mono />
          <CopyField label="Riferimento" value={dest.causal} mono />
          {shopAddress ? <CopyField label="Wallet del negozio (mittente)" value={shopAddress} mono /> : null}
          <p className="text-xs text-muted-foreground">
            MetaMask, Trust Wallet e gli exchange ricevono. Non devono firmare né dare consensi.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-destructive">
          Manca la destinazione: non pagare finché il cliente non indica IBAN o wallet.
        </p>
      )}

      <ErrorBanner message={payState?.error || rejectState?.error} />
      <OkBanner message={payState?.ok || rejectState?.ok} />

      {isWallet && walletAddress && isShopSendableNetwork(walletNetwork) ? (
        <form action={payAction} className="mt-3 space-y-2">
          <input type="hidden" name="cashoutId" value={id} />
          <input type="hidden" name="payoutKind" value="WALLET" />
          <SubmitButton size="sm" name="action" value="shopPay" pendingLabel="Invio sulla rete…">
            Conferma: il negozio invia e genera l’hash
          </SubmitButton>
        </form>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <form action={payAction} noValidate className="w-full space-y-2 sm:w-auto">
          <input type="hidden" name="cashoutId" value={id} />
          <input type="hidden" name="payoutKind" value={isWallet ? "WALLET" : "IBAN"} />
          <label className="block text-sm">
            {isWallet ? "Hash già sulla rete (solo se l’invio è già partito)" : "CRO / riferimento bonifico (ricevuta)"}
            <Input
              name="receipt"
              required={!isWallet}
              autoComplete="off"
              className="mt-1 max-w-xl font-ledger"
              placeholder={isWallet ? "0x… facoltativo" : "CRO o end-to-end ID"}
            />
          </label>
          {isWallet ? (
            <p className="text-xs text-muted-foreground">
              L’hash lo crea la rete dopo l’invio dal wallet del negozio. Chi riceve non firma.
            </p>
          ) : null}
          {isWallet ? null : (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="sepaConfirm" value="on" className="mt-0.5" required />
              {isUsd
                ? "Ho disposto il bonifico in dollari (SWIFT/estero) dal mio conto verso questo IBAN."
                : isChf
                  ? "Ho disposto il bonifico in franchi svizzeri (SIC/estero) dal mio conto verso questo IBAN."
                  : "Ho disposto il bonifico SEPA dal mio conto verso questo IBAN."}
            </label>
          )}
          {isWallet ? <input type="hidden" name="payoutConfirm" value="on" /> : null}
          <div className="flex flex-wrap gap-2">
            {isWallet ? (
              <SubmitButton size="sm" variant="outline" formNoValidate name="action" value="search">
                {explorerSearchLabel(walletNetwork)}
              </SubmitButton>
            ) : null}
            <SubmitButton size="sm" formNoValidate name="action" value="pay" variant={isWallet ? "outline" : "default"}>
              {isWallet ? "Registra hash e chiudi" : "Chiudi prelievo con CRO"}
            </SubmitButton>
          </div>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="cashoutId" value={id} />
          <input type="hidden" name="action" value="reject" />
          <SubmitButton size="sm" variant="outline">
            Rifiuta
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
