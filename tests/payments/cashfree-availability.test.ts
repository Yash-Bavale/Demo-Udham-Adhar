import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyWebsiteGateways } from "@/lib/payments/website-gateways";
import { websiteGatewayRules, assertGatewayAllowedForWebsite } from "@/lib/payments/website-gateways.server";

const state = vi.hoisted(() => ({
  rules: [] as { gateway_name: string; is_enabled: boolean; is_default: boolean }[],
  mapping: null as null | { is_enabled: boolean; account: { id: string; account_key: string; is_legacy: boolean; is_active: boolean } | null },
  rulesError: false,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => table === "website_payment_gateways"
          ? Promise.resolve({ data: state.rules, error: state.rulesError ? new Error("unavailable") : null })
          : { maybeSingle: async () => ({ data: table === "cashfree_website_accounts" ? state.mapping : null, error: null }) },
      }),
    }),
  },
}));

const gateways = [
  { name: "cashfree", isDefault: true },
  { name: "payu", isDefault: false },
  { name: "ccavenue", isDefault: false },
];
const account = { id: "account-id", account_key: "LEGACY", is_legacy: true, is_active: true };
const available = async (websiteId: string | null = "new-website") =>
  applyWebsiteGateways(gateways, await websiteGatewayRules(websiteId));

beforeEach(() => {
  state.rules = [];
  state.mapping = null;
  state.rulesError = false;
  vi.stubEnv("CASHFREE_CLIENT_ID", "test-app-id");
  vi.stubEnv("CASHFREE_CLIENT_SECRET", "test-app-secret");
  vi.stubEnv("CASHFREE_MODE", "sandbox");
});
afterEach(() => vi.unstubAllEnvs());

describe("Cashfree checkout availability for new websites", () => {
  it("hides Cashfree without an explicit mapping despite available global credentials", async () => {
    expect((await available()).map((g) => g.name)).toEqual(["payu", "ccavenue"]);
  });
  it("selects an available default rather than unconfigured Cashfree", async () => {
    expect((await available()).find((g) => g.isDefault)?.name).toBe("payu");
  });
  it("offers Cashfree after explicit account linking", async () => {
    state.mapping = { is_enabled: true, account };
    expect((await available()).find((g) => g.isDefault)?.name).toBe("cashfree");
  });
  it("hides a disabled mapping", async () => {
    state.mapping = { is_enabled: false, account };
    expect((await available()).map((g) => g.name)).toEqual(["payu", "ccavenue"]);
  });
  it("hides an inactive merchant account", async () => {
    state.mapping = { is_enabled: true, account: { ...account, is_active: false } };
    expect((await available()).map((g) => g.name)).toEqual(["payu", "ccavenue"]);
  });
  it("hides an account with missing credentials", async () => {
    state.mapping = { is_enabled: true, account };
    vi.stubEnv("CASHFREE_CLIENT_SECRET", "");
    expect((await available()).map((g) => g.name)).toEqual(["payu", "ccavenue"]);
  });
  it("never falls back to global credentials for a nonlegacy account", async () => {
    state.mapping = { is_enabled: true, account: { ...account, account_key: "NEW", is_legacy: false } };
    vi.stubEnv("CASHFREE_NEW_CLIENT_ID", "");
    vi.stubEnv("CASHFREE_NEW_CLIENT_SECRET", "");
    expect((await available()).map((g) => g.name)).toEqual(["payu", "ccavenue"]);
  });
  it("keeps the website switch off even with a ready account", async () => {
    state.mapping = { is_enabled: true, account };
    state.rules = [{ gateway_name: "cashfree", is_enabled: false, is_default: false }];
    expect((await available()).map((g) => g.name)).toEqual(["payu", "ccavenue"]);
  });
  it("rejects explicit Cashfree initiation before account setup", async () => {
    await expect(assertGatewayAllowedForWebsite("new-website", "cashfree", "Cashfree")).rejects.toThrow(/not available/);
  });
  it("leaves PayU and CCAvenue initiation available without a Cashfree mapping", async () => {
    await expect(assertGatewayAllowedForWebsite("new-website", "payu", "PayU")).resolves.toBeUndefined();
    await expect(assertGatewayAllowedForWebsite("new-website", "ccavenue", "CCAvenue")).resolves.toBeUndefined();
  });
  it("hides Cashfree for an order without a website", async () => {
    expect((await available(null)).map((g) => g.name)).toEqual(["payu", "ccavenue"]);
  });
  it("does not treat a rules lookup failure as an enabled gateway", async () => {
    state.rulesError = true;
    await expect(available()).rejects.toThrow(/Could not load payment options/);
  });
});