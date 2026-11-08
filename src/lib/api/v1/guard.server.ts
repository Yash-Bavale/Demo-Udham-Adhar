/**
 * Security layer for the public API bridge (`/api/public/v1/*`).
 *
 * Design constraints agreed during the architecture audit:
 *  - No browser-held API key. A key shipped to the browser is not a secret.
 *  - `X-Website-Domain` is never trusted. Only the HTTP `Origin` header is
 *    checked, and only against an allowlist built from the `websites` table.
 *  - CORS is treated as a browser convenience, not as authentication. Every
 *    endpoint that exposes customer data additionally requires a short-lived
 *    HMAC checkout token that this server issued.
 *  - Customer PII is masked in responses. Lead codes are sequential and must
 *    never be enumerable into name / email / mobile.
 *  - Redirect targets are resolved server-side from `leads.website_id`. The
 *    caller never tells us where to send the customer.
 */

type WebsiteRow = {
  id: string;
  domain: string;
  name: string | null;
  brand_name: string | null;
  is_primary: boolean | null;
};

const ALLOWLIST_TTL_MS = 5 * 60 * 1000;
let cachedSites: { at: number; rows: WebsiteRow[] } | null = null;

/** Active customer websites, cached briefly to avoid a query per request. */
export async function loadWebsites(): Promise<WebsiteRow[]> {
  const now = Date.now();
  if (cachedSites && now - cachedSites.at < ALLOWLIST_TTL_MS) return cachedSites.rows;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("websites")
    .select("id, domain, name, brand_name, is_primary")
    .eq("is_active", true);

  const rows = (data ?? []) as WebsiteRow[];
  cachedSites = { at: now, rows };
  return rows;
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().trim().replace(/^www\./, "");
}

/** Extra origins allowed beyond the websites table (comma separated env). */
function extraAllowedOrigins(): string[] {
  const raw = process.env["ALLOWED_WEBSITE_ORIGINS"];
  if (!raw) return [];
  return raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

/**
 * Resolve the calling website from the request `Origin` (or `Referer`).
 * Returns null when the caller is not one of our configured websites.
 */
export async function resolveCallerWebsite(request: Request): Promise<{
  website: WebsiteRow | null;
  origin: string | null;
}> {
  const originHeader = request.headers.get("origin") || request.headers.get("referer");
  if (!originHeader) return { website: null, origin: null };

  let hostname: string;
  let origin: string;
  try {
    const url = new URL(originHeader);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return { website: null, origin: null };
    }
    hostname = normalizeHostname(url.hostname);
    origin = url.origin;
  } catch {
    return { website: null, origin: null };
  }

  if (extraAllowedOrigins().includes(origin.toLowerCase())) {
    const sites = await loadWebsites();
    const match = sites.find((s) => normalizeHostname(s.domain) === hostname) ?? null;
    return { website: match, origin };
  }

  // Local development and Lovable previews may call the API while testing.
  const isDevOrigin =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com");

  const sites = await loadWebsites();
  const match = sites.find((s) => normalizeHostname(s.domain) === hostname) ?? null;

  if (!match && isDevOrigin) {
    const primary = sites.find((s) => s.is_primary) ?? sites[0] ?? null;
    return { website: primary, origin };
  }

  return { website: match, origin: match ? origin : null };
}

/** CORS headers. Echoes the origin only when it is an approved website. */
export function corsHeaders(origin: string | null, methods: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = `${methods}, OPTIONS`;
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export function jsonOk(body: unknown, origin: string | null, methods = "POST"): Response {
  return new Response(JSON.stringify({ ok: true, ...(body as object) }), {
    status: 200,
    headers: corsHeaders(origin, methods),
  });
}

export function jsonError(
  status: number,
  code: string,
  error: string,
  origin: string | null,
  methods = "POST",
): Response {
  return new Response(JSON.stringify({ ok: false, error, code }), {
    status,
    headers: corsHeaders(origin, methods),
  });
}

export function preflight(origin: string | null, methods: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin, methods) });
}

// ── Short-lived checkout tokens (HMAC-SHA256) ──────────────────────────────

export type CheckoutTokenPayload = {
  /** lead_code this token grants access to */
  c: string;
  /** website id the lead belongs to */
  w: string;
  /** expiry, epoch seconds */
  exp: number;
};

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env["PUBLIC_API_TOKEN_SECRET"];
  if (!secret) throw new Error("PUBLIC_API_TOKEN_SECRET is not configured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Issue a token valid for `ttlSeconds` (default 1 hour). */
export async function issueCheckoutToken(
  leadCode: string,
  websiteId: string,
  ttlSeconds = 3600,
): Promise<string> {
  const payload: CheckoutTokenPayload = {
    c: leadCode,
    w: websiteId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Verify a token and confirm it was issued for this exact lead code.
 * Returns null on any failure — never leaks the reason to the caller.
 */
export async function verifyCheckoutToken(
  token: string | null | undefined,
  expectedLeadCode: string,
): Promise<CheckoutTokenPayload | null> {
  if (!token || typeof token !== "string" || token.length > 600) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as CheckoutTokenPayload;
    if (!payload?.c || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.c.toUpperCase() !== expectedLeadCode.toUpperCase()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── PII masking ────────────────────────────────────────────────────────────

export function maskName(value: string | null | undefined): string {
  const name = String(value ?? "").trim();
  if (!name) return "";
  return name
    .split(/\s+/)
    .map((part) => (part.length <= 2 ? part : `${part[0]}${"*".repeat(Math.min(part.length - 1, 6))}`))
    .join(" ");
}

export function maskEmail(value: string | null | undefined): string {
  const email = String(value ?? "").trim();
  const at = email.indexOf("@");
  if (at < 1) return "";
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${"*".repeat(Math.max(user.length - head.length, 2))}${domain}`;
}

export function maskMobile(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `${"*".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}

// ── Best-effort in-process rate limiting ───────────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Per-instance sliding window. Not a substitute for gateway-level protection,
 * but it blunts trivially scripted abuse of lead creation and status polling.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientKey(request: Request, scope: string): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `${scope}:${ip}`;
}

/**
 * Canonical customer-facing base URL for a lead's own website.
 * Never derived from caller input — always from `leads.website_id`.
 */
export async function resolveWebsiteOrigin(websiteId: string | null | undefined): Promise<string> {
  const fallback =
    process.env["APP_BASE_URL"] || process.env["PUBLIC_SITE_URL"] || "https://udyamadhar.in";
  if (!websiteId) return fallback;
  const sites = await loadWebsites();
  const site = sites.find((s) => s.id === websiteId);
  if (!site?.domain) return fallback;
  return `https://${normalizeHostname(site.domain)}`;
}
