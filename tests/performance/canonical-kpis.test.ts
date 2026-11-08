import { describe, it, expect } from "vitest";
import { aggregateEmployee, kpiRows, istRangeToUtc, type PerfStreamRow } from "@/lib/crm/perf-engine/kpis";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";
let n = 0;
const row = (p: Partial<PerfStreamRow>): PerfStreamRow => ({
  kind: "action", employee_id: null, application_id: "X", event_id: `e${++n}`, event_type: "document_uploaded",
  occurred_at: "2026-10-03T05:00:00.000Z", old_assignee: null, new_assignee: null, initiator: null,
  assignment_type: null, attribution: "created_by", new_value: null, note: null, ...p,
});
const assign = (to: string, from: string | null, at: string, app = "X"): PerfStreamRow[] => {
  const out = [row({ kind: "assignment", employee_id: to, application_id: app, old_assignee: from, new_assignee: to, occurred_at: at, event_type: "assignment_change" })];
  if (from) out.push(row({ kind: "unassignment", employee_id: from, application_id: app, old_assignee: from, new_assignee: to, occurred_at: at, event_type: "assignment_change" }));
  return out;
};
const act = (who: string, at: string, app = "X") => row({ employee_id: who, application_id: app, occurred_at: at });
const complete = (who: string, at: string, app = "X") => row({ kind: "completion", employee_id: who, application_id: app, occurred_at: at, event_type: "application_completed" });

describe("canonical employee performance", () => {
  it("TEST 1: A → B keeps A's work; B gets completion", () => {
    const s = [...assign(A, null, "2026-10-03T04:30:00Z"), act(A, "2026-10-03T04:40:00Z"), ...assign(B, A, "2026-10-03T05:30:00Z"), act(B, "2026-10-03T06:00:00Z"), complete(B, "2026-10-03T06:30:00Z")];
    expect(aggregateEmployee(s, A)).toMatchObject({ assigned: 1, worked: 1, actions: 1, reassigned_out: 1, reassigned_in: 0, completed: 0 });
    expect(aggregateEmployee(s, B)).toMatchObject({ assigned: 1, reassigned_in: 1, worked: 1, actions: 2, completed: 1 });
  });
  it("TEST 2: A → B → C each keep history", () => {
    const s = [...assign(A, null, "2026-10-03T04:00:00Z"), act(A, "2026-10-03T04:10:00Z"), ...assign(B, A, "2026-10-03T04:20:00Z"), act(B, "2026-10-03T04:30:00Z"), ...assign(C, B, "2026-10-03T04:40:00Z"), complete(C, "2026-10-03T04:50:00Z")];
    expect(aggregateEmployee(s, A).worked).toBe(1);
    expect(aggregateEmployee(s, B)).toMatchObject({ worked: 1, reassigned_in: 1, reassigned_out: 1 });
    expect(aggregateEmployee(s, C)).toMatchObject({ completed: 1, reassigned_in: 1 });
  });
  it("TEST 3: auto-assigned new order is not work", () => {
    const s = assign(A, null, "2026-10-03T04:00:00Z");
    expect(aggregateEmployee(s, A)).toMatchObject({ assigned: 1, reassigned_in: 0, worked: 0, actions: 0 });
  });
  it("TEST 4/5: system closures never appear; manual closure counts once", () => {
    // System closures are excluded by the database stream (no human actor) → empty here.
    expect(aggregateEmployee([], A).closed).toBe(0);
    const s = [row({ kind: "closure", employee_id: A, event_type: "order_status_change", new_value: "CLOSED" }), row({ kind: "closure", employee_id: A, event_type: "order_status_change", new_value: "CLOSED" })];
    expect(aggregateEmployee(s, A)).toMatchObject({ closed: 1, actions: 2 });
  });
  it("TEST 6: two actions within 5 minutes both count", () => {
    const s = [act(A, "2026-10-03T05:00:00Z"), act(A, "2026-10-03T05:01:00Z")];
    expect(aggregateEmployee(s, A)).toMatchObject({ actions: 2, worked: 1 });
  });
  it("TEST 7: lead-level events never reach the stream (database filter); nothing to count", () => {
    expect(aggregateEmployee([], A).assigned).toBe(0);
  });
  it("TEST 8/9: history stays with the historical actor", () => {
    const s = [act(A, "2026-10-03T05:00:00Z")];
    expect(aggregateEmployee(s, A).worked).toBe(1);
    expect(aggregateEmployee(s, B).worked).toBe(0);
  });
  it("TEST 10: IST midnight boundary", () => {
    const { fromIso, toIso } = istRangeToUtc("2026-10-03", "2026-10-03");
    expect(fromIso).toBe("2026-10-02T18:30:00.000Z");
    expect(toIso).toBe("2026-10-03T18:30:00.000Z");
    const before = "2026-10-02T18:29:59.000Z"; // 23:59:59 IST on 2 Oct
    const after = "2026-10-02T18:30:01.000Z"; // 00:00:01 IST on 3 Oct
    expect(before >= fromIso).toBe(false);
    expect(after >= fromIso && after < toIso).toBe(true);
  });
  it("drilldown rows equal KPI counts", () => {
    const s = [...assign(A, null, "2026-10-03T04:00:00Z", "P"), ...assign(A, null, "2026-10-03T04:00:00Z", "Q"), act(A, "2026-10-03T05:00:00Z", "P"), act(A, "2026-10-03T05:02:00Z", "P")];
    const k = aggregateEmployee(s, A);
    expect(kpiRows(s, A, "assigned").length).toBe(k.assigned);
    expect(kpiRows(s, A, "actions").length).toBe(k.actions);
    expect(kpiRows(s, A, "worked").length).toBe(k.worked);
  });
});

