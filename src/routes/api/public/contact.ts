import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { INDIAN_STATES, LANGUAGES } from "@/lib/constants";

// Internal admin notification target. Configured via env secret.
const FALLBACK_INTERNAL_EMAIL = "help@businesshelpservices.com";


const ContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile"),
  state: z.string().trim().refine((v) => INDIAN_STATES.includes(v), "Invalid state"),
  language: z.string().trim().refine((v) => LANGUAGES.includes(v), "Invalid language"),
  message: z.string().trim().min(5).max(1000),
});

export const Route = createFileRoute("/api/public/contact")({
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
        let parsed: z.infer<typeof ContactSchema>;
        try {
          const body = await request.json();
          parsed = ContactSchema.parse(body);
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Invalid input" }),
            { status: 400, headers: cors },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { resolveWebsiteIdFromRequest } = await import("@/lib/websites/default-website.server");
        const websiteId = await resolveWebsiteIdFromRequest(request);

        // De-dup guard: same email + contact_form within last 60s
        const since = new Date(Date.now() - 60_000).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("email", parsed.email)
          .eq("lead_source", "contact_form")
          .gte("created_at", since)
          .limit(1)
          .maybeSingle();

        let leadId: string;
        const submittedAt = new Date().toISOString();
        if (recent?.id) {
          leadId = recent.id;
        } else {
          const { data: lead, error: leadErr } = await supabaseAdmin
            .from("leads")
            .insert({
              name: parsed.name,
              email: parsed.email,
              mobile: parsed.mobile,
              state: parsed.state,
              language: parsed.language,
              service: "Contact Enquiry",
              lead_source: "contact_form",
              status: "lead_created",
              notes: parsed.message,
              total_amount: 0,
              gst_amount: 0,
              base_amount: 0,
              website_id: websiteId,
            })
            .select("id")
            .single();
          if (leadErr || !lead) {
            return new Response(
              JSON.stringify({ ok: false, error: "Could not save your enquiry. Please try again." }),
              { status: 500, headers: cors },
            );
          }
          leadId = lead.id;

          // Activity log (best-effort)
          await supabaseAdmin.from("activity_logs").insert({
            lead_id: leadId,
            activity_type: "lead_created",
            activity_description: `Contact form submitted by ${parsed.name}`,
            metadata: { source: "contact_form" } as never,
          });
        }

        // Resolve admin recipient (private, env-configured)
        const adminTo =
          process.env.INTERNAL_NOTIFICATION_EMAIL || FALLBACK_INTERNAL_EMAIL;

        // Fire-and-forget enqueues — never block the user on email backend
        try {
          const { enqueueFromTemplateInternal } = await import(
            "@/lib/emails/emails.server"
          );
          const commonVars = {
            name: parsed.name,
            customer_name: parsed.name,
            email: parsed.email,
            customer_email: parsed.email,
            mobile: parsed.mobile,
            customer_mobile: parsed.mobile,
            lead_code: "",
            order_number: "",
            message: parsed.message,
          };
          await Promise.all([
            enqueueFromTemplateInternal("contact_acknowledgement", parsed.email, commonVars, {
              toName: parsed.name,
              leadId,
            }),
            (async () => {
              await enqueueFromTemplateInternal("admin_new_lead", adminTo, commonVars, {
                leadId,
              });
            })(),
          ]);
        } catch {
          // Email queue failures must not break the user flow
        }

        return new Response(
          JSON.stringify({ ok: true, leadId, submittedAt }),
          { status: 200, headers: cors },
        );
      },
    },
  },
});

