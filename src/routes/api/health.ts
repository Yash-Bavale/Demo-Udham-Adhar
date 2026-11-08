import { createFileRoute } from "@tanstack/react-router";

/**
 * Lightweight liveness probe for the API hostname
 * (https://api.businesshelpservices.com/api/health).
 *
 * Intentionally returns nothing but a static acknowledgement — no env values,
 * no credentials, no build or database information.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, service: "businesshelpservices-api" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
