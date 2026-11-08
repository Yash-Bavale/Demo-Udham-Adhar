import { describe, it, expect } from "vitest";
import { normalizeReturnOrigin } from "./customer-access.server";

describe("gateway return origin", () => {
  it("allows the GST website as a return address", () => {
    expect(normalizeReturnOrigin("https://gstcertificate.in/pay")).toBe("https://gstcertificate.in");
    expect(normalizeReturnOrigin("https://www.gstcertificate.in")).toBe("https://www.gstcertificate.in");
  });
  it("still rejects unknown sites and the CRM host", () => {
    expect(normalizeReturnOrigin("https://gstcertificate.in.evil.com")).toBeNull();
    expect(normalizeReturnOrigin("https://crm.businesshelpservices.com")).toBeNull();
  });
});
