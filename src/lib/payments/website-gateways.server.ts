import { gatewayAllowedOnWebsite, type WebsiteGatewayRule } from "./website-gateways";

/** Website switches plus Cashfree readiness; never advertise an unusable merchant account. */
export async function websiteGatewayRules(websiteId: string | null | undefined): Promise<WebsiteGatewayRule[]> {
  let rules: WebsiteGatewayRule[] = [];
  if (websiteId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("website_payment_gateways")
      .select("gateway_name, is_enabled, is_default").eq("website_id", websiteId);
    if (error) throw new Error("Could not load payment options for this website.");
    rules = data ?? [];
  }
  if (!gatewayAllowedOnWebsite("cashfree", rules)) return rules;

  const { credsForWebsite } = await import("./cashfree-accounts.server");
  const { CashfreeRoutingError } = await import("./cashfree-accounts");
  try {
    // Use the same explicit mapping and credential validation as order creation.
    // Credentials stay here on the server and are never returned with the rules.
    await credsForWebsite(websiteId);
    return rules;
  } catch (error) {
    if (!(error instanceof CashfreeRoutingError)) throw error;
    return [
      ...rules.filter((r) => r.gateway_name !== "cashfree"),
      { gateway_name: "cashfree", is_enabled: false, is_default: false },
    ];
  }
}

/** Throws when the lead's website has switched this gateway off. */
export async function assertGatewayAllowedForWebsite(websiteId: string | null | undefined, gateway: string, label: string) {
  const rules = await websiteGatewayRules(websiteId);
  if (!gatewayAllowedOnWebsite(gateway, rules)) throw new Error(`${label} is not available on this website. Please choose another payment option.`);
}
