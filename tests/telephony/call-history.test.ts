import { describe, it, expect, beforeEach } from "vitest";
import { callerDeskDirection } from "@/lib/telephony/callerdesk.server";

describe("CallerDesk report direction labels", () => {
  it.each([["IVR", "inbound"], ["WEBOBD", "outbound"], ["IBD", "inbound"], ["OBD", "outbound"], ["IN", "inbound"], ["OUT", "outbound"], ["Inbound", "inbound"], ["outbound", "outbound"]])("%s → %s", (d, want) => {
    expect(callerDeskDirection({ Direction: d })).toBe(want);
  });
  it("normalises case and whitespace", () => {
    expect(callerDeskDirection({ Direction: " ivr " })).toBe("inbound");
    expect(callerDeskDirection({ Direction: "Web Obd" })).toBe("outbound");
  });
  it.each([[""], ["   "], ["unknown"], ["IVRX"], ["OBDWEB"], ["$Direction"]])("unknown label %j has no direction", (d) => {
    expect(callerDeskDirection({ Direction: d })).toBeNull();
  });
  it("missing Direction has no direction", () => { expect(callerDeskDirection({})).toBeNull(); });
});

// ---- history server function ----
const state: any = { roles: { admin: false, super_admin: false }, calls: [] as any[], rows: [] as any[], count: 0 };
function query() {
  const q: any = { _f: [] as any[] };
  for (const m of ["select", "gte", "lt", "eq", "order", "in"]) q[m] = (...a: any[]) => { state.calls.push([m, ...a]); return q; };
  q.range = (a: number, b: number) => { state.calls.push(["range", a, b]); return Promise.resolve({ data: state.rows, count: state.count, error: null }); };
  q.then = (r: any) => r({ data: [], error: null });
  return q;
}
const sb = { rpc: async (_: string, a: any) => ({ data: state.roles[a._role] }), from: () => query() };
const adminDb = { from: () => query() };
const mod = await import("@/lib/telephony/calls.functions");
const base = { from: "2026-10-01", to: "2026-10-07", direction: "all", status: "all", page: 0 };

describe("call history", () => {
  beforeEach(() => { state.roles = { admin: false, super_admin: false }; state.calls = []; state.rows = []; state.count = 0; });

  it("rejects non-admin staff", async () => {
    await expect(mod.queryCallHistory(sb, adminDb, "u1", mod.callHistoryInput.parse(base))).rejects.toThrow("Unauthorized");
  });
  it("uses IST day boundaries", () => {
    expect(mod.istDayRange("2026-10-23", "2026-10-23")).toEqual({ fromIso: "2026-10-22T18:30:00.000Z", toIso: "2026-10-23T18:30:00.000Z" });
  });
  it("rejects reversed and too-long date ranges", () => {
    expect(() => mod.callHistoryInput.parse({ ...base, from: "2026-10-08" })).toThrow();
    expect(() => mod.callHistoryInput.parse({ ...base, from: "2026-01-01", to: "2026-10-01" })).toThrow();
  });
  it("applies direction and status filters and paginates 25 per page", async () => {
    state.roles.admin = true; state.count = 60;
    const r = await mod.queryCallHistory(sb, adminDb, "u1", mod.callHistoryInput.parse({ ...base, direction: "inbound", status: "missed", page: 2 }));
    expect(state.calls).toContainEqual(["eq", "direction", "inbound"]);
    expect(state.calls).toContainEqual(["eq", "status", "missed"]);
    expect(state.calls).toContainEqual(["range", 50, 74]);
    expect(r).toMatchObject({ total: 60, page: 2, pageSize: 25 });
  });
  it("does not filter by status when 'all' so finished calls stay visible", async () => {
    state.roles.super_admin = true;
    await mod.queryCallHistory(sb, adminDb, "u1", mod.callHistoryInput.parse(base));
    expect(state.calls.some((c: any[]) => c[0] === "eq" || c[0] === "in")).toBe(false);
  });
  it("only exposes http(s) recording links", async () => {
    state.roles.admin = true;
    state.rows = [
      { id: "a", call_id: "1", provider: "callerdesk", direction: "inbound", status: "ended", started_at: "2026-10-02T00:00:00Z", recording_url: "https://r/x.mp3" },
      { id: "b", call_id: "2", provider: "smartflo", direction: "outbound", status: "missed", started_at: "2026-10-02T00:00:00Z", recording_url: "javascript:alert(1)" },
    ];
    const r = await mod.queryCallHistory(sb, adminDb, "u1", mod.callHistoryInput.parse(base));
    expect(r.items.map((i: any) => i.recordingUrl)).toEqual(["https://r/x.mp3", null]);
  });
});
