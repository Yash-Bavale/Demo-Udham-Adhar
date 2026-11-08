// Shared helpers for /api/public/site/* — the endpoints the standalone
// customer websites (e.g. gstcertificate.in) call.

export const siteCors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept",
};

export const siteOptions = () => new Response(null, { status: 204, headers: siteCors });

export function siteJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: siteCors });
}

export function normalizeDomain(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]!
    .split(":")[0]!
    .replace(/^www\./, "");
}

/** Domain from explicit param, else the caller's Origin/Referer. */
export function resolveDomain(request: Request, explicit?: string | null): string {
  const d = normalizeDomain(explicit);
  if (d) return d;
  const origin = request.headers.get("origin") || request.headers.get("referer");
  return normalizeDomain(origin);
}

export async function loadSite(domain: string) {
  if (!domain) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("websites")
    .select(
      "id, name, domain, brand_name, company_name, legal_entity, support_email, support_phone, whatsapp_number, business_hours, primary_color, logo_asset_url, favicon_asset_url, sample_certificate_asset_url, legal_footer_line, postal_address, gtag_id, google_site_verification, is_active, is_primary, payments_enabled",
    )
    .eq("domain", domain)
    .maybeSingle();
  return data && data.is_active !== false ? data : null;
}