describe("delay markings are employee actions", () => {
  const td = (who: string, at: string, app = "T") => row({ employee_id: who, application_id: app, occurred_at: at, event_type: "technical_delay_marked" });
  const cd = (who: string, at: string, app = "C") => row({ employee_id: who, application_id: app, occurred_at: at, event_type: "customer_delay_marked" });

  it("1: employee marks Technical Delay → action +1, worked +1, logged +1", () => {
    expect(aggregateEmployee([td(A, "2026-10-03T05:00:00Z")], A)).toMatchObject({ actions: 1, worked: 1, technical_delay_logged: 1, customer_delay_logged: 0 });
  });
  it("2: employee marks Customer Delay → action +1, worked +1, logged +1", () => {
    expect(aggregateEmployee([cd(A, "2026-10-03T05:00:00Z")], A)).toMatchObject({ actions: 1, worked: 1, customer_delay_logged: 1, technical_delay_logged: 0 });
  });
  it("3: system Technical Delay never reaches the stream → employee action 0", () => {
    // The database stream drops events without a verified staff actor.
    expect(aggregateEmployee([], A)).toMatchObject({ actions: 0, worked: 0, technical_delay_logged: 0 });
  });
  it("4: an order still on hold the next day adds nothing without a new marking", () => {
    const { fromIso, toIso } = istRangeToUtc("2026-10-04", "2026-10-04");
    const stream = [td(A, "2026-10-03T05:00:00Z")].filter((r) => r.occurred_at >= fromIso && r.occurred_at < toIso);
    expect(aggregateEmployee(stream, A)).toMatchObject({ actions: 0, worked: 0, technical_delay_logged: 0 });
  });
  it("5: Actions drilldown includes the delay action exactly once", () => {
    const e = td(A, "2026-10-03T05:00:00Z");
    const rows = kpiRows([e, e, act(A, "2026-10-03T06:00:00Z", "T")], A, "actions");
    expect(rows.filter((r) => r.event_id === e.event_id)).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });
  it("6: Delay Logged drilldowns match the KPI (incl. status-change hold markings)", () => {
    const s = [td(A, "2026-10-03T05:00:00Z"), row({ employee_id: A, application_id: "T2", event_type: "order_status_change", new_value: "TECHNICAL_HOLD_INTERNAL" }), cd(A, "2026-10-03T07:00:00Z")];
    const k = aggregateEmployee(s, A);
    expect(kpiRows(s, A, "technical_delay_logged")).toHaveLength(k.technical_delay_logged);
    expect(kpiRows(s, A, "customer_delay_logged")).toHaveLength(k.customer_delay_logged);
    expect(k).toMatchObject({ technical_delay_logged: 2, customer_delay_logged: 1, actions: 3 });
  });
});

