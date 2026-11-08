import { describe, it, expect } from "vitest";
import { isValidGstin, normalizeGstin } from "@/lib/invoices/gstin";
describe("GSTIN validation", () => {
  it("accepts a valid GSTIN (company's own)", () => expect(isValidGstin("27COFPD1743E2ZB")).toBe(true));
  it("normalises lowercase and spaces", () => expect(normalizeGstin(" 27cofpd1743e2zb ")).toBe("27COFPD1743E2ZB"));
  it("rejects a wrong checksum", () => expect(isValidGstin("27COFPD1743E2ZC")).toBe(false));
  it("rejects wrong length", () => expect(isValidGstin("27COFPD1743E2Z")).toBe(false));
});
