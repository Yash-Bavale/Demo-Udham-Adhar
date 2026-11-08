// Canonical Employee Performance engine — pure aggregation.
//
// Every KPI is computed from ONE event stream (public.get_employee_perf_stream)
// so a KPI count always equals its drilldown row count.
//   - Assignment history != work attribution. Reassignment never removes past work.
//   - Only order-level events (application_id IS NOT NULL) ever reach this stream.
//   - Only validated human staff actions count as Worked/Actions/Completed/Closed.
//   - No time-bucket de-duplication: each event id counts once.

export type PerfStreamKind = "assignment" | "unassignment" | "action" | "completion" | "closure";

export interface PerfStreamRow {
  kind: PerfStreamKind;
  employee_id: string | null;
  application_id: string;
  event_id: string | null;
  event_type: string;
  occurred_at: string;
  old_assignee: string | null;
  new_assignee: string | null;
  initiator: string | null;
  assignment_type: string | null;
  attribution: string | null;
  new_value: string | null;
  note: string | null;
}

export type HistoricalKpi =
  | "assigned"
  | "reassigned_in"
  | "reassigned_out"
  | "worked"
  | "actions"
  | "completed"
  | "closed"
  | "technical_delay_logged"
  | "customer_delay_logged";

export const HISTORICAL_KPIS: HistoricalKpi[] = [
  "assigned", "reassigned_in", "reassigned_out", "worked", "actions", "completed", "closed",
  "technical_delay_logged", "customer_delay_logged",
];

/** A deliberate staff delay marking. One event = one marking; the ongoing hold state never re-counts. */
export function delayKind(r: PerfStreamRow): "technical" | "customer" | null {
  if (r.kind !== "action") return null;
  const v = String(r.new_value ?? "").toUpperCase();
  if (r.event_type === "technical_delay_marked") return "technical";
  if (r.event_type === "customer_delay_marked") return "customer";
  if (r.event_type === "order_status_change" && v.startsWith("TECHNICAL_HOLD")) return "technical";
  if (r.event_type === "order_status_change" && v === "CUSTOMER_HOLD") return "customer";
  return null;
}

/** Assignment = custody, never work. These event types can never count as Actions/Worked, whatever their kind. */
export const ASSIGNMENT_EVENT_TYPES = new Set([
  "assignment_change", "legacy_initial_assignment", "auto_assignment", "pool_assignment", "reassignment", "unassignment",
]);
const isAssignmentRow = (r: PerfStreamRow) =>
  r.kind === "assignment" || r.kind === "unassignment" || ASSIGNMENT_EVENT_TYPES.has(r.event_type) || !!r.assignment_type;

const isWork = (r: PerfStreamRow) =>
  !isAssignmentRow(r) && (r.kind === "action" || r.kind === "completion" || r.kind === "closure");

/** Rows that make up a KPI for one employee. Distinct-order KPIs keep the first event per order. */
export function kpiRows(rows: PerfStreamRow[], employeeId: string, kpi: HistoricalKpi): PerfStreamRow[] {
  const mine = rows.filter((r) => r.employee_id === employeeId);
  let picked: PerfStreamRow[];
  switch (kpi) {
    case "assigned":
      picked = mine.filter((r) => r.kind === "assignment");
      break;
    case "reassigned_in":
      picked = mine.filter((r) => r.kind === "assignment" && !!r.old_assignee && r.old_assignee !== r.new_assignee);
      break;
    case "reassigned_out":
      picked = mine.filter((r) => r.kind === "unassignment" && !!r.new_assignee && r.new_assignee !== employeeId);
      break;
    case "worked":
      picked = mine.filter(isWork);
      break;
    case "actions":
      // Every validated human event counts; never collapse by time window.
      return dedupeById(mine.filter(isWork)).sort(byTime);
    case "completed":
      picked = mine.filter((r) => r.kind === "completion");
      break;
    case "closed":
      picked = mine.filter((r) => r.kind === "closure");
      break;
    case "technical_delay_logged":
      return dedupeById(mine.filter((r) => delayKind(r) === "technical")).sort(byTime);
    case "customer_delay_logged":
      return dedupeById(mine.filter((r) => delayKind(r) === "customer")).sort(byTime);
  }
  return firstPerOrder(picked);
}

export interface EmployeeHistoricalKpis {
  assigned: number;
  reassigned_in: number;
  reassigned_out: number;
  worked: number;
  actions: number;
  completed: number;
  closed: number;
  technical_delay_logged: number;
  customer_delay_logged: number;
  last_action_in_range: string | null;
}

export function aggregateEmployee(rows: PerfStreamRow[], employeeId: string): EmployeeHistoricalKpis {
  const out = {} as EmployeeHistoricalKpis;
  for (const k of HISTORICAL_KPIS) out[k] = kpiRows(rows, employeeId, k).length;
  const work = rows.filter((r) => r.employee_id === employeeId && isWork(r));
  const latest = work.reduce<PerfStreamRow | null>((m, r) => (!m || byTime(r, m) > 0 ? r : m), null);
  out.last_action_in_range = latest ? new Date(latest.occurred_at).toISOString() : null;
  return out;
}

/** Total order: time, then stable identity, so output never depends on input row order. */
function byTime(a: PerfStreamRow, b: PerfStreamRow) {
  const ta = Date.parse(a.occurred_at), tb = Date.parse(b.occurred_at);
  if (ta !== tb) return ta < tb ? -1 : 1;
  const ka = `${a.event_id ?? ""}|${a.kind}|${a.application_id}|${a.employee_id ?? ""}`;
  const kb = `${b.event_id ?? ""}|${b.kind}|${b.application_id}|${b.employee_id ?? ""}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function dedupeById(rows: PerfStreamRow[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = r.event_id ?? `${r.kind}:${r.application_id}:${r.occurred_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstPerOrder(rows: PerfStreamRow[]) {
  const m = new Map<string, PerfStreamRow>();
  for (const r of [...rows].sort(byTime)) if (!m.has(r.application_id)) m.set(r.application_id, r);
  return [...m.values()];
}

/** IST business-day boundaries as UTC instants. Pure arithmetic — never browser timezone parsing. */
export function istRangeToUtc(fromDate: string, toDateInclusive: string): { fromIso: string; toIso: string } {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = re.exec(fromDate);
  const b = re.exec(toDateInclusive);
  if (!a || !b) throw new Error("Dates must be YYYY-MM-DD");
  const IST_OFFSET_MS = 330 * 60_000;
  const start = Date.UTC(+a[1], +a[2] - 1, +a[3]) - IST_OFFSET_MS;
  const end = Date.UTC(+b[1], +b[2] - 1, +b[3] + 1) - IST_OFFSET_MS;
  if (end <= start) throw new Error("Invalid date range");
  return { fromIso: new Date(start).toISOString(), toIso: new Date(end).toISOString() };
}

/** Today's IST date as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
