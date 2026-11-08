// Cron endpoint: fires all due workflow timers. Call every minute via pg_cron.
// Authorizes with the shared CRON_SECRET header (matches existing cron routes).

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/workflow-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        const apikey = request.headers.get("apikey") ?? "";
        if (!secret || (auth !== `Bearer ${secret}` && apikey !== secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { tickDueTimers } = await import("@/lib/workflow/engine.server");
        try {
          const result = await tickDueTimers();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("[workflow-tick] failed", err);
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run" }),
    },
  },
});
