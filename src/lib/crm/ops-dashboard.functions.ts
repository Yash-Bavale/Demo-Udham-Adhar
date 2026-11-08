import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Metric = { label: string; value: number };
type RevenuePoint = { date: string; total: number };
type StaffRow = { user_id: string; name: string; handled: number; completed: number; pending: number };

export type OpsDashboardData = {
  kpis: {
    allLeads: { today: number; week: number; month: number; total: number };
    notConvertedLeads: { today: number; week: number; month: number; total: number };
    newOrders: { today: number; week: number; month: number; total: number };
    pendingOrders: { count: number; byReason: Metric[] };
    complaintsOpen: { count: number; byCategory: Metric[] };
    complaintsResolved: { today: number; week: number; month: number; total: number; byCategory: Metric[] };
    ordersCompleted: { today: number; week: number; month: number; total: number; byService: Metric[] };
    totalSale: { today: number; week: number; month: number; total: number; byService: Metric[] };
  };
  actionRequired: {
    refundDecisionPending: number;
    docsPendingOver2d: number;
    tasksOverdue: number;
    followupsTodayOpen: number;
  };
  refundTracker: { requested: number; approved: number; refunded: number };
  servicePipeline: { stage: string; count: number; key: string }[];
  documentsPending: {
    id: string;
    application_code: string | null;
    customer_name: string | null;
    service: string | null;
    missing_docs: string[];
  }[];
  complaintTracker: {
    counts: { submitted: number; under_review: number; awaiting_response: number; resolved: number };
    rows: { id: string; complaint_number: string | null; customer: string | null; service: string | null; days_open: number }[];
  };
  paymentSummary: {
    todayCollection: number;
    pendingPayments: number;
    refundRequests: number;
    chargebacks: number;
  };
  revenue: { weekly: RevenuePoint[]; monthly: RevenuePoint[] };
  topServices: Metric[];
  staffPerformance: StaffRow[];
  followUps: { id: string; time: string; customer: string; reason: string; assignedTo: string | null; customerId: string | null }[];
  supportTickets: { open: number; in_progress: number; resolved: number; closed: number };
  recentActivity: { id: string; created_at: string; event_type: string; new_value: string | null; old_value: string | null; staff_name: string | null; application_id: string | null }[];
  viewer: { isPrivileged: boolean; canViewFinance: boolean };
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgo(n: number) {
  const x = startOfDay();
  x.setDate(x.getDate() - n);
  return x;
}

// Paginate beyond PostgREST's 1000-row cap.
async function fetchAll<T = any>(builder: any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // hard cap to avoid runaway loops
  for (let i = 0; i < 200; i++) {
    const { data, error } = await builder.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export const getOpsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpsDashboardData> => {
    const { supabase, userId } = context;
    const today = startOfDay().toISOString();
    const week = daysAgo(7).toISOString();
    const month = daysAgo(30).toISOString();

    // Role scoping: admins / super_admins / managers see everything;
    // anyone else only sees rows assigned to them and has revenue hidden.
    const { data: rolesRows } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = new Set<string>(((rolesRows ?? []) as any[]).map((r) => String(r.role)));
    const isPrivileged =
      roles.has("admin") || roles.has("super_admin") || roles.has("manager");
    const canViewFinance = isPrivileged || roles.has("finance") || roles.has("accounts");

    const makeLeadsQ = () => {
      const q = supabase.from("leads").select("id, status, created_at, service, name, mobile, email, customer_id, assigned_to").order("created_at", { ascending: false });
      if (!isPrivileged) (q as any).eq("assigned_to", userId);
      return q;
    };
    const makeAppsQ = () => {
      const q = supabase.from("applications").select("id, application_code, application_status, fulfillment_status, document_status, form_status, service_id, lead_id, customer_id, assigned_to, created_at, updated_at").order("created_at", { ascending: false });
      if (!isPrivileged) (q as any).eq("assigned_to", userId);
      return q;
    };
    const followupsQ = supabase.from("follow_ups").select("id, customer_id, lead_id, application_id, scheduled_at, reason, assigned_to, is_completed").eq("is_completed", false).gte("scheduled_at", startOfDay().toISOString()).lt("scheduled_at", daysAgo(-1).toISOString()).order("scheduled_at", { ascending: true }).limit(50);
    const tasksQ = supabase.from("tasks").select("id, due_date, is_completed, assigned_to").eq("is_completed", false).lt("due_date", new Date().toISOString()).limit(500);

    if (!isPrivileged) {
      (followupsQ as any).eq("assigned_to", userId);
      (tasksQ as any).eq("assigned_to", userId);
    }

    const [
      leads,
      apps,
      complaints,
      payments,
      docs,
      activity,
      servicesRes,
      profilesRes,
      followupsRes,
      tasksRes,
      customersLookup,
      gatewaysRes,
    ] = await Promise.all([
      fetchAll<any>(makeLeadsQ()),
      fetchAll<any>(makeAppsQ()),
      fetchAll<any>(supabase.from("complaints").select("id, complaint_number, status, category, customer_id, lead_id, created_at, resolved_at, last_reminded_at, sla_due_at, updated_at").order("created_at", { ascending: false })),
      fetchAll<any>(supabase.from("payments").select("id, amount, status, gateway_name, payment_date, created_at, refund_reason, application_id, lead_id, parent_payment_id").order("created_at", { ascending: false })),
      fetchAll<any>(supabase.from("documents").select("id, application_id, lead_id, doc_type, status, created_at").order("created_at", { ascending: false })),
      supabase.from("application_events").select("id, event_type, old_value, new_value, staff_name, created_at, application_id").order("created_at", { ascending: false }).limit(20),
      supabase.from("services").select("id, service_name, service_code, is_active"),
      supabase.from("profiles").select("id, full_name, display_name, email"),
      followupsQ,
      tasksQ,
      fetchAll<any>(supabase.from("customers").select("id, name")),
      supabase.from("payment_gateways").select("name, mode"),
    ]);




    const activityRows = (activity as any).data ?? [];
    const services = servicesRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const followups = followupsRes.data ?? [];
    const overdueTasks = tasksRes.data ?? [];
    const customerNameById = new Map<string, string>((customersLookup as any[]).map((c) => [c.id, c.name]));

    const serviceById = new Map(services.map((s: any) => [s.id, s.service_name as string]));
    const profileById = new Map(profiles.map((p: any) => [p.id, (p.full_name as string) || (p.display_name as string) || (p.email as string) || "Unknown Employee"]));
    const leadById = new Map(leads.map((l: any) => [l.id, l]));


    const inWindow = (createdAt: string, sinceISO: string) => createdAt >= sinceISO;

    // KPI: leads
    const allLeads = {
      total: leads.length,
      today: leads.filter((l: any) => inWindow(l.created_at, today)).length,
      week: leads.filter((l: any) => inWindow(l.created_at, week)).length,
      month: leads.filter((l: any) => inWindow(l.created_at, month)).length,
    };
    const isConverted = (s: string) => ["payment_successful", "payment_received", "under_process", "completed"].includes(s);
    const notConverted = leads.filter((l: any) => !isConverted(l.status));
    const notConvertedLeads = {
      total: notConverted.length,
      today: notConverted.filter((l: any) => inWindow(l.created_at, today)).length,
      week: notConverted.filter((l: any) => inWindow(l.created_at, week)).length,
      month: notConverted.filter((l: any) => inWindow(l.created_at, month)).length,
    };

    // KPI: orders (applications)
    const newOrders = {
      total: apps.length,
      today: apps.filter((a: any) => inWindow(a.created_at, today)).length,
      week: apps.filter((a: any) => inWindow(a.created_at, week)).length,
      month: apps.filter((a: any) => inWindow(a.created_at, month)).length,
    };

    const pendingApps = apps.filter((a: any) => a.application_status !== "completed");
    const pendingByReason = new Map<string, number>();
    pendingApps.forEach((a: any) => {
      const k = String(a.application_status || "unknown");
      pendingByReason.set(k, (pendingByReason.get(k) ?? 0) + 1);
    });
    const pendingOrders = {
      count: pendingApps.length,
      byReason: Array.from(pendingByReason.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    };

    // KPI: complaints
    const openComplaints = complaints.filter((c: any) => !["resolved", "closed"].includes(c.status));
    const resolvedComplaints = complaints.filter((c: any) => c.status === "resolved" || !!c.resolved_at);
    const compByCat = (rows: any[]) => {
      const m = new Map<string, number>();
      rows.forEach((c) => { const k = c.category || "uncategorised"; m.set(k, (m.get(k) ?? 0) + 1); });
      return Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const complaintsOpen = { count: openComplaints.length, byCategory: compByCat(openComplaints) };
    const complaintsResolved = {
      total: resolvedComplaints.length,
      today: resolvedComplaints.filter((c: any) => (c.resolved_at ?? c.updated_at ?? c.created_at) >= today).length,
      week: resolvedComplaints.filter((c: any) => (c.resolved_at ?? c.updated_at ?? c.created_at) >= week).length,
      month: resolvedComplaints.filter((c: any) => (c.resolved_at ?? c.updated_at ?? c.created_at) >= month).length,
      byCategory: compByCat(resolvedComplaints),
    };

    // KPI: orders completed
    const completedApps = apps.filter((a: any) => a.application_status === "completed");
    const compByService = (rows: any[]) => {
      const m = new Map<string, number>();
      rows.forEach((a) => { const name = serviceById.get(a.service_id) || "—"; m.set(name, (m.get(name) ?? 0) + 1); });
      return Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const ordersCompleted = {
      total: completedApps.length,
      today: completedApps.filter((a: any) => (a.updated_at || a.created_at) >= today).length,
      week: completedApps.filter((a: any) => (a.updated_at || a.created_at) >= week).length,
      month: completedApps.filter((a: any) => (a.updated_at || a.created_at) >= month).length,
      byService: compByService(completedApps),
    };

    // KPI: total sale — exclude test/sandbox gateways
    const testGatewayNames = new Set<string>(
      ((gatewaysRes.data ?? []) as any[])
        .filter((g) => String(g.mode ?? "").toLowerCase() === "test")
        .map((g) => String(g.name).toLowerCase())
    );
    const isLivePayment = (p: any) => {
      const gw = String(p.gateway_name ?? "").toLowerCase();
      if (!gw) return true;
      if (testGatewayNames.has(gw)) return false;
      // Common naming patterns for test-mode rows
      return !gw.includes("test") && !gw.includes("sandbox");
    };
    const successPayments = payments.filter((p: any) =>
      ["success", "captured", "paid", "settled"].includes(String(p.status)) && isLivePayment(p)
    );
    const sumAmt = (rows: any[]) => rows.reduce((s, p) => s + Number(p.amount || 0), 0);
    const saleByService = new Map<string, number>();
    // payments don't include service; map via lead/application
    const appById = new Map(apps.map((a: any) => [a.id, a]));
    successPayments.forEach((p: any) => {
      const app = p.application_id ? appById.get(p.application_id) : null;
      const serviceName = app ? serviceById.get(app.service_id) || "—" : (leadById.get(p.lead_id)?.service || "—");
      saleByService.set(serviceName, (saleByService.get(serviceName) ?? 0) + Number(p.amount || 0));
    });
    const totalSaleRaw = {
      total: sumAmt(successPayments),
      today: sumAmt(successPayments.filter((p: any) => (p.payment_date ?? p.created_at) >= today)),
      week: sumAmt(successPayments.filter((p: any) => (p.payment_date ?? p.created_at) >= week)),
      month: sumAmt(successPayments.filter((p: any) => (p.payment_date ?? p.created_at) >= month)),
      byService: Array.from(saleByService.entries()).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value),
    };
    const totalSale = canViewFinance
      ? totalSaleRaw
      : { total: 0, today: 0, week: 0, month: 0, byService: [] as Metric[] };


    // Action required (per Phase 6 spec)
    const refundDecisionPending = leads.filter((l: any) => l.status === "refund_requested").length;
    const twoDaysAgoISO = daysAgo(2).toISOString();
    const docsPendingOver2d = apps.filter((a: any) =>
      a.fulfillment_status === "order_received" &&
      a.created_at <= twoDaysAgoISO,
    ).length;
    const tasksOverdue = overdueTasks.length;
    const followupsTodayOpen = followups.length;

    // Service pipeline — by fulfillment_status (canonical 6 stages)
    const pipelineStages: Array<[string, string]> = [
      ["Incomplete Form", "order_received"],
      ["Documents Received", "documents_received"],
      ["Verification Pending", "verification_pending"],
      ["Application Submitted", "application_submitted"],
      ["Under Processing", "under_processing"],
      ["Completed", "completed"],
    ];
    const servicePipeline = pipelineStages.map(([stage, fs]) => ({
      stage,
      key: fs,
      count: apps.filter((a: any) => a.fulfillment_status === fs).length,
    }));

    // Refund tracker — last 30 days
    const refundTracker = {
      requested: leads.filter((l: any) => l.status === "refund_requested" && l.created_at >= month).length,
      approved: apps.filter((a: any) => a.application_status === "refund_pending" && (a.updated_at ?? a.created_at) >= month).length,
      refunded: apps.filter((a: any) => a.application_status === "refunded" && (a.updated_at ?? a.created_at) >= month).length,
    };

    // Documents pending list (latest 8)
    const pendingDocApps = apps
      .filter((a: any) => a.document_status && a.document_status !== "approved" && a.application_status !== "completed")
      .slice(0, 8);
    const documentsPending = pendingDocApps.map((a: any) => {
      const lead = leadById.get(a.lead_id);
      const have = new Set(docs.filter((d: any) => d.application_id === a.id && d.status !== "rejected").map((d: any) => d.doc_type));
      const required = ["Aadhaar", "PAN", "GST Certificate", "Bank Passbook", "Photo"];
      const missing = required.filter((r) => !have.has(r) && !have.has(r.toLowerCase()));
      return {
        id: a.id,
        application_code: a.application_code,
        customer_name: lead?.name ?? null,
        service: serviceById.get(a.service_id) ?? lead?.service ?? null,
        missing_docs: missing,
      };
    });

    // Complaint tracker
    const complaintTracker = {
      counts: {
        submitted: complaints.filter((c: any) => c.status === "submitted").length,
        under_review: complaints.filter((c: any) => c.status === "under_review").length,
        awaiting_response: complaints.filter((c: any) => c.status === "awaiting_response").length,
        resolved: complaints.filter((c: any) => c.status === "resolved").length,
      },
      rows: openComplaints.slice(0, 8).map((c: any) => {
        const lead = leadById.get(c.lead_id);
        return {
          id: c.id,
          complaint_number: c.complaint_number,
          customer: lead?.name ?? null,
          service: lead?.service ?? null,
          days_open: Math.max(0, Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86_400_000)),
        };
      }),
    };

    // Payment summary — hidden from non-finance staff
    const paymentSummaryRaw = {
      todayCollection: sumAmt(successPayments.filter((p: any) => (p.payment_date ?? p.created_at) >= today)),
      pendingPayments: sumAmt(payments.filter((p: any) => ["pending", "initiated", "created"].includes(String(p.status)))),
      refundRequests: payments.filter((p: any) => ["refund_requested", "refund_pending"].includes(String(p.status))).length,
      chargebacks: payments.filter((p: any) => ["chargeback", "disputed"].includes(String(p.status))).length,
    };
    const paymentSummary = canViewFinance
      ? paymentSummaryRaw
      : { todayCollection: 0, pendingPayments: 0, refundRequests: 0, chargebacks: 0 };


    // Revenue — weekly (7 days) and monthly (30 days)
    function bucket(daysWindow: number) {
      const out: RevenuePoint[] = [];
      for (let i = daysWindow - 1; i >= 0; i--) {
        const d = daysAgo(i);
        const next = daysAgo(i - 1);
        const total = sumAmt(
          successPayments.filter((p: any) => {
            const t = new Date(p.payment_date ?? p.created_at).getTime();
            return t >= d.getTime() && t < next.getTime();
          }),
        );
        out.push({ date: d.toISOString().slice(0, 10), total: Math.round(total) });
      }
      return out;
    }
    const revenue = canViewFinance
      ? { weekly: bucket(7), monthly: bucket(30) }
      : { weekly: [] as RevenuePoint[], monthly: [] as RevenuePoint[] };


    // Top services
    const topServicesMap = new Map<string, number>();
    apps.forEach((a: any) => {
      const name = serviceById.get(a.service_id) || "—";
      topServicesMap.set(name, (topServicesMap.get(name) ?? 0) + 1);
    });
    const topServices = Array.from(topServicesMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Staff performance — by application.assigned_to
    const staffMap = new Map<string, { handled: number; completed: number; pending: number }>();
    apps.forEach((a: any) => {
      if (!a.assigned_to) return;
      const row = staffMap.get(a.assigned_to) ?? { handled: 0, completed: 0, pending: 0 };
      row.handled += 1;
      if (a.application_status === "completed") row.completed += 1;
      else row.pending += 1;
      staffMap.set(a.assigned_to, row);
    });
    const staffPerformance: StaffRow[] = Array.from(staffMap.entries()).map(([user_id, v]) => ({
      user_id,
      name: profileById.get(user_id) || "Unknown Employee",
      ...v,
    })).sort((a, b) => b.handled - a.handled).slice(0, 8);

    // Recent activity — from application_events
    const recentActivity = (activityRows as any[]).map((a: any) => ({
      id: a.id,
      created_at: a.created_at,
      event_type: a.event_type,
      new_value: a.new_value ?? null,
      old_value: a.old_value ?? null,
      staff_name: a.staff_name ?? null,
      application_id: a.application_id ?? null,
    }));

    // Today's follow-ups (open)
    const followUpsOut = followups.map((f: any) => {
      const lead = leadById.get(f.lead_id);
      const customerName =
        (f.customer_id && customerNameById.get(f.customer_id)) ||
        lead?.name ||
        "—";
      const t = new Date(f.scheduled_at);
      return {
        id: f.id,
        time: t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }),
        customer: customerName,
        reason: f.reason ?? "Follow-up",
        assignedTo: f.assigned_to ? (profileById.get(f.assigned_to) ?? null) : null,
        customerId: f.customer_id ?? null,
      };
    });

    return {
      kpis: {
        allLeads,
        notConvertedLeads,
        newOrders,
        pendingOrders,
        complaintsOpen,
        complaintsResolved,
        ordersCompleted,
        totalSale,
      },
      actionRequired: { refundDecisionPending, docsPendingOver2d, tasksOverdue, followupsTodayOpen },
      refundTracker,
      servicePipeline,
      documentsPending,
      complaintTracker,
      paymentSummary,
      revenue,
      topServices,
      staffPerformance,
      followUps: followUpsOut,
      supportTickets: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
      recentActivity,
      viewer: { isPrivileged, canViewFinance },
    };
  });


export const markFollowUpComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.from("follow_ups") as any)
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
