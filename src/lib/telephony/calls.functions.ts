import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CALL_OUTCOMES, wrapUpInput } from "./wrapup";

export type CallView = {
  id: string; callId: string; direction: string; status: string;
  callerNumber: string | null; employeeId: string | null; employeeName: string | null;
  customerId: string | null; leadId: string | null; applicationId: string | null;
  contactName: string | null; orderCode: string | null; serviceName: string | null;
  startedAt: string; answeredAt: string | null; endedAt: string | null;
  durationSeconds: number | null; disposition: string | null;
};

async function enrich(db: any, rows: any[]): Promise<CallView[]> {
  if (!rows.length) return [];
  const ids = (k: string) => Array.from(new Set(rows.map((r) => r[k]).filter(Boolean)));
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [emp, cust, lead, app] = await Promise.all([
    db.from("profiles").select("id, full_name, display_name, email").in("id", ids("employee_id").length ? ids("employee_id") : none),
    db.from("customers").select("id, name").in("id", ids("customer_id").length ? ids("customer_id") : none),
    db.from("leads").select("id, name, lead_code").in("id", ids("lead_id").length ? ids("lead_id") : none),
    db.from("applications").select("id, application_code, service_id").in("id", ids("application_id").length ? ids("application_id") : none),
  ]);
  const svcIds = Array.from(new Set((app.data ?? []).map((a: any) => a.service_id).filter(Boolean)));
  const svc = await db.from("services").select("id, name").in("id", svcIds.length ? svcIds : none);
  const m = (r: any) => new Map((r.data ?? []).map((x: any) => [x.id, x]));
  const E = m(emp), C = m(cust), L = m(lead), A = m(app), S = m(svc);
  return rows.map((r) => {
    const e: any = E.get(r.employee_id); const a: any = A.get(r.application_id);
    return {
      id: r.id, callId: r.call_id, direction: r.direction, status: r.status,
      callerNumber: r.caller_number, employeeId: r.employee_id,
      employeeName: e ? e.full_name || e.display_name || e.email?.split("@")[0] : null,
      customerId: r.customer_id, leadId: r.lead_id, applicationId: r.application_id,
      contactName: (C.get(r.customer_id) as any)?.name ?? (L.get(r.lead_id) as any)?.name ?? null,
      orderCode: a?.application_code ?? null, serviceName: (S.get(a?.service_id) as any)?.name ?? null,
      startedAt: r.started_at, answeredAt: r.answered_at, endedAt: r.ended_at,
      durationSeconds: r.duration_seconds, disposition: r.disposition,
    };
  });
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

const STALE_OUTBOUND_MS = 2 * 60_000;

/** Fallback for missing CallerDesk events: outbound calls stuck ringing >2 min become 'no_response'.
 *  Guarded by status/answered_at/ended_at filters so it is idempotent and never overrides real events.
 *  'no_response' is unranked in the webhook, so a late real answered/hangup event still applies. */
async function expireStaleOutbound() {
  try {
    await (await admin()).from("telephony_calls")
      .update({ status: "no_response", last_event: "timeout", updated_at: new Date().toISOString() })
      .eq("direction", "outbound").eq("status", "ringing")
      .is("answered_at", null).is("ended_at", null)
      .lt("started_at", new Date(Date.now() - STALE_OUTBOUND_MS).toISOString());
  } catch (e) { console.error("expireStaleOutbound failed", e); }
}

function isStaleOutbound(v: CallView) {
  return v.direction === "outbound" && v.status === "ringing" && !v.answeredAt && !v.endedAt
    && Date.now() - new Date(v.startedAt).getTime() > STALE_OUTBOUND_MS;
}

/** Current employee: live call (ringing/answered) + most recent ended call still needing a disposition. */
export const getMyCallState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await expireStaleOutbound();
    const { data: rows } = await (context.supabase as any).from("telephony_calls").select("*")
      .eq("employee_id", context.userId).gte("started_at", new Date(Date.now() - 12 * 3600_000).toISOString())
      .order("started_at", { ascending: false }).limit(5);
    const views = await enrich(await admin(), rows ?? []);
    return {
      active: views.find((v) => (v.status === "ringing" || v.status === "answered") && !isStaleOutbound(v)) ?? null,
      pendingDisposition: views.find((v) => (v.status === "ended" || (v.status === "missed" && v.direction === "outbound")) && !v.disposition) ?? null,
    };
  });

export const DISPOSITIONS = CALL_OUTCOMES;

/** Saves the post-call wrap-up on the employee's own call (RLS read check), and creates a CRM follow-up when requested. */
export const saveCallDisposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => wrapUpInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: own } = await (context.supabase as any).from("telephony_calls")
      .select("id, employee_id, customer_id, lead_id, application_id, follow_up_id").eq("id", data.id).maybeSingle();
    if (!own) throw new Error("Call not found");
    const db = await admin();
    const applicationId = data.applicationId ?? own.application_id ?? null;
    let leadId = own.lead_id ?? null, customerId = own.customer_id ?? null;
    if (applicationId && (!leadId || !customerId)) {
      const { data: app } = await db.from("applications").select("lead_id, customer_id").eq("id", applicationId).maybeSingle();
      leadId ??= app?.lead_id ?? null; customerId ??= app?.customer_id ?? null;
    }
    let followUpId: string | null = own.follow_up_id ?? null;
    if (data.followUpAt && !followUpId && (leadId || customerId || applicationId)) {
      const { data: fu, error: fuErr } = await db.from("follow_ups").insert({
        lead_id: leadId, customer_id: customerId, application_id: applicationId,
        scheduled_at: new Date(data.followUpAt).toISOString(), reason: "call_back",
        reason_note: (data.nextAction || data.notes || data.disposition).slice(0, 500),
        assigned_to: own.employee_id ?? context.userId, created_by: context.userId,
      }).select("id").single();
      if (fuErr) throw new Error("Could not create the follow-up: " + fuErr.message);
      followUpId = fu.id;
      if (leadId) await db.from("leads").update({ next_followup_at: new Date(data.followUpAt).toISOString(), followup_note: data.nextAction || data.disposition }).eq("id", leadId);
    }
    const { error } = await db.from("telephony_calls").update({
      disposition: data.disposition, disposition_notes: data.notes || null,
      disposition_by: context.userId, disposition_at: new Date().toISOString(),
      next_action: data.nextAction || null, follow_up_at: data.followUpAt ?? null, follow_up_id: followUpId,
      application_id: applicationId, lead_id: leadId, customer_id: customerId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, followUpCreated: !!followUpId && !own.follow_up_id };
  });

