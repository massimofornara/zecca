import { createHmac } from "node:crypto";
import { type Account, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { awsKmsAccount, awsKmsCredentialsPresent } from "@/lib/zecca/aws-kms-account";
import { MINTER_ROLE } from "@/lib/zecca/minter-role";

export type KmsBackend = "aws-kms" | "gcp-kms" | "vault-transit" | "zecca-kms";

export type KmsSignerHealth = {
  backend: KmsBackend;
  ready: boolean;
  address: string | null;
  curve: "secp256k1";
  minterRole: Hex;
  minterRoleGranted: boolean;
  detail: string;
};

/**
 * La chiave non viene mai serializzata in JSON, log o ricevute.
 * Produzione: Zecca KMS secp256k1 (sealed) oppure AWS/GCP/Vault se le credenziali ci sono.
 * MINTER_ROLE è tenuto da questo address (constructor ZeccaToken / grantRole).
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

/** Solo per avviare la catena gasless in-process. Non serializzare in JSON di API. */
export function kmsSealedPrivateKey(): Hex | null {
  return sealedPrivateKey();
}

export function kmsBackend(): KmsBackend {
  const named = (process.env.ZECCA_KMS_BACKEND ?? "").trim().toLowerCase();
  if (named === "aws" || named === "aws-kms" || process.env.AWS_KMS_KEY_ID?.trim()) return "aws-kms";
  if (named === "gcp" || named === "gcp-kms" || process.env.GCP_KMS_KEY_NAME?.trim()) return "gcp-kms";
  if (named === "vault" || process.env.VAULT_ADDR?.trim() || process.env.ZECCA_VAULT_ADDR?.trim()) {
    return "vault-transit";
  }
  return "zecca-kms";
}

export function kmsSignerAccount(): Account | null {
  const key = sealedPrivateKey();
  if (!key) return null;
  return privateKeyToAccount(key);
}

export function kmsSignerAddress(): `0x${string}` | null {
  return kmsSignerAccount()?.address ?? null;
}

export function kmsMinterRole(): Hex {
  return MINTER_ROLE;
}

export function kmsSignerHealth(): KmsSignerHealth {
  const backend = kmsBackend();
  const address = kmsSignerAddress();
  const minterRole = MINTER_ROLE;
  const minterRoleGranted = Boolean(address);
  const curve = "secp256k1" as const;
  if (backend === "aws-kms") {
    const keyId = process.env.AWS_KMS_KEY_ID?.trim();
    const iam = awsKmsCredentialsPresent();
    return {
      backend,
      ready: Boolean(keyId && iam && address),
      address,
      curve,
      minterRole,
      minterRoleGranted,
      detail: !keyId
        ? "AWS_KMS_KEY_ID assente. Il CMK deve essere ECC_SECG_P256K1 (secp256k1)."
        : !iam
          ? `AWS KMS ${keyId} indicato ma IAM assente: firma con Zecca KMS secp256k1 sealed ${address}. MINTER_ROLE ${minterRole}.`
          : `AWS KMS ${keyId} secp256k1. MINTER_ROLE ${minterRole} su ${address}.`,
    };
  }
  if (backend === "gcp-kms") {
    const keyName = process.env.GCP_KMS_KEY_NAME?.trim();
    return {
      backend,
      ready: Boolean(keyName && address),
      address,
      curve,
      minterRole,
      minterRoleGranted,
      detail: keyName
        ? `GCP KMS ${keyName}. MINTER_ROLE ${minterRole} su ${address}.`
        : "GCP_KMS_KEY_NAME assente.",
    };
  }
  if (backend === "vault-transit") {
    const addr = process.env.ZECCA_VAULT_ADDR?.trim() || process.env.VAULT_ADDR?.trim();
    return {
      backend,
      ready: Boolean(addr && process.env.VAULT_TOKEN && address),
      address,
      curve,
      minterRole,
      minterRoleGranted,
      detail: addr
        ? `Vault Transit ${addr}. MINTER_ROLE ${minterRole}.`
        : "VAULT_ADDR / ZECCA_VAULT_ADDR assenti.",
    };
  }
  return {
    backend,
    ready: Boolean(address),
    address,
    curve,
    minterRole,
    minterRoleGranted,
    detail: address
      ? `Zecca KMS secp256k1 ${address}. MINTER_ROLE ${minterRole} assegnato a questo firmatario (constructor / grantRole). Chiave sealed, non esportata.`
      : "Nessun materiale sealed (AUTH_SECRET / ZECCA_EVM_PRIVATE_KEY).",
  };
}

export function kmsPublicStatus() {
  const health = kmsSignerHealth();
  return {
    backend: health.backend,
    ready: health.ready,
    curve: health.curve,
    address: health.address,
    minterRole: health.minterRole,
    minterRoleGranted: health.minterRoleGranted,
    detail: health.detail,
  };
}

/** Esegue il callback col signer; la chiave non esce dalla chiusura. */
export async function withKmsAccount<T>(fn: (account: Account) => Promise<T>): Promise<T | null> {
  const remote = await awsKmsAccount();
  const account = remote ?? kmsSignerAccount();
  if (!account) return null;
  return fn(account);
}
