// pg_cron calls this hourly with CRON_SECRET in the apikey header. Sends an
// onboarding reminder to customers who paid but never submitted onboarding.
// Max 3 reminders per lead, spaced at least 24h apart.
import { createFileRoute } from "@tanstack/react-router";

const APP_ORIGIN =
  process.env.APP_BASE_URL ||
  "https://everythinghappensqindiaserver4cored.lovable.app";
const MAX_REMINDERS = 3;
const MIN_GAP_HOURS = 24;

export const Route = createFileRoute("/api/public/cron/onboarding-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Server-only CRON_SECRET — never VITE_-prefixed, never shipped to client.
        const apikey = request.headers.get("apikey");
        const expected = process.env.CRON_SECRET;
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
        const cutoff = new Date(Date.now() - MIN_GAP_HOURS * 3600_000).toISOString();

        const { data: leads, error } = await supabaseAdmin
          .from("leads")
          .select("id, lead_code, name, email, service, onboarding_reminder_count, onboarding_reminded_at")
          .eq("status", "payment_successful")
          .lt("onboarding_reminder_count", MAX_REMINDERS)
          .or(`onboarding_reminded_at.is.null,onboarding_reminded_at.lte.${cutoff}`)
          .limit(100);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let enqueued = 0;
        let skipped = 0;

        for (const lead of leads ?? []) {
          // Skip if onboarding already submitted
          const { data: sub } = await supabaseAdmin
            .from("onboarding_submissions")
            .select("status")
            .eq("lead_id", lead.id)
            .maybeSingle();
          if (sub?.status === "submitted") {
            skipped++;
            continue;
          }
          if (!lead.email || !lead.lead_code) {
            skipped++;
            continue;
          }

          try {
            await enqueueFromTemplateInternal(
              "onboarding_reminder",
              lead.email,
              {
                name: lead.name ?? "",
                lead_code: lead.lead_code,
                service: lead.service ?? "",
                onboarding_url: `${APP_ORIGIN}/onboarding/${encodeURIComponent(lead.lead_code)}`,
              },
              { toName: lead.name ?? undefined, leadId: lead.id },
            );
            await supabaseAdmin
              .from("leads")
              .update({
                onboarding_reminded_at: new Date().toISOString(),
                onboarding_reminder_count: (lead.onboarding_reminder_count ?? 0) + 1,
              })
              .eq("id", lead.id);
            enqueued++;
          } catch (e) {
            console.error("[onboarding-reminders] enqueue failed", { leadId: lead.id, e });
          }
        }

        return Response.json({ ok: true, candidates: leads?.length ?? 0, enqueued, skipped });
      },
    },
  },
});