/** Admin / Super Admin: all live calls (RLS limits non-admins to their own). */
export const listLiveCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const [{ data: a }, { data: s }] = await Promise.all([
      sb.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      sb.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    ]);
    if (!a && !s) throw new Error("Unauthorized");
    await expireStaleOutbound();
    const { data: rows } = await sb.from("telephony_calls").select("*")
      .in("status", ["ringing", "answered"]).gte("started_at", new Date(Date.now() - 6 * 3600_000).toISOString())
      .order("started_at", { ascending: false }).limit(100);
    return (await enrich(await admin(), rows ?? [])).filter((v) => !isStaleOutbound(v));
  });

export type CallHistoryRow = CallView & {
  provider: string; calledNumber: string | null; recordingUrl: string | null; hangupCause: string | null;
  notes: string | null; nextAction: string | null; followUpAt: string | null;
};

export const CALL_HISTORY_PAGE_SIZE = 25;
const IST_OFFSET_MS = 330 * 60_000;

/** IST calendar day "YYYY-MM-DD" → UTC ISO range [from 00:00 IST, to+1 00:00 IST). */
export function istDayRange(from: string, to: string): { fromIso: string; toIso: string } {
  const start = Date.parse(`${from}T00:00:00Z`) - IST_OFFSET_MS;
  const end = Date.parse(`${to}T00:00:00Z`) - IST_OFFSET_MS + 24 * 3600_000;
  return { fromIso: new Date(start).toISOString(), toIso: new Date(end).toISOString() };
}

export const callHistoryInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["all", "inbound", "outbound"]).default("all"),
  status: z.enum(["all", "answered", "ended", "missed", "no_response", "ringing"]).default("all"),
  page: z.number().int().min(0).max(10_000).default(0),
  number: z.string().max(20).optional(),
  employeeId: z.string().uuid().nullable().optional(),
  disposition: z.string().max(60).optional(),
}).refine((v) => v.from <= v.to, { message: "Start date must be on or before end date" })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 92, { message: "Date range can be at most 92 days" });

/** Admin / Super Admin only. Read-only; any status or provider, newest first, paginated. */
export async function queryCallHistory(sb: any, adminDb: any, userId: string, data: z.infer<typeof callHistoryInput>) {
  const [{ data: a }, { data: s }] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (!a && !s) throw new Error("Unauthorized");
  const { fromIso, toIso } = istDayRange(data.from, data.to);
  const offset = data.page * CALL_HISTORY_PAGE_SIZE;
  let q = sb.from("telephony_calls").select("*", { count: "exact" }).gte("started_at", fromIso).lt("started_at", toIso);
  if (data.direction !== "all") q = q.eq("direction", data.direction);
  if (data.status !== "all") q = q.eq("status", data.status);
  const digits = (data.number ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length >= 4) q = q.or(`caller_number.like.%${digits}%,called_number.like.%${digits}%`);
  if (data.employeeId) q = q.eq("employee_id", data.employeeId);
  if (data.disposition === "none") q = q.is("disposition", null);
  else if (data.disposition) q = q.eq("disposition", data.disposition);
  const { data: rows, count, error } = await q.order("started_at", { ascending: false }).range(offset, offset + CALL_HISTORY_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const views = await enrich(adminDb, rows ?? []);
  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]));
  const items: CallHistoryRow[] = views.map((v) => {
    const r: any = byId.get(v.id);
    return { ...v, provider: r.provider, calledNumber: r.called_number ?? null,
      recordingUrl: typeof r.recording_url === "string" && /^https?:\/\//.test(r.recording_url) ? r.recording_url : null,
      hangupCause: r.hangup_cause ?? null, notes: r.disposition_notes ?? null,
      nextAction: r.next_action ?? null, followUpAt: r.follow_up_at ?? null };
  });
  // Employee filter options; best effort so a failure never hides the call list.
  let employees: { id: string; name: string }[] = [];
  try {
    const { data: staff } = await adminDb.from("telephony_calls").select("employee_id").not("employee_id", "is", null)
      .gte("started_at", fromIso).lt("started_at", toIso).limit(1000);
    const empIds = Array.from(new Set((staff ?? []).map((r: any) => r.employee_id)));
    const { data: emps } = empIds.length ? await adminDb.from("profiles").select("id, full_name, display_name, email").in("id", empIds) : { data: [] };
    employees = (emps ?? []).map((e: any) => ({ id: e.id, name: e.full_name || e.display_name || e.email?.split("@")[0] || "Employee" }));
  } catch { employees = []; }
  return { items, total: count ?? 0, page: data.page, pageSize: CALL_HISTORY_PAGE_SIZE, employees, outcomes: CALL_OUTCOMES };
}

export const listCallHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => callHistoryInput.parse(i))
  .handler(async ({ data, context }) => queryCallHistory(context.supabase, await admin(), context.userId, data));
