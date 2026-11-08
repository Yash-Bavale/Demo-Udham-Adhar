import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { getMyStaffRoles } from "@/lib/crm/users-admin.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminLandingPage,
});

/**
 * Role-based landing:
 *  - super_admin / admin  → /admin/dashboard (Executive)
 *  - finance              → /admin/finance
 *  - accounts             → /admin/finance
 *  - operations / support → /admin/my-work
 *  - no staff role        → /admin/dashboard (which renders an inline warning)
 */
function AdminLandingPage() {
  const navigate = useNavigate();
  const fetchRoles = useServerFn(getMyStaffRoles);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { roles } = await fetchRoles();
        if (cancelled) return;
        const target = pickLanding(roles);
        navigate({ to: target, replace: true });
      } catch {
        if (!cancelled) navigate({ to: "/admin/dashboard", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRoles, navigate]);

  return (
    <div className="px-6 py-10 text-sm" style={{ color: "var(--admin-fg-muted)" }}>
      Loading your workspace…
    </div>
  );
}

function pickLanding(roles: string[]): string {
  // Highest-privilege roles first.
  if (roles.includes("super_admin")) return "/admin/super";
  if (roles.includes("admin")) return "/admin/dashboard";
  if (roles.includes("finance") || roles.includes("accounts")) return "/admin/finance";
  // Every other staff role (executive, manager, support, operations, or any
  // future non-admin role) lands on the dedicated employee workspace.
  if (roles.length > 0) return "/admin/my-work";
  return "/admin/my-work";
}