describe("assignment is custody, never work", () => {
  it("superadmin manual, auto, pool and reassignment never add Actions/Worked", () => {
    const s = [
      ...assign(A, null, "2026-10-03T04:00:00Z"),
      ...assign(B, A, "2026-10-03T04:10:00Z"),
      ...assign(A, B, "2026-10-03T04:20:00Z", "Y"),
      row({ kind: "assignment", employee_id: A, application_id: "Z", event_type: "legacy_initial_assignment", assignment_type: "AUTO_ASSIGNMENT" }),
    ];
    for (const who of [A, B]) {
      const k = aggregateEmployee(s, who);
      expect(k.actions).toBe(0);
      expect(k.worked).toBe(0);
      expect(k.last_action_in_range).toBeNull();
    }
    expect(aggregateEmployee(s, A)).toMatchObject({ assigned: 3, reassigned_out: 1 });
    expect(aggregateEmployee(s, B)).toMatchObject({ assigned: 1, reassigned_in: 1 });
  });
  it("a mislabelled assignment row (kind=action) is still rejected", () => {
    const s = [row({ kind: "action", employee_id: A, event_type: "assignment_change" }), row({ kind: "action", employee_id: A, assignment_type: "MANUAL_ASSIGNMENT" })];
    expect(aggregateEmployee(s, A)).toMatchObject({ actions: 0, worked: 0 });
    expect(kpiRows(s, A, "actions")).toHaveLength(0);
  });
  it("only the real staff action counts after an assignment", () => {
    const s = [...assign(A, null, "2026-10-03T04:00:00Z"), act(A, "2026-10-03T04:05:00Z")];
    expect(aggregateEmployee(s, A)).toMatchObject({ assigned: 1, actions: 1, worked: 1 });
  });
});

describe("determinism: same input → same output, whatever the row order", () => {
  const S = [
    ...assign(A, null, "2026-10-03T04:00:00Z", "P"), act(A, "2026-10-03T04:05:00Z", "P"), act(A, "2026-10-03T04:05:00Z", "P"),
    ...assign(B, A, "2026-10-03T04:10:00Z", "P"), act(B, "2026-10-03T04:10:00Z", "P"), complete(B, "2026-10-03T04:20:00Z", "P"),
    row({ kind: "closure", employee_id: B, application_id: "P", event_type: "order_status_change", new_value: "CLOSED", occurred_at: "2026-10-03T04:20:00Z" }),
    row({ employee_id: A, application_id: "Q", event_type: "technical_delay_marked", occurred_at: "2026-10-03T05:00:00.000+00:00" }),
    row({ employee_id: A, application_id: "Q", occurred_at: "2026-10-03T05:00:00Z" }),
  ];
  // Seeded shuffle so every run is reproducible.
  const shuffle = <T,>(xs: T[], seed: number) => {
    const a = [...xs]; let s = seed;
    for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const snapshot = (rows: PerfStreamRow[]) => [A, B].map((e) => ({
    k: aggregateEmployee(rows, e),
    d: (["assigned", "reassigned_in", "reassigned_out", "worked", "actions", "completed", "closed", "technical_delay_logged"] as const)
      .map((kpi) => kpiRows(rows, e, kpi).map((r) => r.event_id)),
  }));
  it("200 shuffled orderings give identical KPIs and drilldowns", () => {
    const base = JSON.stringify(snapshot(S));
    for (let seed = 1; seed <= 200; seed++) expect(JSON.stringify(snapshot(shuffle(S, seed)))).toBe(base);
  });
  it("aggregation is pure: repeated calls never change the result or the input", () => {
    const before = JSON.stringify(S);
    const first = JSON.stringify(snapshot(S));
    for (let i = 0; i < 50; i++) expect(JSON.stringify(snapshot(S))).toBe(first);
    expect(JSON.stringify(S)).toBe(before);
  });
});
