// Cron endpoint that fires every due order scheduler. Called by pg_cron.
// Auth: bypasses the published-site auth gate via /api/public/*; we still
// require the Supabase anon key (matches other cron routes in this project)
// so random callers cannot trigger business logic.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/schedulers-tick")({
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
          const { fireDueSchedulers } = await import("@/lib/scheduling/schedulers.server");
          const result = await fireDueSchedulers();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "unknown";
          console.error("[cron:schedulers-tick] failed", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
