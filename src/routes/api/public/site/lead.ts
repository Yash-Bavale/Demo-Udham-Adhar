import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { INDIAN_STATES, LANGUAGES } from "@/lib/constants";
import { loadSite, resolveDomain, siteJson, siteOptions } from "@/lib/site-api";

const Schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  state: z.string().trim().max(80),
  language: z.string().trim().max(40),
  service: z.string().trim().min(1, "Select a service").max(200),
  notes: z.string().trim().max(2000).optional(),
  source_page: z.string().trim().max(300).optional(),
});

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
};

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return ((await request.json()) ?? {}) as Record<string, unknown>;
  if (ct.includes("form")) return Object.fromEntries((await request.formData()).entries());
  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

const matchList = (list: readonly string[], v: string) =>
  list.find((x) => x.toLowerCase() === v.toLowerCase()) ?? v;

/** Public: lead submission from a customer website; returns the payment URL. */
export const Route = createFileRoute("/api/public/site/lead")({
  server: {
    handlers: {
      OPTIONS: async () => siteOptions(),
      POST: async ({ request }) => {
        let raw: Record<string, unknown>;
        try {
          raw = await readBody(request);
        } catch {
          return siteJson({ ok: false, success: false, error: "Invalid request" }, 400);
        }
        // Honeypot
        if (pick(raw, "company_website", "website_url_hp")) return siteJson({ ok: true, success: true });

        const mobileRaw = (pick(raw, "mobile", "phone", "mobile_no", "mobileNo", "phone_number") ?? "")
          .replace(/\D/g, "")
          .replace(/^(91|0)(?=\d{10}$)/, "");
        const parsed = Schema.safeParse({
          name: pick(raw, "name", "applicant_name", "applicantName", "full_name", "fullName"),
          email: pick(raw, "email", "email_address"),
          mobile: mobileRaw,
          state: pick(raw, "state") ?? "",
          language: pick(raw, "language", "lang") ?? "English",
          service: pick(raw, "service", "service_code", "serviceCode", "service_id", "serviceId", "service_name", "serviceName"),
          notes: pick(raw, "notes", "message"),
          source_page: pick(raw, "source_page", "sourcePage", "page", "source"),
        });
        if (!parsed.success) {
          const msg = parsed.error.issues[0]?.message ?? "Invalid input";
          return siteJson({ ok: false, success: false, error: msg, message: msg }, 400);
        }
        const input = parsed.data;
        const state = matchList(INDIAN_STATES, input.state);
        const language = matchList(LANGUAGES, input.language);

        try {
          const domain = resolveDomain(request, pick(raw, "domain", "website", "site"));
          const site = await loadSite(domain);
          if (!site) return siteJson({ ok: false, success: false, error: "Website not configured" }, 404);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: services, error: svcErr } = await supabaseAdmin
            .from("services")
            .select("id, service_code, service_name, base_amount, gst_amount, total_amount")
            .eq("website_id", site.id)
            .eq("is_active", true);
          if (svcErr) throw new Error(svcErr.message);
          const wanted = input.service.toLowerCase();
          const service = (services ?? []).find(
            (s) =>
              String(s.id).toLowerCase() === wanted ||
              String(s.service_code).toLowerCase() === wanted ||
              String(s.service_name).toLowerCase() === wanted,
          );
          if (!service) {
            return siteJson({ ok: false, success: false, error: "Selected service is not available." }, 400);
          }

          let customerId: string | null = null;
          const { data: cid, error: custErr } = await supabaseAdmin.rpc("find_or_create_customer", {
            p_name: input.name,
            p_email: input.email,
            p_mobile: input.mobile,
            p_state: state,
            p_language: language,
          });
          if (custErr) console.error("[site/lead] find_or_create_customer:", custErr.message);
          else customerId = (cid as unknown as string) ?? null;

          const { data: lead, error } = await supabaseAdmin
            .from("leads")
            .insert({
              name: input.name,
              email: input.email,
              mobile: input.mobile,
              state,
              language,
              service: service.service_name,
              service_id: service.id,
              base_amount: Number(service.base_amount),
              gst_amount: Number(service.gst_amount),
              total_amount: Number(service.total_amount),
              status: "new_lead",
              lead_source: input.source_page
                ? `Website | ${input.source_page.split("?")[0]!.slice(0, 120)}`
                : site.domain,
              notes: input.notes ?? null,
              customer_id: customerId,
              website_id: site.id,
            })
            .select("id, lead_code, public_ref")
            .single();
          if (error || !lead?.lead_code) throw new Error(error?.message ?? "Could not save the lead");

          try {
            const { autoAssignLeadOrOrder } = await import("@/lib/crm/auto-assign.server");
            await autoAssignLeadOrOrder({ leadId: lead.id, serviceId: service.id });
          } catch (e) {
            console.error("[site/lead] auto-assign:", e);
          }
          try {
            const { emitToRole } = await import("@/lib/notifications/emit.server");
            for (const role of ["admin", "super_admin"] as const) {
              await emitToRole(role, {
                kind: "form_submitted",
                title: "New Website Lead Received",
                body: `${input.name} (${service.service_name}) — ${input.mobile} · ${site.domain}`,
                href: `/admin/leads/${lead.id}`,
                entityKind: "lead",
                entityId: lead.id,
              });
            }
          } catch (e) {
            console.error("[site/lead] notify:", e);
          }

          const paymentsEnabled = site.payments_enabled !== false;
          const { secureCustomerUrl } = await import("@/lib/security/customer-access.server");
          let paymentUrl: string;
          let checkoutToken: string | null = null;
          if (site.is_primary) {
            // Primary website keeps its existing CRM-hosted checkout unchanged.
            const base = process.env["APP_BASE_URL"] || new URL(request.url).origin;
            paymentUrl = await secureCustomerUrl(base, `/payment/${encodeURIComponent(lead.lead_code)}`, lead.id, "co", "site_lead");
          } else {
            // Partner websites keep the customer on their own domain: the site's
            // /processing page runs the timer and, when payments are on, moves
            // on to its own checkout using the signed checkout token.
            const g = await import("@/lib/api/v1/guard.server");
            checkoutToken = await g.issueCheckoutToken(lead.lead_code, site.id);
            const ref = encodeURIComponent(String(lead.public_ref ?? lead.lead_code));
            const frag = new URLSearchParams({ lc: lead.lead_code, ct: checkoutToken, pe: paymentsEnabled ? "1" : "0" });
            paymentUrl = `https://${site.domain}/processing?ref=${ref}#${frag.toString()}`;
          }
          return siteJson({
            ok: true,
            success: true,
            leadCode: lead.lead_code,
            lead_code: lead.lead_code,
            service: service.service_name,
            baseAmount: Number(service.base_amount),
            gstAmount: Number(service.gst_amount),
            totalAmount: Number(service.total_amount),
            paymentUrl,
            payment_url: paymentUrl,
            redirectUrl: paymentUrl,
            paymentsEnabled,
            payments_enabled: paymentsEnabled,
            checkoutToken,
            checkout_token: checkoutToken,
          });
        } catch (e) {
          console.error("[site/lead]", e);
          return siteJson(
            { ok: false, success: false, error: "Could not submit your application. Please try again." },
            500,
          );
        }
      },
    },
  },
});
