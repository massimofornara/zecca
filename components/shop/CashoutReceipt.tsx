import { CopyField } from "@/components/copy/CopyField";
import { explorerLinks, receiptLabel } from "@/lib/receipt";

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
  return (
    <div className="mt-2 space-y-2 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Ricevuta del prelievo</p>
      {receiptRef ? <CopyField label={receiptLabel(receiptKind, walletNetwork)} value={receiptRef} mono /> : null}
      {receiptHash ? <CopyField label="Hash ricevuta (SHA-256)" value={receiptHash} mono /> : null}
      {receiptKind === "TX_HASH" ? (
        <p className="text-xs text-ember">
          Hash di rete verificato. Aprilo sugli explorer: è visibile solo se la transazione è già confermata.
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
        {receiptKind === "TX_HASH" && receiptRef
          ? explorerLinks(walletNetwork, receiptRef).map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-ember underline-offset-2 hover:underline"
              >
                {link.label}
              </a>
            ))
          : receiptUrl ? (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-ember underline-offset-2 hover:underline"
              >
                Apri sulla rete
              </a>
            ) : null}
      </div>
    </div>
  );
}
