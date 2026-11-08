import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/v1/payments/:leadCode/status?token=...
 *
 * Lightweight polling endpoint for the customer's success / pending screen.
 * Token-gated and deliberately thin: payment outcome, order code and where to
 * go next. No customer identity, no gateway references beyond the name.
 */
export const Route = createFileRoute("/api/public/v1/payments/$leadCode/status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const g = await import("@/lib/api/v1/guard.server");
        const { origin } = await g.resolveCallerWebsite(request);
        return g.preflight(origin, "GET");
      },
      GET: async ({ request, params }) => {
        const g = await import("@/lib/api/v1/guard.server");
        const { website, origin } = await g.resolveCallerWebsite(request);

        if (!website) {
          return g.jsonError(403, "ORIGIN_NOT_ALLOWED", "This origin is not authorised.", null, "GET");
        }
        if (!g.rateLimit(g.clientKey(request, "status"), 120, 60_000)) {
          return g.jsonError(429, "RATE_LIMITED", "Too many requests.", origin, "GET");
        }

        const leadCode = String(params.leadCode ?? "").trim();
        const token = new URL(request.url).searchParams.get("token");
        if (!leadCode || leadCode.length > 80) {
          return g.jsonError(400, "VALIDATION_FAILED", "Invalid reference.", origin, "GET");
        }

        const claims = await g.verifyCheckoutToken(token, leadCode);
        if (!claims) {
          return g.jsonError(401, "INVALID_TOKEN", "This session has expired.", origin, "GET");
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("id, lead_code, status, website_id")
            .eq("lead_code", leadCode)
            .maybeSingle();
          if (!lead || lead.website_id !== claims.w) {
            return g.jsonError(404, "NOT_FOUND", "Application not found.", origin, "GET");
          }

          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("status, gateway_name, amount, payment_date")
            .eq("lead_id", lead.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const { data: application } = await supabaseAdmin
            .from("applications")
            .select("application_code")
            .eq("lead_id", lead.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const isPaid = payment?.status === "paid";
          let nextUrl = `/payment/${lead.lead_code}`;
          if (isPaid) {
            const { issueCustomerToken } = await import("@/lib/security/customer-access.server");
            nextUrl = `/onboarding/${lead.lead_code}#t=${await issueCustomerToken(lead.id, "ob", { reason: "api_v1_paid" })}`;
          }

          return g.jsonOk(
            {
              lead_code: lead.lead_code,
              is_paid: isPaid,
              status: lead.status,
              payment_status: payment?.status ?? "none",
              gateway: payment?.gateway_name ?? null,
              amount: payment?.amount ? Number(payment.amount) : null,
              paid_at: payment?.payment_date ?? null,
              order_code: application?.application_code ?? null,
              next_url: nextUrl,
            },
            origin,
            "GET",
          );
        } catch (e) {
          console.error("[api/v1/payments/status]", e);
          return g.jsonError(500, "SERVER_ERROR", "Could not check the payment status.", origin, "GET");
        }
      },
    },
  },
});
