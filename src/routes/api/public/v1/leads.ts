import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { INDIAN_STATES, LANGUAGES } from "@/lib/constants";

/**
 * POST /api/public/v1/leads
 *
 * Creates a lead for the calling website and returns a short-lived checkout
 * token. Every later endpoint that exposes this lead requires that token, so
 * sequential lead codes cannot be enumerated into customer data.
 */
const Schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  state: z.string().trim().refine((v) => INDIAN_STATES.includes(v), "Invalid state"),
  language: z.string().trim().refine((v) => LANGUAGES.includes(v), "Invalid language"),
  service: z.string().trim().min(1).max(200),
  consent: z.literal(true, { message: "Consent is required to proceed" }),
  source_page: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
  // Honeypot: real users never fill this. Bots usually do.
  company_website: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/public/v1/leads")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const g = await import("@/lib/api/v1/guard.server");
        const { origin } = await g.resolveCallerWebsite(request);
        return g.preflight(origin, "POST");
      },
      POST: async ({ request }) => {
        const g = await import("@/lib/api/v1/guard.server");
        const { website, origin } = await g.resolveCallerWebsite(request);

        if (!website) {
          return g.jsonError(403, "ORIGIN_NOT_ALLOWED", "This origin is not authorised.", null);
        }
        if (!g.rateLimit(g.clientKey(request, "leads"), 8, 60_000)) {
          return g.jsonError(429, "RATE_LIMITED", "Too many submissions. Please wait a minute.", origin);
        }

        let input: z.infer<typeof Schema>;
        try {
          input = Schema.parse(await request.json());
        } catch (e) {
          const message =
            e instanceof z.ZodError
              ? (e.issues[0]?.message ?? "Please check the details you entered.")
              : "Please check the details you entered.";
          return g.jsonError(400, "VALIDATION_FAILED", message, origin);
        }

        // Silently accept honeypot hits so bots do not learn they were caught.
        if (input.company_website) {
          return g.jsonOk({ lead_code: null, checkout_token: null }, origin);
        }

        try {
          const { createApiLead } = await import("@/lib/api/v1/leads.server");
          const result = await createApiLead(website.id, website.domain, {
            name: input.name,
            email: input.email,
            mobile: input.mobile,
            state: input.state,
            language: input.language,
            service: input.service,
            source_page: input.source_page,
            notes: input.notes,
          });

          const token = await g.issueCheckoutToken(result.leadCode, website.id);

          return g.jsonOk(
            {
              lead_code: result.leadCode,
              checkout_token: token,
              expires_in: 3600,
              service: result.service,
              pricing: { ...result.pricing, currency: "INR" },
              next_url: `/processing/${result.leadCode}#t=${result.accessToken}`,
            },
            origin,
          );
        } catch (e) {
          const code = (e as { code?: string })?.code;
          if (code === "SERVICE_UNAVAILABLE") {
            return g.jsonError(400, code, "Selected service is not available.", origin);
          }
          console.error("[api/v1/leads]", e);
          return g.jsonError(500, "SERVER_ERROR", "Could not submit your request. Please try again.", origin);
        }
      },
    },
  },
});
