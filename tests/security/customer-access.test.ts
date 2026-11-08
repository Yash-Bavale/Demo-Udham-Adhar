import { describe, expect, it } from "vitest";
import {
  KIND_SCOPES,
  evaluateToken,
  parseTokenKind,
  type TokenRow,
} from "@/lib/security/customer-access-core";

const LEAD_A = "11111111-1111-4111-8111-111111111111";
const LEAD_B = "22222222-2222-4222-8222-222222222222";
const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
const raw = (k: string) => `${k}_${"A".repeat(43)}`;

function row(over: Partial<TokenRow> = {}): TokenRow {
  return { kind: "ob", lead_id: LEAD_A, scopes: [...KIND_SCOPES.ob], expires_at: future, revoked_at: null, max_uses: null, use_count: 0, ...over };
}

describe("customer access tokens", () => {
  it("rejects guessable or malformed values such as a bare order number", () => {
    expect(parseTokenKind("UA-2026-000123")).toBeNull();
    expect(parseTokenKind("ob_short")).toBeNull();
    expect(parseTokenKind(raw("xx"))).toBeNull();
    expect(parseTokenKind(raw("ob"))).toBe("ob");
  });

  it("customer A's token cannot open customer B's order", () => {
    expect(evaluateToken(row(), "ob", LEAD_B, "onboarding")).toEqual({ ok: false, reason: "wrong_order" });
    expect(evaluateToken(row(), "ob", LEAD_A, "onboarding")).toEqual({ ok: true });
  });

  it("an onboarding token cannot start a payment", () => {
    expect(evaluateToken(row(), "ob", LEAD_A, "payment")).toEqual({ ok: false, reason: "scope" });
  });

  it("a checkout token cannot read or change the onboarding form", () => {
    const co = row({ kind: "co", scopes: [...KIND_SCOPES.co] });
    expect(evaluateToken(co, "co", LEAD_A, "onboarding")).toEqual({ ok: false, reason: "scope" });
    expect(evaluateToken(co, "co", LEAD_A, "documents")).toEqual({ ok: false, reason: "scope" });
    expect(evaluateToken(co, "co", LEAD_A, "payment")).toEqual({ ok: true });
  });

  it("stored scopes cannot be widened beyond the kind's allowlist", () => {
    const tampered = row({ scopes: ["onboarding", "payment"] });
    expect(evaluateToken(tampered, "ob", LEAD_A, "payment")).toEqual({ ok: false, reason: "scope" });
  });

  it("expired, revoked and used-up tokens are rejected", () => {
    expect(evaluateToken(row({ expires_at: past }), "ob", LEAD_A, "onboarding")).toEqual({ ok: false, reason: "expired" });
    expect(evaluateToken(row({ revoked_at: past }), "ob", LEAD_A, "onboarding")).toEqual({ ok: false, reason: "revoked" });
    expect(evaluateToken(row({ max_uses: 1, use_count: 1 }), "ob", LEAD_A, "onboarding")).toEqual({ ok: false, reason: "used_up" });
  });

  it("unknown tokens and prefix mismatches are rejected", () => {
    expect(evaluateToken(null, "ob", LEAD_A, "onboarding")).toEqual({ ok: false, reason: "not_found" });
    expect(evaluateToken(row({ kind: "co" }), "ob", LEAD_A, "onboarding")).toEqual({ ok: false, reason: "not_found" });
  });
});
