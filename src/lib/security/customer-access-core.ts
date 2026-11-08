/**
 * Pure rules for customer access tokens (browser- and server-safe, no I/O).
 *
 * A token looks like `<kind>_<43 base64url chars>` (256 random bits). The
 * prefix only tells the browser which slot to store it in; authority comes
 * from the server-side hash lookup, never from the prefix.
 */
export const TOKEN_KINDS = ["co", "ob"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

export const ACCESS_SCOPES = [
  "summary",
  "payment",
  "contact_update",
  "status",
  "onboarding",
  "documents",
  "help",
] as const;
export type AccessScope = (typeof ACCESS_SCOPES)[number];

/** Allowlisted scopes per token kind. Onboarding tokens can never pay. */
export const KIND_SCOPES: Record<TokenKind, readonly AccessScope[]> = {
  co: ["summary", "payment", "contact_update", "status"],
  ob: ["summary", "status", "onboarding", "documents", "help"],
};

/** Default lifetimes in hours. */
export const KIND_TTL_HOURS: Record<TokenKind, number> = {
  co: 24 * 7,
  ob: 24 * 30,
};

const TOKEN_RE = /^(co|ob)_[A-Za-z0-9_-]{43}$/;

export function parseTokenKind(raw: unknown): TokenKind | null {
  if (typeof raw !== "string" || !TOKEN_RE.test(raw)) return null;
  return raw.slice(0, 2) as TokenKind;
}

export function scopeAllowed(kind: TokenKind, scopes: readonly string[], scope: AccessScope): boolean {
  return KIND_SCOPES[kind].includes(scope) && scopes.includes(scope);
}

export type TokenRow = {
  kind: string;
  lead_id: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  max_uses: number | null;
  use_count: number;
};

export type DenyReason = "malformed" | "not_found" | "revoked" | "expired" | "used_up" | "scope" | "wrong_order";

/** Decide whether a stored token row grants `scope` on `leadId`. */
export function evaluateToken(
  row: TokenRow | null,
  rawKind: TokenKind,
  leadId: string | null,
  scope: AccessScope,
  now: number = Date.now(),
): { ok: true } | { ok: false; reason: DenyReason } {
  if (!row) return { ok: false, reason: "not_found" };
  if (row.kind !== rawKind) return { ok: false, reason: "not_found" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(row.expires_at).getTime() <= now) return { ok: false, reason: "expired" };
  if (row.max_uses != null && row.use_count >= row.max_uses) return { ok: false, reason: "used_up" };
  if (!scopeAllowed(rawKind, row.scopes, scope)) return { ok: false, reason: "scope" };
  if (!leadId || row.lead_id !== leadId) return { ok: false, reason: "wrong_order" };
  return { ok: true };
}

export const GENERIC_LINK_ERROR = "This link is invalid or has expired. Please use the latest link from your email.";
