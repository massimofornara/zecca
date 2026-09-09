import { normalizeIban } from "@/lib/iban";
import { parseFiatCurrency, type FiatCurrency } from "@/lib/zecca/fiat";

export type Pain001Credit = {
  endToEndId: string;
  amountCents: number;
  currency: FiatCurrency | string;
  creditorName: string;
  creditorIban: string;
  remittance: string;
};

export type SepaDebtor = {
  name: string;
  iban: string;
};

export function sepaDebtorConfig(): SepaDebtor | null {
  const iban = process.env.ZECCA_SEPA_DEBTOR_IBAN?.trim();
  const name = process.env.ZECCA_SEPA_DEBTOR_NAME?.trim();
  if (!iban) return null;
  return {
    iban: normalizeIban(iban),
    name: name || "Zecca",
  };
}

export function sepaDebtorBlocker(): string | null {
  if (sepaDebtorConfig()) return null;
  return "ZECCA_SEPA_DEBTOR_IBAN assente: il file pain.001 UniCredit richiede il conto ordinante (da cui parti), distinto dall’IBAN beneficiario UniCredit di Massimo. Senza quel conto il SEPA non può partire da questo runtime.";
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function amountDecimal(cents: number) {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function isoDate(at = new Date()) {
  return at.toISOString().slice(0, 10);
}

function isoDateTime(at = new Date()) {
  return at.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function compactId(prefix: string, at = new Date()) {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${prefix}${stamp}`.slice(0, 35);
}

/** ISO 20022 pain.001.001.03 — distinta crediti da caricare su UniCredit Corporate. */
export function buildPain001Document(input: {
  debtor: SepaDebtor;
  credits: Pain001Credit[];
  createdAt?: Date;
}): string {
  const at = input.createdAt ?? new Date();
  const sepa = input.credits.filter((row) => parseFiatCurrency(row.currency) === "EUR");
  const ctrl = sepa.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0);
  const msgId = compactId("ZECCA-", at);
  const pmtInfId = compactId("PMT-", at);
  const txs = sepa
    .map((row) => {
      const ccy = parseFiatCurrency(row.currency);
      const e2e = row.endToEndId.replace(/[^A-Za-z0-9/?:().,'+ -]/g, "").slice(0, 35);
      return `        <CdtTrfTxInf>
          <PmtId>
            <InstrId>${xmlEscape(e2e.slice(0, 35))}</InstrId>
            <EndToEndId>${xmlEscape(e2e)}</EndToEndId>
          </PmtId>
          <Amt>
            <InstdAmt Ccy="${ccy}">${amountDecimal(row.amountCents)}</InstdAmt>
          </Amt>
          <Cdtr>
            <Nm>${xmlEscape(row.creditorName.slice(0, 70))}</Nm>
          </Cdtr>
          <CdtrAcct>
            <Id>
              <IBAN>${xmlEscape(normalizeIban(row.creditorIban))}</IBAN>
            </Id>
          </CdtrAcct>
          <RmtInf>
            <Ustrd>${xmlEscape(row.remittance.slice(0, 140))}</Ustrd>
          </RmtInf>
        </CdtTrfTxInf>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xmlEscape(msgId)}</MsgId>
      <CreDtTm>${isoDateTime(at)}</CreDtTm>
      <NbOfTxs>${sepa.length}</NbOfTxs>
      <CtrlSum>${amountDecimal(ctrl)}</CtrlSum>
      <InitgPty>
        <Nm>${xmlEscape(input.debtor.name.slice(0, 70))}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xmlEscape(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${sepa.length}</NbOfTxs>
      <CtrlSum>${amountDecimal(ctrl)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${isoDate(at)}</ReqdExctnDt>
      <Dbtr>
        <Nm>${xmlEscape(input.debtor.name.slice(0, 70))}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${xmlEscape(normalizeIban(input.debtor.iban))}</IBAN>
        </Id>
      </DbtrAcct>
      <ChrgBr>SLEV</ChrgBr>
${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

export function buildPaymentCsv(rows: {
  rail: string;
  asset: string;
  amountLabel: string;
  beneficiary: string;
  ibanOrWallet: string;
  bookRef: string;
  bankOrChainRef: string;
  phase: string;
}[]): string {
  const header = [
    "binario",
    "asset",
    "importo",
    "beneficiario",
    "iban_o_wallet",
    "ricevuta_zecca",
    "trn_o_tx_hash",
    "stato",
  ];
  const lines = rows.map((row) =>
    [
      row.rail,
      row.asset,
      row.amountLabel,
      row.beneficiary,
      row.ibanOrWallet,
      row.bookRef,
      row.bankOrChainRef,
      row.phase,
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(";"),
  );
  return [header.join(";"), ...lines].join("\n") + "\n";
}
