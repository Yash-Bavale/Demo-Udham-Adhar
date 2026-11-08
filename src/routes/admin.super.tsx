// Super-admin command center — same UI as executive dashboard plus super-only actions.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { SuperAdminDashboard, type DashboardRange } from "@/components/admin/SuperAdminDashboard";
import { WorkflowStatusWidgets } from "@/components/admin/WorkflowStatusWidgets";
import { AppSettingsCard } from "@/components/admin/AppSettingsCard";
import type { RangePreset } from "@/lib/crm/super-admin.functions";

const searchSchema = z.object({
  preset: fallback(z.enum(["today", "yesterday", "7d", "15d", "30d", "mtd", "custom"]), "today").default("today"),
  from: fallback(z.string().optional(), undefined).optional(),
  to: fallback(z.string().optional(), undefined).optional(),
});

export const Route = createFileRoute("/admin/super")({
  head: () => ({ meta: [
    { title: "Super Admin — Udyam Ops OS" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  validateSearch: zodValidator(searchSchema),
  beforeLoad: async () => {
    // Lazy import keeps the auth SDK out of the bundle public visitors download.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/admin-login" });
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!data?.some((r) => r.role === "super_admin")) {
      throw redirect({ to: "/admin/dashboard" });
    }
  },
  component: SuperAdminPage,
});

function SuperAdminPage() {
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
        superMode
        title="Super Admin Command Center"
        range={range}
        onRangeChange={(r) =>
          navigate({ search: { preset: r.preset, from: r.fromIso, to: r.toIso }, replace: true })
        }
      />
      <WorkflowStatusWidgets />
      <AppSettingsCard />
    </div>
  );
}
