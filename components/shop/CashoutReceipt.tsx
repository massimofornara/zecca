import { CopyField } from "@/components/copy/CopyField";
import { explorerLinks, receiptLabel } from "@/lib/receipt";
import { isCircleUsdcReceipt, isLocalOrInternalExplorer, isUsdcCashoutNetwork } from "@/lib/settlement/circle-ref";
import { isGatewayReceiptRef } from "@/lib/settlement/gateway-ref";

export function CashoutReceipt({
  cashoutId,
  receiptKind,
  receiptRef,
  receiptUrl,
  receiptHash,
  walletNetwork,
  proofToken,
}: {
  cashoutId?: string;
  receiptKind: string | null;
  receiptRef: string | null;
  receiptUrl: string | null;
  receiptHash?: string | null;
  walletNetwork?: string | null;
  proofToken?: string | null;
}) {
  if (!receiptRef && !receiptHash) return null;
  const gatewayRef = isGatewayReceiptRef(receiptRef);
  const gatewayPage =
    gatewayRef && receiptRef
      ? `/ricevuta-gateway/${encodeURIComponent(receiptRef)}`
      : receiptKind === "GATEWAY_RECEIVED" && receiptUrl
        ? receiptUrl
        : null;
  const circleUsdc = isCircleUsdcReceipt({ receiptKind, receiptRef, receiptUrl, walletNetwork });
  const fakeUsdcHash =
    receiptKind === "TX_HASH" && isUsdcCashoutNetwork(walletNetwork) && !circleUsdc;
  const executedLabel =
    receiptKind === "GATEWAY_RECEIVED" ||
    receiptKind === "CIRCLE_TRANSFER" ||
    (receiptKind === "TX_HASH" && !fakeUsdcHash);

  return (
    <div className="mt-2 space-y-2 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">
        {executedLabel
          ? "EXECUTED AND RECEIVED"
          : receiptKind === "SEPA_DISPOSED"
            ? "Bonifico disposto"
            : fakeUsdcHash
              ? "Non è un invio Circle"
              : "Ricevuta del prelievo"}
      </p>
      {receiptRef ? <CopyField label={receiptLabel(receiptKind, walletNetwork)} value={receiptRef} mono /> : null}
      {receiptHash ? <CopyField label="Hash ricevuta (SHA-256)" value={receiptHash} mono /> : null}
      {fakeUsdcHash ? (
        <p className="text-xs text-ember">
          Questo hash non è un trasferimento Circle USDC su Base (catena interna o localhost). Non è
          un accredito MetaMask/Kraken. La richiesta va riaperta e inviata dal wallet Circle.
        </p>
      ) : receiptKind === "TX_HASH" && isUsdcCashoutNetwork(walletNetwork) ? (
        <p className="text-xs text-ember">
          USDC inviato su Base dal wallet Circle del negozio. Hash su BaseScan, non su /catena.
        </p>
      ) : receiptKind === "TX_HASH" ? (
        <p className="text-xs text-ember">
          EXECUTED AND RECEIVED. Hash di rete verificato sulla catena del negozio. Non aprirlo su
          etherscan.io se è un mint Zecca Gasless: è visibile su /catena.
        </p>
      ) : receiptKind === "GATEWAY_RECEIVED" ? (
        <p className="text-xs text-ember">
          EXECUTED AND RECEIVED. Attestazione firmata del gateway di liquidazione Zecca. Non è un
          CRO UniCredit, non è un ID Wise e non è un tx_hash Mempool/Etherscan.
        </p>
      ) : receiptKind === "PROVIDER_REF" ? (
        <p className="text-xs text-muted-foreground">
          Inviato al provider di liquidazione. Non è ancora un tx_hash di explorer né un CRO
          bancario. EXECUTED solo quando il provider restituisce la prova verificabile.
        </p>
      ) : receiptKind === "READY_FOR_SIGNATURE" ? (
        <p className="text-xs text-muted-foreground">
          READY_FOR_SIGNATURE. Payload ISO 20022 pain.001 archiviato e firmato HMAC. Non è un CRO
          UniCredit: la clearing house riceve il file solo con API BaaS/QWAC.
        </p>
      ) : receiptKind === "AUTHORIZED_PENDING_GATEWAY" || receiptKind === "QUEUED_FOR_SETTLEMENT" ? (
        <p className="text-xs text-muted-foreground">
          AUTHORIZED_PENDING_GATEWAY. Istruzione contabile firmata. Non è un CRO, non è un ID Wise e
          non è un tx_hash. EXECUTED solo quando il gateway o il minter restituiscono una prova
          verificabile.
        </p>
      ) : receiptKind === "SEPA_DISPOSED" ? (
        <p className="text-xs text-ember">
          Attestazione di Massimo: il bonifico SEPA è stato disposto dalla sua banca verso l’IBAN
          indicato. Non è un CRO UniCredit e non è un payout Stripe verso il cliente.
        </p>
      ) : receiptKind === "CIRCLE_TRANSFER" ? (
        <p className="text-xs text-ember">
          Trasferimento Circle USDC su Base dal wallet del negozio. Se manca l’hash 0x… non aprirlo
          su BaseScan: l’ID Circle è la prova dell’API, non un CRO.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ricevuta del libro mastro. Non è un accredito UniCredit o Wise: gli euro arrivano solo se il bonifico è
          partito da una banca vera.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {cashoutId ? (
          <a
            href={
              proofToken
                ? `/ricevuta/${cashoutId}?p=${encodeURIComponent(proofToken)}`
                : `/ricevuta/${cashoutId}`
            }
            className="text-sm text-ember underline-offset-2 hover:underline"
          >
            Apri la ricevuta ufficiale
          </a>
        ) : null}
        {gatewayPage ? (
          <a href={gatewayPage} className="text-sm text-ember underline-offset-2 hover:underline">
            Ricevuta di trasmissione gateway
          </a>
        ) : null}
        {receiptKind === "TX_HASH" && receiptRef && !(isUsdcCashoutNetwork(walletNetwork) && isLocalOrInternalExplorer(receiptUrl))
          ? explorerLinks(walletNetwork, receiptRef, receiptUrl).map((link) => (
              <a
                key={link.url}
                href={link.url}
                className="text-sm text-ember underline-offset-2 hover:underline"
              >
                {link.label}
              </a>
            ))
          : null}
      </div>
    </div>
  );
}
