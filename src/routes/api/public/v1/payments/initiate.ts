import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/v1/payments/initiate
 *
 * Builds a gateway checkout for a lead and returns exactly what the browser
 * needs to hand over to the gateway — nothing more. Signing keys and API
 * secrets stay on the server.
 *
 * Deliberately absent: any caller-supplied return URL. Where the customer is
 * sent back to is resolved server-side from `leads.website_id`, which closes
 * the open-redirect class of problem.
 */
const Schema = z.object({
  lead_code: z.string().trim().min(3).max(80),
  checkout_token: z.string().trim().min(10).max(600),
  gateway_code: z.string().trim().min(2).max(40).optional(),
});

export const Route = createFileRoute("/api/public/v1/payments/initiate")({
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
        if (!g.rateLimit(g.clientKey(request, "initiate"), 20, 60_000)) {
          return g.jsonError(429, "RATE_LIMITED", "Too many attempts. Please wait a moment.", origin);
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

          // The token's website must match the lead's own website.
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("id, lead_code, website_id")
            .eq("lead_code", input.lead_code)
            .maybeSingle();
          if (!lead || lead.website_id !== claims.w) {
            return g.jsonError(404, "NOT_FOUND", "Application not found.", origin);
          }
          const { data: siteRow } = await supabaseAdmin.from("websites").select("payments_enabled").eq("id", lead.website_id!).maybeSingle();
          if (siteRow && siteRow.payments_enabled === false) {
            return g.jsonError(403, "PAYMENTS_DISABLED", "Payments are currently not being accepted on this website.", origin);
          }

          let chosen = (input.gateway_code ?? "").trim().toLowerCase();
          if (!chosen) {
            const { data: gws } = await supabaseAdmin
              .from("payment_gateways")
              .select("name, config")
              .eq("is_enabled", true)
              .order("priority", { ascending: true });
            const { applyWebsiteGateways } = await import("@/lib/payments/website-gateways");
            const { websiteGatewayRules } = await import("@/lib/payments/website-gateways.server");
            const site = applyWebsiteGateways((gws ?? []).map((x: any) => ({ name: String(x.name), isDefault: Boolean(x.config?.is_default) })), await websiteGatewayRules(lead.website_id));
            const gw = site.find((x) => x.isDefault) ?? null;
            if (!gw?.name) {
              return g.jsonError(503, "NO_GATEWAY", "No payment option is currently available.", origin);
            }
            chosen = String(gw.name).toLowerCase();
          }

          if (chosen.includes("cashfree")) chosen = "cashfree";
          else if (chosen.includes("payu")) chosen = "payu";
          else if (chosen.includes("ccavenue")) chosen = "ccavenue";

          // Confirm the requested gateway is actually enabled before building.
          const { data: enabled } = await supabaseAdmin
            .from("payment_gateways")
            .select("name")
            .eq("name", chosen)
            .eq("is_enabled", true)
            .maybeSingle();
          if (!enabled) {
            return g.jsonError(400, "GATEWAY_UNAVAILABLE", "That payment option is not available.", origin);
          }

          if (chosen === "payu") {
            const { buildPayUOrder } = await import("@/lib/payments/payu-order.server");
            const order = await buildPayUOrder(input.lead_code);
            return g.jsonOk(
              {
                gateway: "payu",
                mode: "form_post",
                payment_id: order.paymentId,
                action_url: order.actionUrl,
                method: "POST",
                fields: order.fields,
                amount: order.totalAmount,
              },
              origin,
            );
          }

          if (chosen === "ccavenue") {
            const { buildCcavenueOrderForLead } = await import("@/lib/payments/ccavenue-order.server");
            const order = await buildCcavenueOrderForLead(input.lead_code);
            return g.jsonOk(
              {
                gateway: "ccavenue",
                mode: "form_post",
                payment_id: order.paymentId,
                action_url: order.actionUrl,
                method: "POST",
                fields: order.fields,
                amount: order.totalAmount,
              },
              origin,
            );
          }

          if (chosen === "cashfree") {
            const { buildCashfreeOrder } = await import("@/lib/payments/cashfree-order.server");
            // Send the customer back to the authorised website that started checkout.
            const access = await import("@/lib/security/customer-access.server");
            const returnNonce = access.newReturnNonce();
            const order = await buildCashfreeOrder(input.lead_code, returnNonce);
            await access.saveReturnContext(order.paymentId, access.normalizeReturnOrigin(origin), returnNonce);
            return g.jsonOk(
              {
                gateway: "cashfree",
                mode: "sdk",
                payment_id: order.paymentId,
                payment_session_id: order.paymentSessionId ?? null,
                is_prod: order.isProd ?? false,
                amount: order.totalAmount,
              },
              origin,
            );
          }

          return g.jsonError(400, "GATEWAY_UNAVAILABLE", "That payment option is not available.", origin);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not start the payment.";
          // Business-rule messages ("already paid", "gateway disabled") are
          // safe to surface; anything else is logged and generalised.
          const safe = /already been paid|disabled|not found|not available/i.test(message);
          if (!safe) console.error("[api/v1/payments/initiate]", e);
          return g.jsonError(
            safe ? 400 : 500,
            safe ? "NOT_ALLOWED" : "SERVER_ERROR",
            safe ? message : "Could not start the payment. Please try again.",
            origin,
          );
        }
      },
    },
  },
});
