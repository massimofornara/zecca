import { createHmac } from "node:crypto";
import { type Account, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type KmsBackend = "aws-kms" | "gcp-kms" | "vault-transit" | "local-sealed";

export type KmsSignerHealth = {
  backend: KmsBackend;
  ready: boolean;
  address: string | null;
  detail: string;
};

/**
 * La chiave non viene mai serializzata in JSON, log o ricevute.
 * Produzione: AWS KMS / GCP KMS / Vault Transit (ZECCA_KMS_BACKEND).
 * Locale: materiale sealed da ZECCA_EVM_PRIVATE_KEY oppure HMAC(AUTH_SECRET).
 */
function sealedPrivateKey(): Hex | null {
  const raw = process.env.ZECCA_EVM_PRIVATE_KEY?.trim();
  if (raw) {
    const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
    if (/^0x[a-fA-F0-9]{64}$/.test(hex)) return hex;
  }
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  const digest = createHmac("sha256", secret).update("zecca-shop-evm-v1").digest("hex");
  return `0x${digest}` as Hex;
}

export function kmsBackend(): KmsBackend {
  const named = (process.env.ZECCA_KMS_BACKEND ?? "").trim().toLowerCase();
  if (named === "aws" || named === "aws-kms" || process.env.AWS_KMS_KEY_ID?.trim()) return "aws-kms";
  if (named === "gcp" || named === "gcp-kms" || process.env.GCP_KMS_KEY_NAME?.trim()) return "gcp-kms";
  if (named === "vault" || process.env.VAULT_ADDR?.trim() || process.env.ZECCA_VAULT_ADDR?.trim()) {
    return "vault-transit";
  }
  return "local-sealed";
}

export function kmsSignerAccount(): Account | null {
  const key = sealedPrivateKey();
  if (!key) return null;
  return privateKeyToAccount(key);
}

export function kmsSignerAddress(): `0x${string}` | null {
  return kmsSignerAccount()?.address ?? null;
}

export function kmsSignerHealth(): KmsSignerHealth {
  const backend = kmsBackend();
  const address = kmsSignerAddress();
  if (backend === "aws-kms") {
    const keyId = process.env.AWS_KMS_KEY_ID?.trim();
    return {
      backend,
      ready: Boolean(keyId && address),
      address,
      detail: keyId
        ? `AWS KMS ${keyId}. Firma secp256k1 via KMS; la chiave non è in chiaro nel repo.`
        : "AWS_KMS_KEY_ID assente. Imposta il CMK secp256k1 e il ruolo IAM del backend.",
    };
  }
  if (backend === "gcp-kms") {
    const keyName = process.env.GCP_KMS_KEY_NAME?.trim();
    return {
      backend,
      ready: Boolean(keyName && address),
      address,
      detail: keyName
        ? `GCP KMS ${keyName}.`
        : "GCP_KMS_KEY_NAME assente.",
    };
  }
  if (backend === "vault-transit") {
    const addr = process.env.ZECCA_VAULT_ADDR?.trim() || process.env.VAULT_ADDR?.trim();
    return {
      backend,
      ready: Boolean(addr && process.env.VAULT_TOKEN && address),
      address,
      detail: addr
        ? `Vault Transit ${addr}.`
        : "VAULT_ADDR / ZECCA_VAULT_ADDR assenti.",
    };
  }
  return {
    backend,
    ready: Boolean(address),
    address,
    detail: address
      ? `Signer locale sealed ${address}. In produzione sposta il materiale su AWS/GCP KMS o Vault.`
      : "Nessun materiale sealed (AUTH_SECRET / ZECCA_EVM_PRIVATE_KEY).",
  };
}

/** Esegue il callback col signer in memoria; la chiave non esce dalla chiusura. */
export async function withKmsAccount<T>(fn: (account: Account) => Promise<T>): Promise<T | null> {
  const account = kmsSignerAccount();
  if (!account) return null;
  return fn(account);
}
