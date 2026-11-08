import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUserAdmin } from "@/lib/audit";

export type WorkApplication = {
  id: string;
  application_code: string | null;
  application_status: string;
  fulfillment_status: string | null;
  form_status: string;
  document_status: string;
  created_at: string;
  updated_at: string;
  lead: { id: string; name: string; email: string; mobile: string; service: string } | null;
};


export type WorkLead = {
  id: string;
  lead_code: string | null;
  name: string;
  email: string;
  mobile: string;
  service: string;
  status: string;
  created_at: string;
};

export type WorkDocument = {
  id: string;
  doc_type: string;
  file_name: string;
  uploaded_at: string;
  lead_id: string;
  application_id: string | null;
};

export type MyWorkSummary = {
  counters: {
    assignedApps: number;
    orderReceived: number;
    pendingDocs: number;
    assignedLeads: number;
    totalLeads: number;
    unreadNotifications: number;
    slaRisk: number;
  };
  assignedApplications: WorkApplication[];
  pendingDocuments: WorkDocument[];
  assignedLeads: WorkLead[];
};


const SLA_HOURS = 48; // app stale after 48h without movement

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export const getMyWorkSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyWorkSummary> => {
    const { userId } = context;
    const admin = await getAdmin();
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roleList = (roles ?? []).map((r: { role: string }) => r.role);
    const isAdmin = roleList.some((r: string) => r === "admin" || r === "super_admin");

    // "Paid orders" = applications assigned to me that have at least one successful payment
    // AND are still open (not completed/closed/certificate-issued).
    const CLOSED_FULFILLMENT = ["completed", "order_closed", "certificate_issued"];

    const { data: assignedAppRows, error: assignedErr } = await admin
      .from("applications")
      .select(
        "id, application_code, application_status, fulfillment_status, form_status, document_status, created_at, updated_at, lead:leads!fk_applications_lead(id, name, email, mobile, service)"
      )
      .eq("assigned_to", userId)
      .order("updated_at", { ascending: true })
      .limit(200);
    if (assignedErr) throw new Error(assignedErr.message);

    const assignedAppIds = (assignedAppRows ?? []).map((a: any) => a.id);
    let paidAppIdSet = new Set<string>();
    if (assignedAppIds.length > 0) {
      const { data: paidRows, error: paidErr } = await admin
        .from("payments")
        .select("application_id, status")
        .in("application_id", assignedAppIds)
        .in("status", ["paid"]);
      if (paidErr) throw new Error(paidErr.message);
      paidAppIdSet = new Set((paidRows ?? []).map((p: any) => p.application_id).filter(Boolean));
    }

    const paidOpenApps = (assignedAppRows ?? []).filter(
      (a: any) =>
        paidAppIdSet.has(a.id) &&
        !CLOSED_FULFILLMENT.includes(a.fulfillment_status ?? "") &&
        a.application_status !== "completed"
    ) as unknown as WorkApplication[];

    const [docsRes, leadsRes, totalLeadsRes, notifRes] = await Promise.all([
      isAdmin
        ? admin
            .from("documents")
            .select("id, doc_type, file_name, uploaded_at, lead_id, application_id")
            .eq("status", "pending")
            .order("uploaded_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: [], error: null } as any),
      admin
        .from("leads")
        .select("id, lead_code, name, email, mobile, service, status, created_at")
        .eq("assigned_to", userId)
        .in("status", ["lead_created", "new_lead"])
        .order("created_at", { ascending: true })
        .limit(50),
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", userId),
      admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null),
    ]);

    if (docsRes.error) throw new Error(docsRes.error.message);
    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (notifRes.error) throw new Error(notifRes.error.message);

    const docs = (docsRes.data ?? []) as unknown as WorkDocument[];
    const leads = (leadsRes.data ?? []) as unknown as WorkLead[];

    const slaThreshold = Date.now() - SLA_HOURS * 3600 * 1000;
    const slaRisk = paidOpenApps.filter(
      (a) => new Date(a.updated_at).getTime() < slaThreshold
    ).length;

    return {
      counters: {
        assignedApps: paidOpenApps.length,
        orderReceived: paidOpenApps.length,
        pendingDocs: docs.length,
        assignedLeads: leads.length,
        totalLeads: totalLeadsRes.count ?? 0,
        unreadNotifications: notifRes.count ?? 0,
        slaRisk,
      },
      assignedApplications: paidOpenApps,
      pendingDocuments: docs,
      assignedLeads: leads,
    };
  });

