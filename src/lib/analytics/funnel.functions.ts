import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FUNNEL_STEPS: { key: string; label: string; events: string[] }[] = [
  { key: "landed", label: "Landed on Site", events: ["page_view_landing"] },
  { key: "form_started", label: "Started Form", events: ["form_started", "form_field_filled"] },
  { key: "form_submitted", label: "Submitted Form", events: ["form_submitted", "lead_created"] },
  { key: "payment_viewed", label: "Viewed Payment", events: ["payment_page_viewed"] },
  { key: "payment_initiated", label: "Initiated Payment", events: ["payment_initiated"] },
  { key: "payment_success", label: "Payment Success", events: ["payment_success"] },
];

export const getFunnelStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("analytics_events")
      .select("event_name, session_id")
      .gte("created_at", sinceISO)
      .limit(50000);

    if (error) throw new Error(error.message);

    const sessionsByStep: Record<string, Set<string>> = {};
    for (const step of FUNNEL_STEPS) sessionsByStep[step.key] = new Set();

    for (const row of data ?? []) {
      const sid = row.session_id ?? "unknown";
      for (const step of FUNNEL_STEPS) {
        if (step.events.includes(row.event_name)) sessionsByStep[step.key].add(sid);
      }
    }

    const top = sessionsByStep[FUNNEL_STEPS[0].key].size || 1;
    return {
      windowDays: 30,
      steps: FUNNEL_STEPS.map((s) => {
        const count = sessionsByStep[s.key].size;
        return { key: s.key, label: s.label, count, pct: Math.round((count / top) * 100) };
      }),
    };
  });
