/** Provider-neutral telephony helpers (server-only): number normalisation and CRM record matching. */

const CLOSED_ORDER = ["COMPLETED", "CLOSED", "CERTIFICATE_ISSUED", "REFUND_APPROVED", "REFUND_PROCESSED"];

export type MatchResult = {
  customerId: string | null;
  leadId: string | null;
  applicationId: string | null;
  employeeId: string | null;
};

export function normalizeIndianMobile(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  const ten = d.length > 10 ? d.slice(-10) : d;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  if (d.length > 10 && !/^(0|91|091|0091)$/.test(d.slice(0, -10))) return null;
  return ten;
}

export function maskNumber(m: string | null): string {
  return m ? `******${m.slice(-4)}` : "unknown";
}

/** Matches a customer mobile to existing leads/customers/open orders (read-only, never reassigns). */
export async function dbLookup(m: string): Promise<MatchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const variants = [m, `+91${m}`, `91${m}`, `0${m}`, `+91 ${m}`];
  const [leadsRes, custRes] = await Promise.all([
    supabaseAdmin.from("leads").select("id, customer_id, assigned_to")
      .in("mobile", variants).order("created_at", { ascending: false }).limit(10),
    supabaseAdmin.from("customers").select("id").in("primary_mobile", variants).eq("is_deleted", false).limit(1),
  ]);
  if (leadsRes.error) throw leadsRes.error;
  if (custRes.error) throw custRes.error;
  const leads = leadsRes.data ?? [];
  const customerId = custRes.data?.[0]?.id ?? leads.find((l) => l.customer_id)?.customer_id ?? null;
  const leadIds = leads.map((l) => l.id);

  let app: { id: string; lead_id: string | null; assigned_to: string | null } | null = null;
  if (leadIds.length || customerId) {
    const ors = [
      leadIds.length ? `lead_id.in.(${leadIds.join(",")})` : null,
      customerId ? `customer_id.eq.${customerId}` : null,
    ].filter(Boolean).join(",");
    const { data, error } = await supabaseAdmin.from("applications").select("id, lead_id, assigned_to")
      .or(ors).not("order_status", "in", `(${CLOSED_ORDER.join(",")})`)
      .order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    app = data?.[0] ?? null;
  }
  const lead = (app && leads.find((l) => l.id === app!.lead_id)) || leads[0] || null;
  return {
    customerId, leadId: lead?.id ?? null, applicationId: app?.id ?? null,
    employeeId: app?.assigned_to ?? lead?.assigned_to ?? null,
  };
}

/* ---------------- Incoming caller identification ---------------- */

export type CallerOrder = { id: string; code: string | null; service: string | null; status: string; assignee: string | null; active: boolean; createdAt: string };
export type CallerLookup = {
  number: string | null;
  kind: "invalid" | "unknown" | "lead" | "orders";
  customerName: string | null;
  lead: { id: string; code: string | null; name: string; service: string | null; status: string; assignee: string | null } | null;
  orders: CallerOrder[];
};

export const isClosedOrder = (s: string) => CLOSED_ORDER.includes(String(s).toUpperCase());

/** Dedupe by id, active orders first (newest first within each group). Never picks a "winner". */
export function rankCallerOrders(rows: CallerOrder[]): CallerOrder[] {
  const seen = new Map<string, CallerOrder>();
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()].sort((a, b) => (a.active === b.active ? b.createdAt.localeCompare(a.createdAt) : a.active ? -1 : 1));
}

/** Bounded, read-only lookup returning only fields the incoming-call screen shows. */
export async function lookupCaller(raw: unknown): Promise<CallerLookup> {
  const m = normalizeIndianMobile(raw);
  const empty = { customerName: null, lead: null, orders: [] as CallerOrder[] };
  if (!m) return { number: null, kind: "invalid", ...empty };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const variants = [m, `+91${m}`, `91${m}`, `0${m}`, `+91 ${m}`];
  const [lr, cr] = await Promise.all([
    db.from("leads").select("id, lead_code, name, status, service_id, assigned_to, customer_id, created_at")
      .in("mobile", variants).or("is_deleted.is.null,is_deleted.eq.false").order("created_at", { ascending: false }).limit(10),
    db.from("customers").select("id, name").in("primary_mobile", variants).or("is_deleted.is.null,is_deleted.eq.false").limit(5),
  ]);
  if (lr.error) throw lr.error;
  if (cr.error) throw cr.error;
  const leads: any[] = lr.data ?? [];
  const custs: any[] = cr.data ?? [];
  const custIds = [...new Set([...custs.map((c) => c.id), ...leads.map((l) => l.customer_id).filter(Boolean)])];
  const leadIds = leads.map((l) => l.id);
  let apps: any[] = [];
  if (leadIds.length || custIds.length) {
    const ors = [leadIds.length ? `lead_id.in.(${leadIds.join(",")})` : null, custIds.length ? `customer_id.in.(${custIds.join(",")})` : null].filter(Boolean).join(",");
    const ar = await db.from("applications").select("id, application_code, order_status, service_id, assigned_to, created_at")
      .or(ors).or("is_deleted.is.null,is_deleted.eq.false").order("created_at", { ascending: false }).limit(20);
    if (ar.error) throw ar.error;
    apps = ar.data ?? [];
  }
  const svcIds = [...new Set([...apps, ...leads].map((r) => r.service_id).filter(Boolean))];
  const userIds = [...new Set([...apps, ...leads].map((r) => r.assigned_to).filter(Boolean))];
  const [sr, pr] = await Promise.all([
    svcIds.length ? db.from("services").select("id, service_name").in("id", svcIds) : { data: [] },
    userIds.length ? db.from("profiles").select("id, full_name, display_name").in("id", userIds) : { data: [] },
  ]);
  const svc = new Map<string, string>((sr.data ?? []).map((s: any) => [s.id, s.service_name]));
  const ppl = new Map<string, string>((pr.data ?? []).map((p: any) => [p.id, p.full_name || p.display_name || "Employee"]));
  const orders = rankCallerOrders(apps.map((a) => ({
    id: a.id, code: a.application_code, service: svc.get(a.service_id) ?? null, status: String(a.order_status),
    assignee: ppl.get(a.assigned_to) ?? null, active: !isClosedOrder(a.order_status), createdAt: a.created_at,
  })));
  const l = leads[0];
  const lead = l ? { id: l.id, code: l.lead_code, name: l.name, service: svc.get(l.service_id) ?? null, status: String(l.status), assignee: ppl.get(l.assigned_to) ?? null } : null;
  const customerName = custs[0]?.name ?? l?.name ?? null;
  return { number: m, kind: orders.length ? "orders" : lead ? "lead" : custs.length ? "lead" : "unknown", customerName, lead, orders };
}
