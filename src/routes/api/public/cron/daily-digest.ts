// Daily staff digest cron. Emits per-assignee notifications summarising the
// previous day's activity (completions, new orders) and today's open workload
// (pending on-our-side, active tickets). Called by pg_cron once a day.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/daily-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.CRON_SECRET;
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const now = new Date();
          const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

          // Pull orders assigned to staff, group in memory
          const { data: orders } = await supabaseAdmin
            .from("applications")
            .select("id, assigned_to, order_status, updated_at, created_at, application_code")
            .not("assigned_to", "is", null)
            .in("order_status", [
              "NEW_ORDER",
              "OUR_SIDE_DELAY",
              "HIGH_PRIORITY",
              "CUSTOMER_HOLD",
              "WAITING_CUSTOMER_INFO",
              "COMPLETED",
              "CERTIFICATE_ISSUED",
            ])
            .gte("updated_at", dayAgo.toISOString())
            .limit(2000);

          const buckets = new Map<
            string,
            { open: number; completed: number; onOurSide: number }
          >();
          for (const r of (orders as Array<{
            assigned_to: string;
            order_status: string;
            updated_at: string;
          }>) || []) {
            const b =
              buckets.get(r.assigned_to) ||
              { open: 0, completed: 0, onOurSide: 0 };
            if (r.order_status === "COMPLETED" || r.order_status === "CERTIFICATE_ISSUED") {
              b.completed++;
            } else {
              b.open++;
              if (r.order_status === "OUR_SIDE_DELAY" || r.order_status === "HIGH_PRIORITY") {
                b.onOurSide++;
              }
            }
            buckets.set(r.assigned_to, b);
          }

          const rows: Array<Record<string, unknown>> = [];
          for (const [userId, b] of buckets.entries()) {
            rows.push({
              user_id: userId,
              kind: "daily_digest",
              title: `Daily digest — ${b.open} open, ${b.completed} completed (24h)`,
              body: `You have ${b.onOurSide} orders pending on our side. ${b.completed} completed in the last 24 hours.`,
              href: `/admin/orders`,
              entity_kind: "digest",
            });
          }
          if (rows.length > 0) {
            await supabaseAdmin.from("notifications").insert(rows as never);
          }
          return new Response(JSON.stringify({ ok: true, sent: rows.length }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("[daily-digest] failed", e);
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
