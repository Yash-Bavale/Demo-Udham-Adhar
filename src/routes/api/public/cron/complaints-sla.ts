// pg_cron calls this periodically to flag SLA-breached complaints + enqueue reminder emails.
// The reminder email itself is the `complaint_sla_breach` row in email_templates —
// disable/enable it from the admin Email Templates screen. Capped at 3 reminders per complaint.
import { createFileRoute } from "@tanstack/react-router";

const MAX_REMINDERS_PER_COMPLAINT = 3;

export const Route = createFileRoute("/api/public/cron/complaints-sla")({
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
        const now = new Date().toISOString();

        // 1) Mark newly-breached complaints
        const { data: breaching } = await supabaseAdmin
          .from("complaints")
          .select("id, complaint_number, lead_id, severity, category, sla_due_at")
          .lt("sla_due_at", now)
          .is("breached_at", null)
          .not("status", "in", "(resolved,closed)")
          .limit(200);

        const breachedIds = (breaching ?? []).map((c) => c.id);
        if (breachedIds.length) {
          await supabaseAdmin
            .from("complaints")
            .update({ breached_at: now })
            .in("id", breachedIds);
        }

        // 2) For open + breached complaints under the reminder cap, enqueue an
        //    SLA alert email (max 1 per 24h via last_reminded_at guard, and
        //    hard capped at MAX_REMINDERS_PER_COMPLAINT total).
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: openBreached } = await supabaseAdmin
          .from("complaints")
          .select("id, complaint_number, lead_id, severity, category, sla_due_at, last_reminded_at, reminder_count")
          .not("breached_at", "is", null)
          .not("status", "in", "(resolved,closed)")
          .lt("reminder_count", MAX_REMINDERS_PER_COMPLAINT)
          .or(`last_reminded_at.is.null,last_reminded_at.lt.${dayAgo}`)
          .limit(100);

        let queued = 0;
        let skippedDisabled = 0;
        for (const c of openBreached ?? []) {
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("email, name")
            .eq("id", c.lead_id)
            .single();
          if (!lead?.email) continue;

          try {
            const result = await enqueueFromTemplateInternal(
              "complaint_sla_breach",
              lead.email,
              {
                customerName: lead.name ?? "Customer",
                complaintNumber: c.complaint_number ?? c.id.slice(0, 8),
                severity: (c.severity ?? "normal").toString().toUpperCase(),
              },
              { toName: lead.name ?? undefined, leadId: c.lead_id },
            );
            // enqueueFromTemplateInternal returns undefined when the template
            // is disabled — treat that as a skip, not a send.
            if (!result) {
              skippedDisabled += 1;
              continue;
            }
          } catch {
            continue;
          }

          await supabaseAdmin
            .from("complaints")
            .update({ last_reminded_at: now, reminder_count: (c.reminder_count ?? 0) + 1 })
            .eq("id", c.id);
          queued += 1;
        }

        return Response.json({
          ok: true,
          newly_breached: breachedIds.length,
          alerts_queued: queued,
          skipped_template_disabled: skippedDisabled,
        });
      },
    },
  },
});
