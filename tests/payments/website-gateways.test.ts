import { describe, it, expect } from "vitest";
import { applyWebsiteGateways, gatewayAllowedOnWebsite } from "@/lib/payments/website-gateways";

const global = [{ name: "payu", isDefault: false }, { name: "cashfree", isDefault: true }, { name: "ccavenue", isDefault: false }];

describe("website-wise payment options", () => {
  it("a website with no settings shows every globally enabled option", () => {
    expect(applyWebsiteGateways(global, []).map((g) => g.name)).toEqual(["payu", "cashfree", "ccavenue"]);
  });
  it("a website can hide an option", () => {
    const rules = [{ gateway_name: "payu", is_enabled: false, is_default: false }];
    expect(applyWebsiteGateways(global, rules).map((g) => g.name)).toEqual(["cashfree", "ccavenue"]);
    expect(gatewayAllowedOnWebsite("PayU", rules)).toBe(false);
  });
  it("a website default overrides the global default", () => {
    const rules = [{ gateway_name: "ccavenue", is_enabled: true, is_default: true }];
    expect(applyWebsiteGateways(global, rules).find((g) => g.isDefault)?.name).toBe("ccavenue");
  });
  it("cannot turn on an option that is off for all websites", () => {
    const rules = [{ gateway_name: "razorpay", is_enabled: true, is_default: true }];
    expect(applyWebsiteGateways(global, rules).find((g) => g.isDefault)?.name).toBe("cashfree");
  });
  it("falls back to the first shown option when the default is hidden", () => {
    const rules = [{ gateway_name: "cashfree", is_enabled: false, is_default: false }];
    expect(applyWebsiteGateways(global, rules).find((g) => g.isDefault)?.name).toBe("payu");
  });
});
