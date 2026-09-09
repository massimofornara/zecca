import { CopyField } from "@/components/copy/CopyField";
import { receiptLabel } from "@/lib/receipt";

export function CashoutReceipt({
  receiptKind,
  receiptRef,
  receiptUrl,
  walletNetwork,
}: {
  receiptKind: string | null;
  receiptRef: string | null;
  receiptUrl: string | null;
  walletNetwork?: string | null;
}) {
  if (!receiptRef) return null;
  return (
    <div className="mt-2 space-y-2 rounded-md bg-background/50 p-3 ring-1 ring-primary/20">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Ricevuta del prelievo</p>
      <CopyField label={receiptLabel(receiptKind, walletNetwork)} value={receiptRef} mono />
      {receiptUrl ? (
        <a
          href={receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm text-ember underline-offset-2 hover:underline"
        >
          Apri sulla rete
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">
          Conserva questo riferimento: è la prova del bonifico eseguito dalla banca.
        </p>
      )}
    </div>
  );
}
