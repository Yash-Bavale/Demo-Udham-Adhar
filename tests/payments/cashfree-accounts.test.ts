import { describe, expect, it } from "vitest";
import { credsFromEnv, selectAccountForWebsite } from "@/lib/payments/cashfree-accounts";

const legacy = { id: "legacy-id", account_key: "LEGACY", is_legacy: true, is_active: true };
const gst = { id: "gst-id", account_key: "GST", is_legacy: false, is_active: true };

describe("Cashfree website → account routing", () => {
  it("routes a website to its mapped account", () => {
    expect(selectAccountForWebsite("w1", { is_enabled: true, account: gst }).id).toBe("gst-id");
  });
  it("refuses when the website has no mapping (no global fallback)", () => {
    expect(() => selectAccountForWebsite("w1", null)).toThrow(/not set up/);
  });
  it("refuses when the order has no website", () => {
    expect(() => selectAccountForWebsite(null, { is_enabled: true, account: legacy })).toThrow(/no website/);
  });
  it("refuses a disabled mapping", () => {
    expect(() => selectAccountForWebsite("w1", { is_enabled: false, account: gst })).toThrow(/disabled/);
  });
  it("refuses an inactive account", () => {
    expect(() =>
      selectAccountForWebsite("w1", { is_enabled: true, account: { ...gst, is_active: false } }),
    ).toThrow(/inactive/);
  });
});

describe("Cashfree credentials per account", () => {
  const env = {
    CASHFREE_CLIENT_ID: "global-id",
    CASHFREE_CLIENT_SECRET: "global-secret",
    CASHFREE_MODE: "production",
    CASHFREE_GST_CLIENT_ID: "gst-id-x",
    CASHFREE_GST_CLIENT_SECRET: "gst-secret",
    CASHFREE_GST_MODE: "sandbox",
  };
  it("legacy account uses the original global secrets", () => {
    const c = credsFromEnv(legacy, env);
    expect(c.clientId).toBe("global-id");
    expect(c.isProd).toBe(true);
  });
  it("a website account uses only its own secrets", () => {
    const c = credsFromEnv(gst, env);
    expect(c.clientSecret).toBe("gst-secret");
    expect(c.apiUrl).toBe("https://sandbox.cashfree.com/pg");
  });
  it("a website account with missing secrets fails instead of using global ones", () => {
    const { CASHFREE_GST_CLIENT_SECRET: _omit, ...partial } = env;
    expect(() => credsFromEnv(gst, partial)).toThrow(/no credentials/);
  });
  it("a website account must state its mode explicitly", () => {
    const { CASHFREE_GST_MODE: _omit, ...partial } = env;
    expect(() => credsFromEnv(gst, partial)).toThrow(/no mode/);
  });
});
