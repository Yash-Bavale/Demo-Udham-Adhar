// Cron endpoint: Evaluates workforce presence & automatically redistributes action-required orders
// from prolonged offline (>30m), prolonged away (>60m), or on-leave staff.
// Authorized with CRON_SECRET or matching anon key.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/workforce-reassign-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_SECRET;
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { reassignProlongedUnavailableStaff } = await import("@/lib/crm/assignment-engine.server");
          const result = await reassignProlongedUnavailableStaff();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "unknown";
          console.error("[cron:workforce-reassign-tick] failed", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST with CRON_SECRET to run" }),
    },
  },
});
