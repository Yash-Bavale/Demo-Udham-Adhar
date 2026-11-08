/** Normalise and validate an Indian GSTIN (15 chars: 2-digit state + PAN + entity + Z + checksum). */
export function normalizeGstin(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, "").toUpperCase();
}

const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function isValidGstin(raw: string): boolean {
  const g = normalizeGstin(raw);
  if (!GSTIN_RE.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}
