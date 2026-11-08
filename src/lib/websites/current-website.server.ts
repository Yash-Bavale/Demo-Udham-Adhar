import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface WebsiteRow {
  id: string;
  domain: string;
  name: string | null;
  brand_name: string | null;
  legal_entity: string | null;
  company_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  whatsapp_number: string | null;
  business_hours: string | null;
  primary_color: string | null;
  logo_asset_url: string | null;
  favicon_asset_url: string | null;
  sample_certificate_asset_url: string | null;
  contentful_space_id: string | null;
  contentful_delivery_token_secret: string | null;
  sanity_project_id: string | null;
  sanity_dataset: string | null;
  legal_footer_line: string | null;
  postal_address: string | null;
  footer_unlock_code: string | null;
  google_site_verification: string | null;
  gtag_id: string | null;
  is_primary: boolean;
  allow_admin: boolean;
}

const BRAND_COLUMNS =
  "id, domain, name, brand_name, legal_entity, company_name, support_email, support_phone, whatsapp_number, business_hours, primary_color, logo_asset_url, favicon_asset_url, sample_certificate_asset_url, contentful_space_id, contentful_delivery_token_secret, sanity_project_id, sanity_dataset, legal_footer_line, postal_address, footer_unlock_code, google_site_verification, gtag_id, is_primary, allow_admin";

const cache = new Map<string, WebsiteRow>();
let primaryCache: WebsiteRow | null = null;

export function clearWebsiteCache() {
  cache.clear();
  primaryCache = null;
}

/**
 * Retry transient upstream failures (DNS/network blips reaching the database)
 * before giving up — otherwise a brief outage silently renders fallback brand
 * and empty navigation site-wide.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}


async function loadPrimary(): Promise<WebsiteRow> {
  if (primaryCache) return primaryCache;
  const data = await withRetry(async () => {
    const res = await supabaseAdmin
      .from("websites")
      .select(BRAND_COLUMNS)
      .eq("is_primary", true)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  });
  if (data) {
    primaryCache = data as unknown as WebsiteRow;
    return primaryCache;
  }
  // Fallback: any active site with lowest sort order
  const any = await withRetry(async () => {
    const res = await supabaseAdmin
      .from("websites")
      .select(BRAND_COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  });
  if (!any) throw new Error("No websites configured");
  primaryCache = any as unknown as WebsiteRow;
  return primaryCache;
}

/**
 * Resolve the current website row from a Request's Host header. Falls back
 * to the primary website when the host doesn't match any active row
 * (localhost, Lovable preview, unknown domain).
 */
export async function resolveCurrentWebsite(request: Request | undefined): Promise<WebsiteRow> {
  const host = request?.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  if (host) {
    const cached = cache.get(host);
    if (cached) return cached;
    const stripped = host.replace(/^www\./, "");
    const data = await withRetry(async () => {
      const res = await supabaseAdmin
        .from("websites")
        .select(BRAND_COLUMNS)
        .eq("is_active", true)
        .in("domain", [host, stripped])
        .maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    });
    if (data) {
      const row = data as unknown as WebsiteRow;
      cache.set(host, row);
      return row;
    }
  }

  return loadPrimary();
}
