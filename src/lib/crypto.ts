import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts secrets (Plaid access_token) before they are stored in the database.
 * Key: ENCRYPTION_KEY (64 hex chars = 32 bytes). If missing, it is derived from SESSION_SECRET.
 */
function key() {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  const base = process.env.SESSION_SECRET;
  if (!base) throw new Error("Set ENCRYPTION_KEY (or SESSION_SECRET) to store bank credentials.");
  return createHash("sha256").update(base).digest();
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(payload: string) {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
