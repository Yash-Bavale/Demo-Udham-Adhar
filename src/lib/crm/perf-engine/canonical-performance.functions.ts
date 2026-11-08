// Canonical Employee Performance — server functions.
// Historical KPIs come from public.get_employee_perf_stream (called as the signed-in
// user, so the database enforces who may see whom). Current-queue KPIs come from
// applications and reuse the Orders page's own classification rules.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  aggregateEmployee,
  istRangeToUtc,
  kpiRows,
  HISTORICAL_KPIS,
  type HistoricalKpi,
  type PerfStreamRow,
} from "./kpis";
import { classifyQueue, type QueueBucket } from "./queue-state";

const rangeSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().uuid().optional(),
});

async function callerIsManager(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => String(r.role)));
  return { isManager: roles.has("admin") || roles.has("super_admin") || roles.has("manager"), isStaff: roles.size > 0 };
}

// The API caps each response at 1000 rows; the stream is stably ordered, so page through it.
async function loadStream(supabase: any, fromIso: string, toIso: string, employeeId: string | null) {
  const PAGE = 1000;
  const all: PerfStreamRow[] = [];
  for (let offset = 0; offset < 200_000; offset += PAGE) {
    const { data, error } = await supabase
      .rpc("get_employee_perf_stream", { p_from: fromIso, p_to: toIso, p_employee: employeeId })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Performance data unavailable: ${error.message}`);
    const rows = (data ?? []) as PerfStreamRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

export interface CurrentQueueKpis {
  current_assigned: number;
  actionable_backlog: number;
  hot: number;
  customer_hold: number;
  technical_hold: number;
  callback_scheduled: number;
  other_open: number;
}

async function loadCurrentQueue(employeeIds: string[]) {
  const result = new Map<string, { kpis: CurrentQueueKpis; orders: Array<{ application_id: string; bucket: QueueBucket }> }>();
  for (const id of employeeIds) {
    result.set(id, {
      kpis: { current_assigned: 0, actionable_backlog: 0, hot: 0, customer_hold: 0, technical_hold: 0, callback_scheduled: 0, other_open: 0 },
      orders: [],
    });
  }
  if (employeeIds.length === 0) return result;
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

  const { data: apps, error } = await admin
    .from("applications")
    .select(
      "id, lead_id, assigned_to, created_at, updated_at, fulfillment_status, application_status, workflow_status, order_status, closure_stage, form_submitted_at, certificate_uploaded_at, refund_approved_at, refund_processed_at, technical_hold_started_at, customer_hold_started_at, form_link_sent_at",
    )
    .in("assigned_to", employeeIds)
    .limit(20000);
  if (error) throw new Error(error.message);
  const list = (apps ?? []) as any[];
  const appIds = list.map((a) => a.id);
  const leadIds = [...new Set(list.map((a) => a.lead_id).filter(Boolean))];

  const chunk = <T,>(arr: T[], n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const leads: any[] = [];
  const schedulers: any[] = [];
  const payments: any[] = [];
  for (const c of chunk(leadIds)) {
    const { data } = await admin.from("leads").select("id, lead_status_v2, status").in("id", c);
    leads.push(...(data ?? []));
  }
  for (const c of chunk(appIds)) {
    const [s, p] = await Promise.all([
      admin.from("order_schedulers").select("id, application_id, status, scheduler_type, fires_at, remarks, created_at").in("application_id", c).eq("status", "active"),
      admin.from("payments").select("application_id, status, payment_date").in("application_id", c),
    ]);
    schedulers.push(...(s.data ?? []));
    payments.push(...(p.data ?? []));
  }
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const cbMap = new Map<string, any>();
  for (const s of [...schedulers].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    if (!cbMap.has(s.application_id)) cbMap.set(s.application_id, s);
  }
  const paidMap = new Map<string, string>();
  for (const p of payments) {
    if (["paid", "success", "successful"].includes(String(p.status)) && p.payment_date) {
      const prev = paidMap.get(p.application_id);
      if (!prev || p.payment_date < prev) paidMap.set(p.application_id, p.payment_date);
    }
  }

  const now = Date.now();
  for (const a of list) {
    const bucket = classifyQueue(a, leadMap.get(a.lead_id), paidMap.get(a.id) ?? null, cbMap.get(a.id) ?? null, now);
    if (bucket === "terminal") continue;
    const entry = result.get(a.assigned_to);
    if (!entry) continue;
    entry.kpis.current_assigned++;
    entry.kpis[bucket]++;
    entry.orders.push({ application_id: a.id, bucket });
  }
  return result;
}

/** Canonical KPIs for every staff member (managers) or for the caller only (staff). */
export const getCanonicalEmployeePerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { isManager, isStaff } = await callerIsManager(context.userId);
    if (!isStaff) throw new Error("Unauthorized");
    const employeeFilter = isManager ? data.employeeId ?? null : context.userId;
    const { fromIso, toIso } = istRangeToUtc(data.fromDate, data.toDate);

    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    let staffIds: string[];
    if (employeeFilter) {
      staffIds = [employeeFilter];
    } else {
      const { data: roles } = await admin.from("user_roles").select("user_id");
      staffIds = [...new Set((roles ?? []).map((r: any) => r.user_id as string))];
    }

    const [stream, queue, lastRes, profilesRes] = await Promise.all([
      loadStream(context.supabase, fromIso, toIso, employeeFilter),
      loadCurrentQueue(staffIds),
      context.supabase.rpc("get_employee_last_human_action", { p_employees: staffIds }),
      admin.from("profiles").select("id, display_name, full_name, email, is_active").in("id", staffIds),
    ]);
    const lastMap = new Map(((lastRes.data ?? []) as any[]).map((r) => [r.employee_id, r]));
    const profMap = new Map(((profilesRes.data ?? []) as any[]).map((p) => [p.id, p]));

    const employees = staffIds.map((id) => {
      const p = profMap.get(id);
      const last = lastMap.get(id);
      return {
        employee_id: id,
        name: p?.display_name || p?.full_name || p?.email || "Unknown",
        is_active: Boolean(p?.is_active),
        historical: aggregateEmployee(stream, id),
        current: queue.get(id)!.kpis,
        last_human_action_at: last?.last_action_at ?? null,
        last_human_action_type: last?.event_type ?? null,
      };
    });

    return {
      range: { fromDate: data.fromDate, toDate: data.toDate, fromIso, toIso, timezone: "Asia/Kolkata" },
      employees,
    };
  });

const drillSchema = rangeSchema.extend({
  employeeId: z.string().uuid(),
  kpi: z.enum([...HISTORICAL_KPIS, "current_assigned", "actionable_backlog", "hot", "customer_hold", "technical_hold", "callback_scheduled", "other_open"] as unknown as [string, ...string[]]),
  limit: z.number().int().min(1).max(1000).default(500),
  offset: z.number().int().min(0).default(0),
});

/** Exact rows behind a KPI — produced by the same source as the count. */
export const getCanonicalKpiDrilldown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => drillSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { isManager, isStaff } = await callerIsManager(context.userId);
    if (!isStaff) throw new Error("Unauthorized");
    if (!isManager && data.employeeId !== context.userId) throw new Error("Unauthorized");

    let rows: any[];
    if ((HISTORICAL_KPIS as string[]).includes(data.kpi)) {
      const { fromIso, toIso } = istRangeToUtc(data.fromDate, data.toDate);
      const stream = await loadStream(context.supabase, fromIso, toIso, data.employeeId);
      rows = kpiRows(stream, data.employeeId, data.kpi as HistoricalKpi);
    } else {
      const q = await loadCurrentQueue([data.employeeId]);
      const orders = q.get(data.employeeId)!.orders;
      rows = data.kpi === "current_assigned" ? orders : orders.filter((o) => o.bucket === data.kpi);
    }

    const total = rows.length;
    const page = rows.slice(data.offset, data.offset + data.limit);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const appIds = [...new Set(page.map((r) => r.application_id))];
    const people = [...new Set(page.flatMap((r) => [r.old_assignee, r.new_assignee, r.initiator]).filter(Boolean))] as string[];
    const [apps, profs] = await Promise.all([
      appIds.length ? admin.from("applications").select("id, application_code").in("id", appIds) : Promise.resolve({ data: [] as any[] }),
      people.length ? admin.from("profiles").select("id, display_name, full_name").in("id", people) : Promise.resolve({ data: [] as any[] }),
    ]);
    const codeMap = new Map(((apps.data ?? []) as any[]).map((a) => [a.id, a.application_code]));
    const nameMap = new Map(((profs.data ?? []) as any[]).map((p) => [p.id, p.display_name || p.full_name]));
    const nm = (id: string | null | undefined) => (id ? nameMap.get(id) ?? null : null);

    return {
      kpi: data.kpi,
      total,
      rows: page.map((r) => ({
        ...r,
        application_code: codeMap.get(r.application_id) ?? null,
        old_assignee_name: nm(r.old_assignee),
        new_assignee_name: nm(r.new_assignee),
        initiator_name: nm(r.initiator),
      })),
    };
  });
