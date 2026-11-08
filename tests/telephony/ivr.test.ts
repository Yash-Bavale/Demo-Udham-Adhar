import { describe, it, expect, vi } from "vitest";
import { EMPTY_IVR_DRAFT, IvrDraftSchema, requireTelephonyAdmin } from "@/lib/telephony/ivr.config";

describe("IVR planning validation", () => {
  it("allows an incomplete disabled draft without inventing destinations", () => {
    expect(IvrDraftSchema.parse(EMPTY_IVR_DRAFT).fallback).toEqual({ kind: "terminate", value: "" });
  });
  it("rejects enabling a draft without a greeting or business number", () => {
    expect(IvrDraftSchema.safeParse({ ...EMPTY_IVR_DRAFT, enabled: true }).success).toBe(false);
  });
  it("rejects duplicate DTMF menu keys", () => {
    const choice = { key: "1", label: "Support", destination: { kind: "member", value: "122354" } };
    expect(IvrDraftSchema.safeParse({ ...EMPTY_IVR_DRAFT, menu: [choice, choice] }).success).toBe(false);
  });
  it("requires valid destinations and refuses unsafe audio URLs", () => {
    expect(IvrDraftSchema.safeParse({ ...EMPTY_IVR_DRAFT, fallback: { kind: "number", value: "abc" } }).success).toBe(false);
    expect(IvrDraftSchema.safeParse({ ...EMPTY_IVR_DRAFT, greetingAudio: "javascript:alert(1)" }).success).toBe(false);
  });
  it("rejects inverted hours and unlimited retries", () => {
    expect(IvrDraftSchema.safeParse({ ...EMPTY_IVR_DRAFT, businessHours: [{ day: 1, open: "17:00", close: "09:00" }] }).success).toBe(false);
    expect(IvrDraftSchema.safeParse({ ...EMPTY_IVR_DRAFT, retries: 100 }).success).toBe(false);
  });
});
describe("IVR administrative access", () => {
  it.each(["admin", "super_admin"])("allows only verified %s roles", async (role) => {
    await expect(requireTelephonyAdmin({ userId: "u", supabase: { rpc: vi.fn(async (_fn, input) => ({ data: input._role === role })) } })).resolves.toBeUndefined();
  });
  it("denies employees and failed role reads", async () => {
    await expect(requireTelephonyAdmin({ userId: "u", supabase: { rpc: vi.fn(async () => ({ data: true, error: new Error("failed") })) } })).rejects.toThrow(/administrators/);
  });
});