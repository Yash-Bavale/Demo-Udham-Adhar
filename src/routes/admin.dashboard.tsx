// Executive Dashboard — admin + super_admin. Same UI as /admin/super (without super actions).
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { SuperAdminDashboard, type DashboardRange } from "@/components/admin/SuperAdminDashboard";
import { WorkflowStatusWidgets } from "@/components/admin/WorkflowStatusWidgets";
import type { RangePreset } from "@/lib/crm/super-admin.functions";

const searchSchema = z.object({
  preset: fallback(z.enum(["today", "yesterday", "7d", "15d", "30d", "mtd", "custom"]), "today").default("today"),
  from: fallback(z.string().optional(), undefined).optional(),
  to: fallback(z.string().optional(), undefined).optional(),
});

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — Udyam Ops OS" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  validateSearch: zodValidator(searchSchema),
  beforeLoad: async () => {
    // Lazy import keeps the auth SDK out of the bundle public visitors download.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: rows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const roles = (rows ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      throw redirect({ to: "/admin/my-work" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const range: DashboardRange = {
    preset: search.preset as RangePreset,
    fromIso: search.from,
    toIso: search.to,
  };
  return (
    <div className="space-y-6">
      <SuperAdminDashboard
        title="Executive Dashboard"
        range={range}
        onRangeChange={(r) =>
          navigate({ search: { preset: r.preset, from: r.fromIso, to: r.toIso }, replace: true })
        }
      />
      <WorkflowStatusWidgets />
    </div>
  );
}
