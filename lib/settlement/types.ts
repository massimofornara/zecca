export type SettlementRail = "WALLET" | "IBAN";

export type SettlementProofKind = "TX_HASH" | "BANK_REF" | "PROVIDER_REF" | "GATEWAY_RECEIVED";

export type CryptoInstruction = {
  rail: "WALLET";
  asset: string;
  destination: string;
  usdCents: number;
  idempotencyKey: string;
};

export type FiatInstruction = {
  rail: "IBAN";
  currency: "EUR" | "USD" | "CHF";
  iban: string;
  holder: string;
  amountCents: number;
  idempotencyKey: string;
  reference: string;
};

export type SettlementInstruction = CryptoInstruction | FiatInstruction;

export type ExecutedSettlement = {
  status: "EXECUTED";
  provider: string;
  proofKind: "TX_HASH" | "BANK_REF" | "GATEWAY_RECEIVED";
  ref: string;
  url: string | null;
  signer: string | null;
};

export type DispatchedSettlement = {
  status: "DISPATCHED";
  provider: string;
  proofKind: "PROVIDER_REF";
  ref: string;
  url: string | null;
  signer: string | null;
};

export type DeferredSettlement = {
  status: "DEFERRED";
  provider: string;
  code: string;
  reason: string;
};

export type SettlementResult = ExecutedSettlement | DispatchedSettlement | DeferredSettlement;

export type SettlementFetch = typeof fetch;

export type ProviderHealth = {
  id: string;
  label: string;
  rails: string[];
  ready: boolean;
  detail: string;
};
