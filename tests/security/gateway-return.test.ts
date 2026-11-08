import { describe, it, expect } from "vitest";
import { normalizeReturnOrigin } from "@/lib/security/customer-access.server";

describe("payment return site", () => {
  it("returns customers to the site they started on", () => {
    expect(normalizeReturnOrigin("https://udyamregistrations.in/payment/AP-1")).toBe("https://udyamregistrations.in");
    expect(normalizeReturnOrigin("https://www.udyamadhar.in")).toBe("https://www.udyamadhar.in");
  });
  it("never sends customers to someone else's site", () => {
    expect(normalizeReturnOrigin("https://evil.example.com")).toBeNull();
    expect(normalizeReturnOrigin("https://udyamadhar.in.evil.com")).toBeNull();
    expect(normalizeReturnOrigin("http://udyamadhar.in")).toBeNull();
  });
  it("never returns customers to the staff CRM", () => {
    expect(normalizeReturnOrigin("https://crm.businesshelpservices.com")).toBeNull();
  });
});
