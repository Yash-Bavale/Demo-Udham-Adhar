import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SERVICES, INDIAN_STATES, LANGUAGES } from "./constants";

/**
 * Converts a raw source URL into a clean admin-friendly label.
 * - Google Ads traffic  → "Google Ads | Campaign: 24100987356 | kw: udyam registration"
 * - Organic / direct   → "Website | /download-udyam-certificate"
 * - No source          → "Website"
 */
function parseLeadSource(sourcePage?: string): string {
  if (!sourcePage) return "Website";
  try {
    // sourcePage is stored as pathname + search, e.g. "/Download-Udyam-Certificate?Gad_source=1&..."
    const url = new URL(sourcePage, "https://placeholder.invalid");
    const params = url.searchParams;

    // Detect Google Ads: Gad_source, gclid, gbraid, or wbraid are all Google Ads signals
    const isGoogleAds =
      params.has("Gad_source") ||
      params.has("gad_source") ||
      params.has("gclid") ||
      params.has("Gclid") ||
      params.has("gbraid") ||
      params.has("Gbraid") ||
      params.has("wbraid") ||
      params.has("Wbraid");

    if (isGoogleAds) {
      const campaignId =
        params.get("Gad_campaignid") ||
        params.get("gad_campaignid") ||
        params.get("utm_campaign") ||
        null;
      const keyword =
        params.get("utm_term") ||
        params.get("keyword") ||
        null;
      const adGroup =
        params.get("utm_content") ||
        null;

      let label = "Google Ads";
      if (campaignId) label += ` | Campaign: ${campaignId}`;
      if (keyword) label += ` | kw: ${keyword}`;
      if (adGroup) label += ` | adg: ${adGroup}`;
      // Also record which landing page the ad pointed to (path only, no params)
      const landingPath = url.pathname.replace(/^\/+/, "") || "/";
      label += ` | Page: /${landingPath}`;
      return label;
    }

    // Organic / direct — store just the clean path (no query string noise)
    const cleanPath = url.pathname || "/";
    return `Website | ${cleanPath}`;
  } catch {
    // Fallback for malformed URLs
    return `Website | ${sourcePage.split("?")[0].slice(0, 120)}`;
  }
}


const LeadInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  state: z.enum(INDIAN_STATES as [string, ...string[]]),
  language: z.enum(LANGUAGES as [string, ...string[]]),
  service: z.string().trim().min(1).max(200),
  consent: z.literal(true, { message: "You must accept the terms to proceed" }),
  source_page: z.string().trim().max(300).optional(),
});

/**
 * Public lead intake server function.
 * - Looks up service + dynamic pricing from DB
 * - Dedupes by email OR mobile within last 30 days (reuses lead, no duplicate row)
 * - Creates a linked application row
 * - Activity log entries are written automatically by DB triggers
 */
export const createLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LeadInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDefaultWebsiteId } = await import("./websites/default-website.server");
    const websiteId = await getDefaultWebsiteId();
    // 1. Map form label -> internal slug -> DB service row
    // 1. Resolve service by code (slug) OR by legacy label — supports admin-renamed services.
    const raw = data.service;
    const slugFromStatic = SERVICES.find((s) => s.label === raw)?.slug;
    const candidate = slugFromStatic ?? raw;
    const { data: service, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, service_code, service_name, base_amount, gst_amount, total_amount, is_active")
      .or(`service_code.eq.${candidate},service_name.eq.${raw}`)
      .maybeSingle();

    if (svcErr) throw new Error(svcErr.message);
    if (!service || !service.is_active) {
      throw new Error("Selected service is not currently available.");
    }
    // Store the current display name so renamed services propagate.
    data.service = service.service_name as string;

    const baseAmount = Number(service.base_amount);
    const gstAmount = Number(service.gst_amount);
    const totalAmount = Number(service.total_amount);

    // 2. Duplicate detection — match on mobile OR email (case-insensitive).
    const normalizedEmail = data.email.toLowerCase();
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id")
      .or(`mobile.eq.${data.mobile},email.eq.${normalizedEmail}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const isDuplicate = !!existing?.id;
    const duplicateOf = existing?.id ?? null;

    // 2b. Resolve or create the customer (dedupes by mobile, then email).
    // Non-fatal: if this fails we still save the lead.
    let customerId: string | null = null;
    {
      const { data: cid, error: custErr } = await supabaseAdmin.rpc(
        "find_or_create_customer",
        {
          p_name: data.name,
          p_email: normalizedEmail,
          p_mobile: data.mobile,
          p_state: data.state,
          p_language: data.language,
        },
      );
      if (custErr) {
        console.error("find_or_create_customer failed:", custErr.message);
      } else {
        customerId = (cid as unknown as string) ?? null;
      }
    }

    // 3. Always create a new lead row — treat every submission as a fresh application.
    let leadId: string;
    let leadCode: string;
    {
      const { data: row, error } = await supabaseAdmin
        .from("leads")
        .insert({
          name: data.name,
          email: normalizedEmail,
          mobile: data.mobile,
          state: data.state,
          language: data.language,
          service: data.service,
          service_id: service.id,
          base_amount: baseAmount,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          status: "new_lead",
          lead_source: parseLeadSource(data.source_page),
          is_duplicate: isDuplicate,
          duplicate_of: duplicateOf,
          customer_id: customerId,
          website_id: websiteId,
        })
        .select("id, lead_code")
        .single();
      if (error || !row) {
        throw new Error(error?.message ?? "Could not save your details. Please try again.");
      }
      leadId = row.id;
      leadCode = row.lead_code as string;
    }

    // Auto-assign lead to employee from assignment_pool if enabled
    try {
      const { autoAssignLeadOrOrder } = await import("@/lib/crm/auto-assign.server");
      await autoAssignLeadOrOrder({ leadId, serviceId: service.id });
    } catch (assignErr) {
      console.error("[createLead] Auto-assignment failed:", assignErr);
    }

    // If this was a duplicate, bump the original's counter.
    if (duplicateOf) {
      const { data: orig } = await supabaseAdmin
        .from("leads")
        .select("duplicate_count")
        .eq("id", duplicateOf)
        .maybeSingle();
      await supabaseAdmin
        .from("leads")
        .update({ duplicate_count: (orig?.duplicate_count ?? 0) + 1 })
        .eq("id", duplicateOf);
    }

    // NOTE: No application/order row is created here on purpose.
    // An order exists only once a payment succeeds — see
    // src/lib/payments/finalize-paid.server.ts. This keeps the order's
    // created_at equal to the actual payment time.


    // Lead notifications intentionally disabled — the bell never rings for leads.

    const { issueCustomerToken } = await import("@/lib/security/customer-access.server");
    const accessToken = await issueCustomerToken(leadId, "co", { reason: "lead_created" });

    return {
      leadId,
      leadCode,
      accessToken,
      baseAmount,
      gstAmount,
      totalAmount,
    };
  });
