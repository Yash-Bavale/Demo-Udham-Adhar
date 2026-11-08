// Cron endpoint: poll Zoho Mail inbox for new messages every 2 minutes.
// Guarded by the Supabase anon key in the `apikey` header (matches the
// project's other /api/public/cron routes).

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/poll-zoho-inbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_SECRET;
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { pollZohoInbox } = await import("@/lib/mail/inbox-matcher.server");
          const result = await pollZohoInbox({ limit: 50 });
          if (result.errors > 0) {
            return new Response(JSON.stringify({ ok: false, ...result }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "unknown";
          console.error("[cron:poll-zoho-inbox] failed", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
