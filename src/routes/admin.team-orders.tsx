import { createFileRoute } from "@tanstack/react-router";
import { OrdersListPage } from "@/routes/admin.orders.index";
import { useRole } from "@/hooks/useRole";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/admin/team-orders")({
  head: () => ({
    meta: [
      { title: "Team Orders — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TeamOrdersRouteComponent,
});

function TeamOrdersRouteComponent() {
  const role = useRole();
  const canAccess = role.hasAny(["admin", "super_admin", "manager"]);

  if (!role.loading && !canAccess) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3 my-6">
        <ShieldAlert className="size-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          This section is for managers and administrators to oversee team order counts.
        </p>
      </div>
    );
  }

  return <OrdersListPage mode="team" />;
}
