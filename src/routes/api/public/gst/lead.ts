import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { INDIAN_STATES, LANGUAGES } from "@/lib/constants";

const GST_DOMAIN = "gstcertificate.in";

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const Schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  state: z.string().trim().refine((v) => INDIAN_STATES.includes(v), "Invalid state"),
  language: z.string().trim().refine((v) => LANGUAGES.includes(v), "Invalid language"),
  service: z.string().trim().min(2).max(200),
  notes: z.string().trim().max(2000).optional(),
  source_page: z.string().trim().max(300).optional(),
});

function siteOrigin(request: Request) {
  return (
    process.env["GST_SITE_URL"] ||
    process.env["APP_BASE_URL"] ||
    new URL(request.url).origin
  );
}

/**
 * Public: GST lead submission. Creates the lead against gstcertificate.in and
 * returns the self-checkout payment URL (same gateway flow as the Udyam site).
 */
export const Route = createFileRoute("/api/public/gst/lead")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        let input: z.infer<typeof Schema>;
        try {
          input = Schema.parse(await request.json());
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Invalid input" }),
            { status: 400, headers: cors },
          );
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: site } = await supabaseAdmin
            .from("websites")
            .select("id")
            .eq("domain", GST_DOMAIN)
            .maybeSingle();
          if (!site?.id) {
            return new Response(JSON.stringify({ ok: false, error: "Website not configured" }), {
              status: 404,
              headers: cors,
            });
          }

          // Resolve the service by code or display name, scoped to this website.
          const { data: services, error: svcErr } = await supabaseAdmin
            .from("services")
            .select("id, service_code, service_name, base_amount, gst_amount, total_amount, is_active")
            .eq("website_id", site.id)
            .eq("is_active", true);
          if (svcErr) throw new Error(svcErr.message);

          const wanted = input.service.toLowerCase();
          const service = (services ?? []).find(
            (s) =>
              String(s.service_code).toLowerCase() === wanted ||
              String(s.service_name).toLowerCase() === wanted,
          );
          if (!service) {
            return new Response(
              JSON.stringify({ ok: false, error: "Selected service is not available." }),
              { status: 400, headers: cors },
            );
          }

          const baseAmount = Number(service.base_amount);
          const gstAmount = Number(service.gst_amount);
          const totalAmount = Number(service.total_amount);

          let customerId: string | null = null;
          const { data: cid, error: custErr } = await supabaseAdmin.rpc("find_or_create_customer", {
            p_name: input.name,
            p_email: input.email,
            p_mobile: input.mobile,
            p_state: input.state,
            p_language: input.language,
          });
          if (custErr) console.error("[gst/lead] find_or_create_customer:", custErr.message);
          else customerId = (cid as unknown as string) ?? null;

          const { data: lead, error } = await supabaseAdmin
            .from("leads")
            .insert({
              name: input.name,
              email: input.email,
              mobile: input.mobile,
              state: input.state,
              language: input.language,
              service: service.service_name,
              service_id: service.id,
              base_amount: baseAmount,
              gst_amount: gstAmount,
              total_amount: totalAmount,
              status: "new_lead",
              lead_source: input.source_page
                ? `Website | ${input.source_page.split("?")[0].slice(0, 120)}`
                : "gstcertificate.in",
              notes: input.notes ?? null,
              customer_id: customerId,
              website_id: site.id,
            })
            .select("id, lead_code")
            .single();
          if (error || !lead?.lead_code) {
            throw new Error(error?.message ?? "Could not save the lead");
          }

          try {
            const { autoAssignLeadOrOrder } = await import("@/lib/crm/auto-assign.server");
            await autoAssignLeadOrOrder({ leadId: lead.id, serviceId: service.id });
          } catch (assignErr) {
            console.error("[gst/lead] auto-assign:", assignErr);
          }

          try {
            const { emitToRole } = await import("@/lib/notifications/emit.server");
            for (const role of ["admin", "super_admin"] as const) {
              await emitToRole(role, {
                kind: "form_submitted",
                title: "New GST Lead Received",
                body: `${input.name} (${service.service_name}) — ${input.mobile}`,
                href: `/admin/leads/${lead.id}`,
                entityKind: "lead",
                entityId: lead.id,
              });
            }
          } catch (e) {
            console.error("[gst/lead] notify:", e);
          }

          const { secureCustomerUrl } = await import("@/lib/security/customer-access.server");
          const paymentUrl = await secureCustomerUrl(siteOrigin(request), `/payment/${encodeURIComponent(lead.lead_code)}`, lead.id, "co", "gst_lead");

          return new Response(
            JSON.stringify({
              ok: true,
              leadCode: lead.lead_code,
              service: service.service_name,
              baseAmount,
              gstAmount,
              totalAmount,
              paymentUrl,
            }),
            { status: 200, headers: cors },
          );
        } catch (e) {
          console.error("[gst/lead]", e);
          return new Response(
            JSON.stringify({ ok: false, error: "Could not submit your request. Please try again." }),
            { status: 500, headers: cors },
          );
        }
      },
    },
  },
});
