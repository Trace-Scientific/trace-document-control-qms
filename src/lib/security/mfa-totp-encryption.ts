import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope for TOTP seeds. Key material must be provisioned outside
// the database and never logged. Ciphertext is bound to the tenant and user.
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_SECRET_BYTES = 128;

function keyFromBase64(encoded: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Invalid MFA encryption key");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Invalid MFA encryption key");
  return key;
}

function associatedData(organizationId: string, userId: string, keyVersion: string): Buffer {
  if (!organizationId || !userId || !keyVersion) throw new Error("Missing MFA encryption context");
  return Buffer.from(JSON.stringify([organizationId, userId, keyVersion]), "utf8");
}

export function encryptTotpSecret(input: {
  secret: Uint8Array; organizationId: string; userId: string;
  keyVersion: string; encryptionKeyBase64: string;
}): string {
  const { secret, organizationId, userId, keyVersion, encryptionKeyBase64 } = input;
  if (secret.length < 16 || secret.length > MAX_SECRET_BYTES) throw new Error("Invalid TOTP secret length");
  const key = keyFromBase64(encryptionKeyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(organizationId, userId, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptTotpSecret(input: {
  encryptedSecret: string; organizationId: string; userId: string;
  keyVersion: string; encryptionKeyBase64: string;
}): Buffer {
  const { encryptedSecret, organizationId, userId, keyVersion, encryptionKeyBase64 } = input;
  const key = keyFromBase64(encryptionKeyBase64);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encryptedSecret)) {
    throw new Error("Invalid encrypted TOTP secret");
  }
  const packed = Buffer.from(encryptedSecret, "base64");
  if (packed.length < IV_BYTES + TAG_BYTES + 16 || packed.length > IV_BYTES + TAG_BYTES + MAX_SECRET_BYTES ||
      packed.toString("base64") !== encryptedSecret) throw new Error("Invalid encrypted TOTP secret");
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(associatedData(organizationId, userId, keyVersion));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
