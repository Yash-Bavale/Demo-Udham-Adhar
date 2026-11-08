/**
 * Server-only AES-256-GCM for per-employee SIP passwords (WebCrypto: works on workerd and Node).
 * Ciphertext format: "v1.<base64 iv>.<base64 ciphertext+tag>". The employee id is bound as
 * additional authenticated data, so a ciphertext copied onto another employee's row fails to decrypt.
 */
export const CRYPTO_VERSION = "v1";

export class TelephonyKeyError extends Error {}

function b64(bytes: Uint8Array): string {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
}

/** Validates the key format without revealing it. Requires at least 32 non-whitespace characters. */
export function validateKey(raw: string | undefined | null): string {
  const k = (raw ?? "").trim();
  if (!k) throw new TelephonyKeyError("Telephony credential key is not configured.");
  if (k.length < 32 || /\s/.test(k)) throw new TelephonyKeyError("Telephony credential key is invalid.");
  return k;
}

async function importKey(raw: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bhs-telephony-v1:${validateKey(raw)}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string, employeeId: string, rawKey: string | undefined = process.env["TELEPHONY_CREDENTIAL_KEY"]): Promise<string> {
  if (!plain) throw new Error("Nothing to encrypt.");
  const key = await importKey(rawKey ?? "");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(employeeId) }, key, new TextEncoder().encode(plain)));
  return `${CRYPTO_VERSION}.${b64(iv)}.${b64(ct)}`;
}

/** Throws on tampering, wrong key, or wrong employee binding. Never includes the secret in errors. */
export async function decryptSecret(blob: string, employeeId: string, rawKey: string | undefined = process.env["TELEPHONY_CREDENTIAL_KEY"]): Promise<string> {
  const parts = (blob ?? "").split(".");
  if (parts.length !== 3 || parts[0] !== CRYPTO_VERSION) throw new Error("Stored credential has an unknown format.");
  const key = await importKey(rawKey ?? "");
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(parts[1]), additionalData: new TextEncoder().encode(employeeId) }, key, unb64(parts[2]));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Stored credential could not be decrypted.");
  }
}
