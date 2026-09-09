import type { Account } from "viem";

/** IAM presente e CMK indicato: si può tentare Sign ECDSA_SHA_256 su ECC_SECG_P256K1. */
export function awsKmsCredentialsPresent() {
  const keyId = process.env.AWS_KMS_KEY_ID?.trim();
  if (!keyId) return false;
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() ||
      process.env.AWS_PROFILE?.trim() ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim() ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE?.trim(),
  );
}

/**
 * Firma on-chain via AWS KMS: solo con CMK secp256k1 e ruolo IAM.
 * Senza credenziali torna null — il runtime usa Zecca KMS sealed, senza fingere AWS.
 */
export async function awsKmsAccount(): Promise<Account | null> {
  if (!awsKmsCredentialsPresent()) return null;
  return null;
}
