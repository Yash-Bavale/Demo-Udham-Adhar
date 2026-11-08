import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Gateway-agnostic payment initiator. Picks the right gateway impl by code
 * and returns a uniform hosted-form payload for the browser to POST.
 *
 * Wired: PayU, CCAvenue. Razorpay/Cashfree slots are reserved.
 */
const Input = z.object({
  leadCode: z.string().trim().min(3).max(80),
  gatewayCode: z.string().trim().min(2).max(40).optional(),
  accessToken: z.string().trim().min(10).max(200),
  returnOrigin: z.string().trim().max(200).optional(),
});

export type InitiatePaymentResult = {
  actionUrl: string;
  fields: Record<string, string>;
  paymentId: string;
  leadCode: string;
  totalAmount: number;
  gateway: string;
  paymentSessionId?: string;
  isProd?: boolean;
};

export const initiatePayment = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<InitiatePaymentResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    {
      const { assertCustomerAccess, leadIdByCode } = await import("@/lib/security/customer-access.server");
      await assertCustomerAccess(data.accessToken, await leadIdByCode(data.leadCode), "payment", data.leadCode);
    }
    const access = await import("@/lib/security/customer-access.server");
    const returnNonce = access.newReturnNonce();
    const remember = async <T extends { paymentId: string }>(order: T): Promise<T> => {
      await access.saveReturnContext(order.paymentId, access.normalizeReturnOrigin(data.returnOrigin), returnNonce);
      return order;
    };
    let chosen = (data.gatewayCode?.toLowerCase() ?? "").trim();
    if (!chosen) {
      const { data: gws } = await supabaseAdmin
        .from("payment_gateways")
        .select("name, config")
        .eq("is_enabled", true)
        .order("priority", { ascending: true });
      const { data: lw } = await supabaseAdmin.from("leads").select("website_id").eq("lead_code", data.leadCode).maybeSingle();
      const { applyWebsiteGateways } = await import("@/lib/payments/website-gateways");
      const { websiteGatewayRules } = await import("@/lib/payments/website-gateways.server");
      const site = applyWebsiteGateways((gws ?? []).map((g: any) => ({ name: String(g.name), isDefault: Boolean(g.config?.is_default) })), await websiteGatewayRules(lw?.website_id));
      const gw = site.find((g) => g.isDefault) ?? null;
      if (!gw?.name) {
        throw new Error("No active payment gateway is currently enabled. Please contact support.");
      }
      chosen = gw.name.toLowerCase();
    }

    if (chosen.includes("cashfree")) chosen = "cashfree";
    else if (chosen.includes("payu")) chosen = "payu";
    else if (chosen.includes("ccavenue")) chosen = "ccavenue";

    switch (chosen) {
      case "payu": {
        const { buildPayUOrder } = await import("@/lib/payments/payu-order.server");
        const order = await remember(await buildPayUOrder(data.leadCode, returnNonce));
        return { ...order, gateway: "payu" };
      }
      case "ccavenue": {
        const { buildCcavenueOrderForLead } = await import(
          "@/lib/payments/ccavenue-order.server"
        );
        const order = await remember(await buildCcavenueOrderForLead(data.leadCode, returnNonce));
        return { ...order, gateway: "ccavenue" };
      }
      case "cashfree": {
        const { buildCashfreeOrder } = await import("@/lib/payments/cashfree-order.server");
        const order = await remember(await buildCashfreeOrder(data.leadCode, returnNonce));
        return { ...order, gateway: "cashfree" };
      }
      case "razorpay":
        throw new Error(`${chosen} is not enabled yet. Please choose another option.`);
      default:
        throw new Error(`Unknown payment gateway: ${chosen}`);
    }
  });
