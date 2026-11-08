import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/v1/applications/summary
 *
 * Checkout summary for one lead. Requires the checkout token issued when the
 * lead was created, so a guessed lead code alone reveals nothing. Customer
 * identity fields are returned masked; the full values never cross the API
 * boundary.
 */
const Schema = z.object({
  lead_code: z.string().trim().min(3).max(80),
  checkout_token: z.string().trim().min(10).max(600),
});

export const Route = createFileRoute("/api/public/v1/applications/summary")({
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
        if (!g.rateLimit(g.clientKey(request, "summary"), 60, 60_000)) {
          return g.jsonError(429, "RATE_LIMITED", "Too many requests. Please slow down.", origin);
        }

        let input: z.infer<typeof Schema>;
        try {
          input = Schema.parse(await request.json());
        } catch {
          return g.jsonError(400, "VALIDATION_FAILED", "Invalid request.", origin);
        }

        const claims = await g.verifyCheckoutToken(input.checkout_token, input.lead_code);
        if (!claims) {
          return g.jsonError(401, "INVALID_TOKEN", "This checkout session has expired.", origin);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select(
              "id, lead_code, name, email, mobile, state, service, service_id, base_amount, gst_amount, total_amount, status, lead_status_v2, website_id",
            )
            .eq("lead_code", input.lead_code)
            .maybeSingle();

          if (!lead || lead.website_id !== claims.w) {
            return g.jsonError(404, "NOT_FOUND", "Application not found.", origin);
          }

          const { data: pendingLink } = await supabaseAdmin
            .from("payment_links" as never)
            .select("amount")
            .eq("lead_id", lead.id)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const pendingAmount = Number((pendingLink as { amount?: number } | null)?.amount ?? 0);
          const hasPendingLink = pendingAmount > 0;

          const { data: paid } = await supabaseAdmin
            .from("payments")
            .select("id")
            .eq("lead_id", lead.id)
            .eq("status", "paid")
            .limit(1)
            .maybeSingle();

          const awaitingTopUp =
            hasPendingLink || lead.status === "payment_pending" || lead.lead_status_v2 === "payment_pending";
          const isPaid = !!paid && !awaitingTopUp;

          const totalAmount = hasPendingLink ? pendingAmount : Number(lead.total_amount ?? 0);
          const baseAmount = hasPendingLink
            ? Math.round((totalAmount / 1.18) * 100) / 100
            : Number(lead.base_amount ?? 0);
          const gstAmount = hasPendingLink
            ? Math.round((totalAmount - baseAmount) * 100) / 100
            : Number(lead.gst_amount ?? 0);

          const { data: gateways } = await supabaseAdmin
            .from("payment_gateways")
            .select("name, display_name, config, priority")
            .eq("is_enabled", true)
            .order("priority", { ascending: true });

          const { applyWebsiteGateways } = await import("@/lib/payments/website-gateways");
          const { websiteGatewayRules } = await import("@/lib/payments/website-gateways.server");
          const siteList = applyWebsiteGateways(
            (gateways ?? []).map((row) => ({ row, name: String(row.name), isDefault: Boolean((row.config as any)?.is_default) })),
            await websiteGatewayRules(lead.website_id),
          );
          const gatewayList = siteList.map(({ row, isDefault }) => {
            const config = (row.config ?? {}) as { description?: string; logo_url?: string };
            return {
              code: row.name,
              name: row.display_name,
              description: config.description ?? null,
              logo_url: config.logo_url ?? null,
              is_default: isDefault,
            };
          });

          const { data: siteRow } = await supabaseAdmin.from("websites").select("payments_enabled").eq("id", lead.website_id!).maybeSingle();

          return g.jsonOk(
            {
              payments_enabled: siteRow?.payments_enabled !== false,
              lead: {
                lead_code: lead.lead_code,
                // Masked — enough for the customer to recognise their own
                // application, useless to anyone guessing lead codes.
                name_masked: g.maskName(lead.name),
                email_masked: g.maskEmail(lead.email),
                mobile_masked: g.maskMobile(lead.mobile),
                state: lead.state,
                service_name: lead.service,
                status: lead.status,
                is_paid: isPaid,
              },
              pricing: {
                base_amount: baseAmount,
                gst_amount: gstAmount,
                total_amount: totalAmount,
                is_top_up: hasPendingLink,
                currency: "INR",
              },
              gateways: gatewayList,
              default_gateway:
                gatewayList.find((x) => x.is_default)?.code ?? gatewayList[0]?.code ?? null,
            },
            origin,
          );
        } catch (e) {
          console.error("[api/v1/applications/summary]", e);
          return g.jsonError(500, "SERVER_ERROR", "Could not load this application.", origin);
        }
      },
    },
  },
});
