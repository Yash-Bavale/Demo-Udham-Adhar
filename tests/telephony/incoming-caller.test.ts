import { describe, expect, it, vi, beforeEach } from "vitest";

type Tables = Record<string, any[]>;
let tables: Tables = {};
let failLeads = false;

// Minimal query builder over in-memory rows, enough for lookupCaller's filters.
function builder(name: string) {
  let rows = [...(tables[name] ?? [])];
  const b: any = {
    select: () => b,
    in: (col: string, vals: any[]) => { rows = rows.filter((r) => vals.includes(r[col])); return b; },
    or: (expr: string) => {
      if (expr.startsWith("is_deleted")) { rows = rows.filter((r) => !r.is_deleted); return b; }
      const parts = expr.split(/,(?![^(]*\))/);
      rows = rows.filter((r) => parts.some((p) => {
        const [col, op, v] = p.split(/\.(in|eq)\./);
        return op === "eq" ? r[col] === v : v.replace(/[()]/g, "").split(",").includes(r[col]);
      }));
      return b;
    },
    order: () => b,
    limit: () => b,
    then: (res: any) => res(failLeads && name === "leads" ? { data: null, error: new Error("db down") } : { data: rows, error: null }),
  };
  return b;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (n: string) => builder(n) } }));

const { lookupCaller, normalizeIndianMobile, rankCallerOrders } = await import("@/lib/telephony/phone.server");
const { pickWebRtcCandidate } = await import("@/lib/telephony/callerdesk.server");

const svc = [{ id: "s1", service_name: "Udyam Registration" }];
const ppl = [{ id: "u1", full_name: "Sid" }];

beforeEach(() => { failLeads = false; tables = { services: svc, profiles: ppl, leads: [], customers: [], applications: [] }; });

describe("Indian number normalisation", () => {
  it("accepts common formats", () => {
    for (const n of ["9876543210", "+919876543210", "09876543210", "91 98765 43210"]) expect(normalizeIndianMobile(n)).toBe("9876543210");
  });
  it("rejects invalid numbers", () => {
    for (const n of ["", "12345", "5876543210", "449876543210", null]) expect(normalizeIndianMobile(n)).toBeNull();
  });
});

describe("incoming caller lookup", () => {
  it("unknown caller", async () => { expect((await lookupCaller("9876543210")).kind).toBe("unknown"); });
  it("invalid number does not query", async () => { expect((await lookupCaller("abc")).kind).toBe("invalid"); });

  it("lead without an order", async () => {
    tables.leads = [{ id: "l1", lead_code: "LD-1", name: "Asha", status: "new", service_id: "s1", assigned_to: "u1", mobile: "9876543210", created_at: "2026-10-01" }];
    const r = await lookupCaller("+91 9876543210");
    expect(r.kind).toBe("lead");
    expect(r.lead).toMatchObject({ code: "LD-1", service: "Udyam Registration", assignee: "Sid" });
  });

  it("customer match with a single order", async () => {
    tables.customers = [{ id: "c1", name: "Asha Traders", primary_mobile: "+919876543210" }];
    tables.applications = [{ id: "a1", application_code: "AP-1", order_status: "IN_PROGRESS", service_id: "s1", assigned_to: "u1", customer_id: "c1", lead_id: "x", created_at: "2026-10-02" }];
    const r = await lookupCaller("9876543210");
    expect(r.orders.map((o) => o.code)).toEqual(["AP-1"]);
    expect(r.customerName).toBe("Asha Traders");
  });

  it("multiple orders: active first, closed kept separately, no duplicates from overlapping lead/customer", async () => {
    tables.customers = [{ id: "c1", name: "Asha", primary_mobile: "9876543210" }];
    tables.leads = [
      { id: "l1", name: "Asha", status: "converted", mobile: "9876543210", customer_id: "c1", created_at: "2026-09-01" },
      { id: "l2", name: "Asha dup", status: "new", mobile: "09876543210", customer_id: null, created_at: "2026-09-05" },
    ];
    tables.applications = [
      { id: "a1", application_code: "AP-1", order_status: "COMPLETED", customer_id: "c1", lead_id: "l1", created_at: "2026-10-05" },
      { id: "a2", application_code: "AP-2", order_status: "IN_PROGRESS", customer_id: "c1", lead_id: "l2", created_at: "2026-09-02" },
    ];
    const r = await lookupCaller("9876543210");
    expect(r.orders.map((o) => [o.code, o.active])).toEqual([["AP-2", true], ["AP-1", false]]);
  });

  it("lookup failure rejects (UI keeps ringing and shows a soft message)", async () => {
    failLeads = true;
    await expect(lookupCaller("9876543210")).rejects.toThrow();
  });

  it("rankCallerOrders dedupes by id", () => {
    const o = { id: "a", code: "AP", service: null, status: "X", assignee: null, active: true, createdAt: "1" };
    expect(rankCallerOrders([o, o])).toHaveLength(1);
  });
});

describe("inbound webhook reconciliation", () => {
  it("adopts only a single unambiguous browser row", () => {
    expect(pickWebRtcCandidate([{ call_id: "webrtc:in:1", provider_uuid: null }])?.call_id).toBe("webrtc:in:1");
    expect(pickWebRtcCandidate([{ call_id: "webrtc:in:1", provider_uuid: null }, { call_id: "webrtc:in:2", provider_uuid: null }])).toBeNull();
    expect(pickWebRtcCandidate([{ call_id: "webrtc:in:1", provider_uuid: "CS1" }])).toBeNull();
  });
});
