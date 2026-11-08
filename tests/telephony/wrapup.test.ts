import { describe, it, expect } from "vitest";
import { wrapUpInput, dialTarget, cleanDialInput, CALL_OUTCOMES } from "@/lib/telephony/wrapup";

const id = "11111111-1111-4111-8111-111111111111";
describe("call wrap-up rules", () => {
  it("offers the ten requested outcomes", () => {
    expect(CALL_OUTCOMES).toEqual(["Interested", "Follow-up Required", "No Answer", "Busy", "Call Back Later", "Customer Not Reachable", "Wrong Number", "Not Interested", "Issue Resolved", "Other"]);
  });
  it("requires a follow-up time for Follow-up Required", () => {
    expect(wrapUpInput.safeParse({ id, disposition: "Follow-up Required" }).success).toBe(false);
    expect(wrapUpInput.safeParse({ id, disposition: "Follow-up Required", followUpAt: "2026-10-25T10:00:00.000Z" }).success).toBe(true);
  });
  it("does not require notes or follow-up for simple outcomes", () => {
    expect(wrapUpInput.safeParse({ id, disposition: "Busy" }).success).toBe(true);
  });
  it("still accepts outcomes saved before the upgrade", () => {
    expect(wrapUpInput.safeParse({ id, disposition: "Completed" }).success).toBe(true);
  });
  it("rejects unknown outcomes", () => {
    expect(wrapUpInput.safeParse({ id, disposition: "Whatever" }).success).toBe(false);
  });
});

describe("dialled number normalisation", () => {
  it("normalises Indian mobile formats to 10 digits", () => {
    expect(dialTarget("+91 98765 43210")).toBe("9876543210");
    expect(dialTarget("09876543210")).toBe("09876543210");
    expect(dialTarget("919876543210")).toBe("9876543210");
  });
  it("keeps landlines with STD code and +international numbers", () => {
    expect(dialTarget("08065118546")).toBe("08065118546");
    expect(dialTarget("+14155550123")).toBe("14155550123");
  });
  it("rejects short numbers and IVR codes", () => {
    expect(dialTarget("12345")).toBeNull();
    expect(dialTarget("*123#")).toBeNull();
  });
  it("cleans pasted text", () => {
    expect(cleanDialInput(" +91 (987) 654-3210 ")).toBe("+919876543210");
  });
});
