import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { INDIAN_STATES, LANGUAGES } from "@/lib/constants";

const FALLBACK_INTERNAL_EMAIL = "help@businesshelpservices.com";

// Talk-to-Expert is a paid consultation. ₹99 + 18% GST.
const BASE = 99;
const GST = +(BASE * 0.18).toFixed(2);
const TOTAL = +(BASE + GST).toFixed(2);

const Schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile"),
  state: z.string().trim().refine((v) => INDIAN_STATES.includes(v), "Invalid state"),
  language: z.string().trim().refine((v) => LANGUAGES.includes(v), "Invalid language"),
  problem: z.string().trim().min(10).max(2000),
});

export const Route = createFileRoute("/api/public/talk-to-expert")({
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
        const cors = {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        };
        let parsed: z.infer<typeof Schema>;
        try {
          parsed = Schema.parse(await request.json());
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Invalid input" }),
            { status: 400, headers: cors },
          );
        }

        // Always create a fresh lead — treat every submission as a new application.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { resolveWebsiteIdFromRequest } = await import("@/lib/websites/default-website.server");
        const websiteId = await resolveWebsiteIdFromRequest(request);
        let leadId: string;
        let leadCode: string | null;
        {
          const { data: lead, error } = await supabaseAdmin
            .from("leads")
            .insert({
              name: parsed.name,
              email: parsed.email,
              mobile: parsed.mobile,
              state: parsed.state,
              language: parsed.language,
              service: "Expert Consultation",
              lead_source: "talk_to_expert",
              status: "lead_created",
              notes: parsed.problem,
              base_amount: BASE,
              gst_amount: GST,
              total_amount: TOTAL,
              website_id: websiteId,
            })
            .select("id, lead_code")
            .single();
          if (error || !lead) {
            return new Response(
              JSON.stringify({ ok: false, error: "Could not save your request. Please try again." }),
              { status: 500, headers: cors },
            );
          }
          leadId = lead.id;
          leadCode = lead.lead_code ?? null;

          try {
            const { autoAssignLeadOrOrder } = await import("@/lib/crm/auto-assign.server");
            await autoAssignLeadOrOrder({ leadId });
          } catch (assignErr) {
            console.error("[talk-to-expert] Auto-assign error:", assignErr);
          }

          await supabaseAdmin.from("activity_logs").insert({
            lead_id: leadId,
            activity_type: "lead_created",
            activity_description: `Talk-to-Expert request from ${parsed.name}`,
            metadata: { source: "talk_to_expert", problem: parsed.problem } as never,
          });
        }


        // Notify admin (best-effort)
        const adminTo = process.env.INTERNAL_NOTIFICATION_EMAIL || FALLBACK_INTERNAL_EMAIL;
        const origin = new URL(request.url).origin;
        try {
          const { enqueueFromTemplateInternal } = await import(
            "@/lib/emails/emails.server"
          );
          const vars = {
            name: parsed.name,
            customer_name: parsed.name,
            email: parsed.email,
            customer_email: parsed.email,
            mobile: parsed.mobile,
            customer_mobile: parsed.mobile,
            problem: parsed.problem,
            lead_id: leadId,
            lead_code: leadCode ?? "",
            service_name: "Talk to Expert Consultation",
            total_amount: TOTAL,
            admin_url: `${origin}/admin/leads/${leadId}`,
          };
          await enqueueFromTemplateInternal("talk_to_expert_request_admin", adminTo, vars, {
            leadId,
          });
          await enqueueFromTemplateInternal("talk_to_expert_request_customer", parsed.email, vars, {
            toName: parsed.name,
            leadId,
          }).catch(() => undefined);
        } catch {
          // ignore email backend issues
        }

        const { issueCustomerToken } = await import("@/lib/security/customer-access.server");
        const accessToken = await issueCustomerToken(leadId, "co", { reason: "talk_to_expert" });
        return new Response(
          JSON.stringify({ ok: true, leadCode, accessToken, totalAmount: TOTAL }),
          { status: 200, headers: cors },
        );
      },
    },
  },
});
