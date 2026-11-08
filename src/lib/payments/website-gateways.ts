/**
 * Pure rules for website-wise payment options (browser-safe, no secrets).
 * The global gateway switch is the master: a website can only turn a globally
 * enabled gateway off, never turn on a globally disabled one. A website with no
 * row for a gateway follows the global switch, so existing sites keep working.
 */
export const WEBSITE_GATEWAYS = ["cashfree", "payu", "ccavenue"] as const;
export type WebsiteGatewayName = (typeof WEBSITE_GATEWAYS)[number];
export type WebsiteGatewayRule = { gateway_name: string; is_enabled: boolean; is_default: boolean };

export function normalizeGatewayName(name: string | null | undefined): string {
  const n = String(name ?? "").trim().toLowerCase();
  if (n.includes("cashfree")) return "cashfree";
  if (n.includes("payu")) return "payu";
  if (n.includes("ccavenue")) return "ccavenue";
  return n;
}

/** Is this globally enabled gateway allowed on the website? */
export function gatewayAllowedOnWebsite(name: string, rules: WebsiteGatewayRule[]): boolean {
  const rule = rules.find((r) => r.gateway_name === normalizeGatewayName(name));
  return rule ? rule.is_enabled : true;
}

/**
 * Filters a globally-enabled gateway list (priority order) for one website and
 * marks the website default (falls back to the global default, then the first).
 */
export function applyWebsiteGateways<T extends { name: string; isDefault: boolean }>(list: T[], rules: WebsiteGatewayRule[]): T[] {
  const allowed = list.filter((g) => gatewayAllowedOnWebsite(g.name, rules));
  const siteDefault = rules.find((r) => r.is_default && r.is_enabled)?.gateway_name;
  const pick = (siteDefault && allowed.find((g) => normalizeGatewayName(g.name) === siteDefault))
    || allowed.find((g) => g.isDefault) || allowed[0];
  return allowed.map((g) => ({ ...g, isDefault: g === pick }));
}
