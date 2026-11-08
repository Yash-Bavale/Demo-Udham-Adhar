/**
 * Lead intake used by the public API bridge.
 *
 * Mirrors the behaviour of the existing in-app `createLead` server function
 * (duplicate detection, customer resolution, round-robin assignment, staff
 * notification) but scopes the lead to the website that actually called the
 * API, resolved from the verified `Origin` header rather than from the body.
 *
 * The existing website flow is untouched; this is an additional entry point.
 */

export type ApiLeadInput = {
  name: string;
  email: string;
  mobile: string;
  state: string;
  language: string;
  service: string;
  source_page?: string | undefined;
  notes?: string | undefined;
};

export type ApiLeadResult = {
  leadId: string;
  leadCode: string;
  accessToken: string;
  service: { id: string; code: string; name: string };
  pricing: { baseAmount: number; gstAmount: number; totalAmount: number };
};

function parseLeadSource(sourcePage: string | undefined, fallbackDomain: string): string {
  if (!sourcePage) return fallbackDomain;
  try {
    const url = new URL(sourcePage, "https://placeholder.invalid");
    const params = url.searchParams;
    const isGoogleAds = ["Gad_source", "gad_source", "gclid", "Gclid", "gbraid", "Gbraid", "wbraid", "Wbraid"]
      .some((k) => params.has(k));

    if (isGoogleAds) {
      const campaignId = params.get("Gad_campaignid") || params.get("gad_campaignid") || params.get("utm_campaign");
      const keyword = params.get("utm_term") || params.get("keyword");
      const adGroup = params.get("utm_content");
      let label = "Google Ads";
      if (campaignId) label += ` | Campaign: ${campaignId}`;
      if (keyword) label += ` | kw: ${keyword}`;
      if (adGroup) label += ` | adg: ${adGroup}`;
      label += ` | Page: ${url.pathname || "/"}`;
      return label;
    }
    return `${fallbackDomain} | ${url.pathname || "/"}`;
  } catch {
    return `${fallbackDomain} | ${sourcePage.split("?")[0]?.slice(0, 120) ?? ""}`;
  }
}

/** Active services for one website, shaped for the public API. */
export async function listWebsiteServices(websiteId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("services")
    .select(
      "id, service_code, service_name, description, base_amount, gst_amount, total_amount, expected_processing_days, sort_order",
    )
    .eq("website_id", websiteId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Resolve a service for a website by code or display name.
 * Falls back to an unscoped lookup so websites that share the central service
 * catalogue keep working exactly as they do today.
 */
async function resolveService(websiteId: string, wanted: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const needle = wanted.trim().toLowerCase();

  const scoped = await listWebsiteServices(websiteId);
  const scopedMatch = scoped.find(
    (s) =>
      String(s.service_code).toLowerCase() === needle ||
      String(s.service_name).toLowerCase() === needle,
  );
  if (scopedMatch) return scopedMatch;

  const { data } = await supabaseAdmin
    .from("services")
    .select(
      "id, service_code, service_name, description, base_amount, gst_amount, total_amount, is_active",
    )
    .or(`service_code.eq.${wanted},service_name.eq.${wanted}`)
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
}

export async function createApiLead(
  websiteId: string,
  websiteDomain: string,
  input: ApiLeadInput,
): Promise<ApiLeadResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const service = await resolveService(websiteId, input.service);
  if (!service) {
    throw Object.assign(new Error("Selected service is not available."), { code: "SERVICE_UNAVAILABLE" });
  }

  const baseAmount = Number(service.base_amount);
  const gstAmount = Number(service.gst_amount);
  const totalAmount = Number(service.total_amount);
  const normalizedEmail = input.email.toLowerCase();

  // Duplicate detection — same rules as the in-app flow.
  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("id, duplicate_count")
    .or(`mobile.eq.${input.mobile},email.eq.${normalizedEmail}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const duplicateOf = existing?.id ?? null;

  let customerId: string | null = null;
  try {
    const { data: cid, error: custErr } = await supabaseAdmin.rpc("find_or_create_customer", {
      p_name: input.name,
      p_email: normalizedEmail,
      p_mobile: input.mobile,
      p_state: input.state,
      p_language: input.language,
    });
    if (custErr) console.error("[api/v1/leads] find_or_create_customer:", custErr.message);
    else customerId = (cid as unknown as string) ?? null;
  } catch (e) {
    console.error("[api/v1/leads] customer resolution failed", e);
  }

  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .insert({
      name: input.name,
      email: normalizedEmail,
      mobile: input.mobile,
      state: input.state,
      language: input.language,
      service: service.service_name,
      service_id: service.id,
      base_amount: baseAmount,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      status: "new_lead",
      lead_source: parseLeadSource(input.source_page, websiteDomain),
      is_duplicate: !!duplicateOf,
      duplicate_of: duplicateOf,
      customer_id: customerId,
      website_id: websiteId,
      notes: input.notes ?? null,
    })
    .select("id, lead_code")
    .single();

  if (error || !lead?.lead_code) {
    throw new Error(error?.message ?? "Could not save your details. Please try again.");
  }

  try {
    const { autoAssignLeadOrOrder } = await import("@/lib/crm/auto-assign.server");
    await autoAssignLeadOrOrder({ leadId: lead.id, serviceId: service.id });
  } catch (e) {
    console.error("[api/v1/leads] auto-assign failed", e);
  }

  if (duplicateOf) {
    await supabaseAdmin
      .from("leads")
      .update({ duplicate_count: (existing?.duplicate_count ?? 0) + 1 })
      .eq("id", duplicateOf);
  }

  try {
    const { emitToRole } = await import("@/lib/notifications/emit.server");
    for (const role of ["admin", "super_admin"] as const) {
      await emitToRole(role, {
        kind: "form_submitted",
        title: "New Lead Received",
        body: `${input.name} (${service.service_name}) — ${input.mobile}`,
        href: `/admin/leads/${lead.id}`,
        entityKind: "lead",
        entityId: lead.id,
      });
    }
  } catch (e) {
    console.error("[api/v1/leads] notification failed", e);
  }

  const { issueCustomerToken } = await import("@/lib/security/customer-access.server");
  const accessToken = await issueCustomerToken(lead.id as string, "co", { reason: "api_v1_lead" });
  return {
    leadId: lead.id,
    leadCode: lead.lead_code as string,
    accessToken,
    service: {
      id: service.id as string,
      code: service.service_code as string,
      name: service.service_name as string,
    },
    pricing: { baseAmount, gstAmount, totalAmount },
  };
}
