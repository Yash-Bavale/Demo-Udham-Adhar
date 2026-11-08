import { describe, expect, it } from "vitest";

// Mirrors OnboardingForm.tsx and onboarding.functions.ts:
// commencement must not be earlier than incorporation.
function violatesRule(incorporation?: string, commencement?: string): boolean {
  return Boolean(incorporation && commencement && commencement < incorporation);
}

describe("commencement vs incorporation date rule", () => {
  it("rejects commencement earlier than incorporation", () => {
    expect(violatesRule("2026-10-07", "2026-10-01")).toBe(true);
  });
  it("allows commencement after incorporation", () => {
    expect(violatesRule("2024-01-10", "2024-06-01")).toBe(false);
  });
  it("allows equal dates", () => {
    expect(violatesRule("2024-03-15", "2024-03-15")).toBe(false);
  });
  it("skips when either date is missing", () => {
    expect(violatesRule(undefined, "2024-01-10")).toBe(false);
    expect(violatesRule("2024-01-10", undefined)).toBe(false);
  });
});
