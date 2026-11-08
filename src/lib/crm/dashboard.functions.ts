import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Metric = { label: string; value: number };
type TrendPoint = { date: string; count: number };
type DashboardMetrics = {
  totalLeads: number;
  todayLeads: number;
  weekLeads: number;
  inProgress: number;
  completed: number;
  pending: number;
  uniqueCustomers: number;
  uniqueEmails: number;
  uniqueMobiles: number;
  statusDistribution: Metric[];
  serviceDistribution: Metric[];
  trend: TrendPoint[];
};

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [metricsRes, recentLeads, recentActivity, myRoles] = await Promise.all([
      supabase.rpc("get_dashboard_metrics"),
      supabase
        .from("leads")
        .select("id, lead_code, name, service, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("activity_logs")
        .select("id, activity_type, activity_description, created_at, lead_id")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (metricsRes.error) throw new Error(metricsRes.error.message);
    const m = (metricsRes.data ?? {}) as DashboardMetrics;

    return {
      totals: {
        totalLeads: m.totalLeads ?? 0,
        todayLeads: m.todayLeads ?? 0,
        weekLeads: m.weekLeads ?? 0,
        inProgress: m.inProgress ?? 0,
        completed: m.completed ?? 0,
        pending: m.pending ?? 0,
        uniqueCustomers: m.uniqueCustomers ?? 0,
        uniqueMobiles: m.uniqueMobiles ?? 0,
      },
      recentLeads: recentLeads.data ?? [],
      recentActivity: recentActivity.data ?? [],
      statusDistribution: m.statusDistribution ?? [],
      serviceDistribution: m.serviceDistribution ?? [],
      trend: m.trend ?? [],
      currentUser: {
        hasStaffRole: (myRoles.data ?? []).length > 0,
        roles: (myRoles.data ?? []).map((r: { role: string }) => r.role),
      },
    };
  });

export const listActivityLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("activity_logs")
      .select("id, activity_type, activity_description, lead_id, application_id, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });
