import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/v1/services
 *
 * Active services and pricing for the calling website. The website is
 * resolved from the verified `Origin` header — never from a body field or a
 * client-supplied domain header.
 */
export const Route = createFileRoute("/api/public/v1/services")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const g = await import("@/lib/api/v1/guard.server");
        const { origin } = await g.resolveCallerWebsite(request);
        return g.preflight(origin, "GET");
      },
      GET: async ({ request }) => {
        const g = await import("@/lib/api/v1/guard.server");
        const { website, origin } = await g.resolveCallerWebsite(request);

        if (!website) {
          return g.jsonError(403, "ORIGIN_NOT_ALLOWED", "This origin is not authorised.", null, "GET");
        }
        if (!g.rateLimit(g.clientKey(request, "services"), 60, 60_000)) {
          return g.jsonError(429, "RATE_LIMITED", "Too many requests. Please slow down.", origin, "GET");
        }

        try {
          const { listWebsiteServices } = await import("@/lib/api/v1/leads.server");
          const rows = await listWebsiteServices(website.id);

          return g.jsonOk(
            {
              website: {
                domain: website.domain,
                name: website.brand_name || website.name || website.domain,
              },
              services: rows.map((s) => ({
                code: s.service_code,
                name: s.service_name,
                description: s.description ?? null,
                base_amount: Number(s.base_amount),
                gst_amount: Number(s.gst_amount),
                total_amount: Number(s.total_amount),
                processing_days: s.expected_processing_days ?? null,
              })),
            },
            origin,
            "GET",
          );
        } catch (e) {
          console.error("[api/v1/services]", e);
          return g.jsonError(500, "SERVER_ERROR", "Could not load services.", origin, "GET");
        }
      },
    },
  },
});
