// pg_cron calls this every minute with the CRON_SECRET in the apikey header.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/process-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Server-only CRON_SECRET — never VITE_-prefixed, never shipped to client.
        const apikey = request.headers.get("apikey");
        const expected = process.env.CRON_SECRET;
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { processQueueInternal } = await import("@/lib/emails/emails.server");
          const result = await processQueueInternal(50);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
