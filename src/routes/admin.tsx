import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  // Auth check needs browser localStorage (Supabase stores the session there),
  // so the admin subtree opts out of SSR. Without this, any hard refresh on
  // /admin/* runs beforeLoad on the server with no session → redirects to
  // /admin-login → which bounces back to /admin/dashboard, making deep links
  // and refreshes always land on the dashboard.
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Business Help Services" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    // 1) Must be signed in. Imported lazily so the auth SDK ships with the
    //    admin chunk instead of the bundle every public visitor downloads.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin-login" });

    // 2) P0 SECURITY (Final_CRM Part B / audit C-1) — must hold a staff role.
    //    Uses the SECURITY DEFINER RPC `has_any_staff_role` which checks
    //    public.user_roles for any of: super_admin, admin, manager, executive,
    //    support, accounts, finance, operations.
    //    Only a definitive "false" answer means access denied. A temporary
    //    network / token-refresh failure is retried and, if it persists, shown
    //    as a retryable error instead of wrongly sending staff to /unauthorized.
    let isStaff: boolean | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        await supabase.auth.refreshSession().catch(() => undefined);
      }
      const { data: res, error: roleErr } = await supabase.rpc("has_any_staff_role", {
        _user_id: data.user.id,
      });
      if (!roleErr && typeof res === "boolean") {
        isStaff = res;
        break;
      }
      lastErr = roleErr;
    }
    if (isStaff === false) throw redirect({ to: "/unauthorized" });
    if (isStaff !== true) {
      console.warn("[admin] staff role check failed", lastErr);
      throw new Error("Could not verify your access (connection problem). Please reload the page.");
    }
  },
  component: AdminLayout,
  errorComponent: ({ error }: any) => (
    <div className="p-8 text-sm text-red-700">
      Admin error: {error.message}{" "}
      <button className="ml-2 underline" onClick={() => window.location.reload()}>Reload</button>
    </div>
  ),
});

import { useEmployeePresence } from "@/hooks/useEmployeePresence";
import { TelephonyPanel } from "@/components/admin/telephony/TelephonyPanel";
import { WebRtcPhone } from "@/components/admin/telephony/WebRtcPhone";
import { FinancialVisibilityProvider } from "@/hooks/useFinancialVisibility";
import { DashboardPrivacyProvider } from "@/hooks/useDashboardPrivacy";

function AdminLayout() {
  const [email, setEmail] = useState<string>();
  
  // Background presence and heartbeat tracking
  useEmployeePresence();

  // Microsoft Clarity Analytics for /admin
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).clarity) return;
    (function (c: any, l: any, a: any, r: any, i: any, t?: any, y?: any) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r);
      t.async = 1;
      t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0];
      if (y && y.parentNode) {
        y.parentNode.insertBefore(t, y);
      } else {
        l.head.appendChild(t);
      }
    })(window, document, "clarity", "script", "yntk765ksf");
  }, []);

  useEffect(() => {
    void import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? undefined)),
    );
  }, []);
  return (
    <DashboardPrivacyProvider>
      <FinancialVisibilityProvider>
        <AdminShell email={email}>
          <Outlet />
          <TelephonyPanel />
          {/* Shows only for the authorised test account (help@businesshelpservices.in); hidden for everyone else. */}
          <WebRtcPhone />
        </AdminShell>
      </FinancialVisibilityProvider>
    </DashboardPrivacyProvider>
  );
}

