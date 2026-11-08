import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard, Users, UserCircle2, ShoppingBag, FileText, MessageSquareWarning,
  Briefcase, Receipt, CreditCard, LifeBuoy, ListChecks, BarChart3, UserCog,
  Mail, MessageCircle, Settings as SettingsIcon, LogOut, Bell, Search, Loader2,
  Inbox, Activity, FileCheck2, ClipboardList, Eye, Award,
  Banknote, ShieldCheck, ScrollText, Globe, ShieldAlert, History, Menu, X,
  GraduationCap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminThemeProvider } from "@/components/admin/theme";
import bhsLogo from "@/assets/bhs-logo.png.asset.json";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { useKeyboardShortcuts } from "@/components/admin/KeyboardShortcuts";
import {
  getUnreadNotificationCount,
  getSidebarNotificationCounts,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
  type SidebarNotificationCounts,
} from "@/lib/crm/notifications.functions";
import { useMutation } from "@tanstack/react-query";
import { globalSearch, type SearchHit } from "@/lib/crm/global-search.functions";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useNewLeadsWatcher } from "@/hooks/useNewLeadsWatcher";
import { NotificationsOptIn } from "@/components/admin/NotificationsOptIn";
import { ReminderNotificationManager } from "@/components/admin/ReminderNotificationManager";
import { clearModuleFilterState } from "@/hooks/usePreserveScroll";
import { DashboardPrivacyToggle } from "@/components/admin/DashboardPrivacyToggle";
import type { Module } from "@/lib/roles";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Users;
  module?: Module;
  /** Only show when current user holds this role. */
  requireRole?: string;
  /** Only show when current user holds any of these roles. */
  requireAnyRole?: string[];

};
type NavGroup = { id: string; label: string; items: NavItem[] };

const ALL_STAFF_ROLES = ["admin", "super_admin", "manager", "operations", "executive", "support", "finance", "accounts"];
const FINANCE_ROLES = ["admin", "super_admin", "finance", "accounts"];
const SUPPORT_ROLES = ["admin", "super_admin", "support"];
const ADMIN_ROLES = ["admin", "super_admin"];

const NAV: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Executive Dashboard", icon: LayoutDashboard, module: "dashboard", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/my-work", label: "My Dashboard", icon: Inbox },
      { to: "/admin/orders", label: "Orders", icon: ShoppingBag, module: "orders", requireAnyRole: ALL_STAFF_ROLES },
      { to: "/admin/team-orders", label: "Team Orders", icon: Users, module: "orders", requireAnyRole: ["admin", "super_admin", "manager"] },
      { to: "/admin/tickets", label: "Support Tickets", icon: LifeBuoy, module: "tickets", requireAnyRole: SUPPORT_ROLES },
      { to: "/admin/complaints", label: "Complaints & Contact Forms", icon: MessageSquareWarning, module: "complaints", requireAnyRole: SUPPORT_ROLES },
      { to: "/admin/employees", label: "Employees", icon: UserCog, module: "employees", requireAnyRole: ADMIN_ROLES },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [
      { to: "/admin/leads", label: "Leads", icon: Users, module: "leads", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/training", label: "Training", icon: GraduationCap, requireAnyRole: ALL_STAFF_ROLES },
      { to: "/admin/customers", label: "Customers", icon: UserCircle2, module: "customers", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/documents", label: "Documents", icon: FileText, module: "documents", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/review", label: "Doc Review", icon: Eye, module: "documents", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/tasks", label: "Tasks", icon: ListChecks, module: "tasks", requireAnyRole: ADMIN_ROLES },
    ],
  },
  {
    id: "service",
    label: "Service",
    items: [
      { to: "/admin/canned-responses", label: "Canned Responses", icon: LifeBuoy, module: "tickets", requireAnyRole: SUPPORT_ROLES },
      { to: "/admin/quarantine", label: "Email Quarantine", icon: Mail, module: "tickets", requireAnyRole: SUPPORT_ROLES },
      { to: "/admin/websites", label: "Websites", icon: Globe, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/services", label: "Services", icon: Briefcase, requireAnyRole: ADMIN_ROLES },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { to: "/admin/invoices", label: "Invoices", icon: Receipt, module: "invoices", requireAnyRole: FINANCE_ROLES },
      { to: "/admin/zoho-export", label: "Zoho Export", icon: Receipt, module: "invoices", requireAnyRole: FINANCE_ROLES },
      { to: "/admin/payments", label: "Payments", icon: CreditCard, module: "payments", requireAnyRole: FINANCE_ROLES },
      { to: "/admin/payment-audit", label: "Payment Audit", icon: CreditCard, module: "payments", requireAnyRole: FINANCE_ROLES },
      { to: "/admin/gateways", label: "Gateways", icon: Banknote, module: "payments", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/finance", label: "Finance (GST)", icon: Banknote, module: "payments", requireAnyRole: FINANCE_ROLES },
      { to: "/admin/refunds", label: "Refund Review", icon: Banknote, requireAnyRole: FINANCE_ROLES },
      { to: "/admin/certificates", label: "Certificates", icon: Award, requireAnyRole: ADMIN_ROLES },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      { to: "/admin/reports", label: "Reports", icon: BarChart3, module: "reports", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/dispute-manager", label: "Dispute Manager", icon: ShieldAlert, requireAnyRole: SUPPORT_ROLES },
      { to: "/admin/performance", label: "Employee Performance", icon: BarChart3, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/attendance", label: "Attendance & Payroll", icon: History, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/audit", label: "Audit Log", icon: ScrollText, module: "audit_log", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/seo", label: "SEO", icon: Globe, requireAnyRole: ADMIN_ROLES },
    ],
  },
  {
    id: "admin",
    label: "System",
    items: [
      { to: "/admin/assignment-history", label: "Assignment & Leaves", icon: History, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/live-calls", label: "Live Calls", icon: Activity, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/sessions", label: "Sessions & Security", icon: ShieldAlert, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/users", label: "Users & Roles", icon: ShieldCheck, module: "employees", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/permissions", label: "Permissions", icon: ShieldCheck, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/emails", label: "Email System", icon: Mail, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/email-templates", label: "Email Templates", icon: Mail, module: "email_templates", requireAnyRole: ADMIN_ROLES },
      { to: "/admin/whatsapp-templates", label: "WhatsApp Templates", icon: MessageCircle, requireAnyRole: ADMIN_ROLES },
      { to: "/admin/super", label: "Super Admin", icon: ShieldAlert, requireRole: "super_admin" },
      { to: "/admin/settings", label: "Settings", icon: SettingsIcon, requireAnyRole: ADMIN_ROLES },
    ],
  },
];

const FLAT_NAV: NavItem[] = NAV.flatMap((g) => g.items);

export function AdminShell({ children, email }: { children: ReactNode; email?: string }) {
  return (
    <AdminThemeProvider>
      <Shell email={email}>{children}</Shell>
    </AdminThemeProvider>
  );
}

function Shell({ children, email }: { children: ReactNode; email?: string }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const role = useRole();
  const userPerms = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  const isPendingAuth = role.loading && userPerms.isLoading;
  const isSuperAdmin = role.has("super_admin") || role.has("super");
  const isAdminUser = isSuperAdmin || role.has("admin") || Boolean(userPerms.perms?.isAdmin);

  const visibleNav: NavGroup[] = NAV
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (isAdminUser) {
          if (it.requireRole === "super_admin" && !isSuperAdmin) return false;
          return true;
        }

        // For non-admin employees/staff:
        // Check role requirements if specified
        if (it.requireRole && !role.has(it.requireRole)) return false;
        if (it.requireAnyRole && !it.requireAnyRole.some((r) => role.has(r))) return false;

        // Check module permissions
        if (it.module) {
          if (userPerms.can(it.module, "view")) return true;
          if (role.can(it.module)) return true;
          return false;
        }

        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);

  // Default fallback for employees during initial load
  const defaultEmployeeNav: NavGroup[] = [
    {
      id: "overview",
      label: "Overview",
      items: [
        { to: "/admin/my-work", label: "My Dashboard", icon: Inbox },
      ],
    },
    {
      id: "work",
      label: "Work",
      items: [
        { to: "/admin/orders", label: "Orders", icon: ShoppingBag, module: "orders" },
        { to: "/admin/training", label: "Training", icon: GraduationCap },
      ],
    },
  ];

  const displayNav = visibleNav.length > 0 ? visibleNav : defaultEmployeeNav;
  const flatVisible = displayNav.flatMap((g) => g.items);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("bhs.admin.sidebarCollapsed") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("bhs.admin.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
  const { unseen: newLeads } = useNewLeadsWatcher();

  const fetchSidebarCounts = useServerFn(getSidebarNotificationCounts);
  const { data: sidebarCounts } = useQuery<SidebarNotificationCounts>({
    queryKey: ["sidebar-notification-counts"],
    queryFn: () => fetchSidebarCounts(),
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  // Track which module paths have been visited this session —
  // once you navigate to a section, its badge clears until the next page refresh.
  const CLEARABLE_PATHS = useMemo(
    () => [
      "/admin/orders",
      "/admin/review",
      "/admin/tasks",
      "/admin/complaints",
      "/admin/tickets",
      "/admin/quarantine",
      "/admin/refunds",
    ],
    [],
  );
  const currentPath = path ?? "";
  const [visitedPaths, setVisitedPaths] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!currentPath) return;
    const matched = CLEARABLE_PATHS.find(
      (p) => currentPath === p || currentPath.startsWith(p + "/"),
    );
    if (matched) {
      setVisitedPaths((prev) => {
        if (prev.has(matched)) return prev;
        const next = new Set(prev);
        next.add(matched);
        return next;
      });
    }
  }, [currentPath, CLEARABLE_PATHS]);

  const getSidebarBadge = (to: string): number => {
    // Notifications page: always show unread count (never suppressed)
    if (to === "/admin/notifications") return 0;
    // Leads: uses its own watcher — only new-since-last-visit
    if (to === "/admin/leads") return newLeads > 0 ? newLeads : 0;
    // All other clearable sections: suppress once visited
    if (visitedPaths.has(to)) return 0;
    if (!sidebarCounts) return 0;
    if (to === "/admin/orders") return sidebarCounts.orders;
    if (to === "/admin/review") return sidebarCounts.docReview;
    if (to === "/admin/tasks") return sidebarCounts.tasks;
    if (to === "/admin/complaints") return sidebarCounts.complaints;
    if (to === "/admin/tickets") return sidebarCounts.tickets;
    if (to === "/admin/quarantine") return sidebarCounts.quarantine;
    if (to === "/admin/refunds") return sidebarCounts.refunds;
    return 0;
  };

  useKeyboardShortcuts(() => setPaletteOpen(true), () => { });

  const isActive = (to: string) =>
    !!currentPath && (currentPath === to || (to !== "/admin/dashboard" && currentPath.startsWith(to + "/")));

  const renderNavLinks = (isMobile = false) => (
    <nav className="flex-1 overflow-y-auto py-3 px-2">
      {displayNav.map((group, gi) => (
        <div key={group.id}>
          {gi > 0 && (
            <div className="my-2 mx-2 h-px" style={{ background: "var(--admin-border)" }} />
          )}
          {(!sidebarCollapsed || isMobile) && (
            <div
              className="px-2.5 pt-1 pb-1 text-[10px] uppercase tracking-wider"
              style={{ color: "var(--admin-sidebar-muted)" }}
            >
              {group.label}
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map((n) => {
              const active = isActive(n.to);
              const Icon = n.icon;
              const badge = getSidebarBadge(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => {
                    if (isMobile) setMobileOpen(false);
                    if (n.to === "/admin/orders") {
                      clearModuleFilterState("admin.orders");
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("reset-orders-filters"));
                      }
                    }
                    if (n.to === "/admin/team-orders") {
                      clearModuleFilterState("admin.team-orders");
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("reset-orders-filters"));
                      }
                    }
                  }}
                  title={sidebarCollapsed && !isMobile ? `${n.label}${badge > 0 ? ` (${badge} new)` : ""}` : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-colors",
                    sidebarCollapsed && !isMobile ? "justify-center px-1.5" : "px-2.5",
                  )}
                  style={{
                    background: active ? "var(--admin-accent-soft)" : "transparent",
                    color: active ? "var(--admin-primary)" : "var(--admin-sidebar-fg)",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <div className="relative shrink-0">
                    <Icon className="size-4" />
                    {sidebarCollapsed && !isMobile && badge > 0 && (
                      <span
                        className="absolute -top-1 -right-1 size-2 rounded-full ring-2 ring-[var(--admin-sidebar)]"
                        style={{ background: "var(--admin-danger)" }}
                      />
                    )}
                  </div>
                  {(!sidebarCollapsed || isMobile) && <span className="truncate flex-1">{n.label}</span>}
                  {(!sidebarCollapsed || isMobile) && badge > 0 && (
                    <span
                      className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0"
                      style={{ background: "var(--admin-danger)", color: "#fff" }}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="my-2 mx-2 h-px" style={{ background: "var(--admin-border)" }} />
      <button
        onClick={async () => {
          if (isMobile) setMobileOpen(false);
          try { window.sessionStorage.removeItem("crm_employee_session_id"); } catch { /* ignore */ }
          await supabase.auth.signOut({ scope: "local" });
          navigate({ to: "/admin-login" });
        }}
        title={sidebarCollapsed && !isMobile ? "Logout" : undefined}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-colors hover:bg-[var(--admin-surface-2)] cursor-pointer",
          sidebarCollapsed && !isMobile ? "justify-center px-1.5" : "px-2.5",
        )}
        style={{ color: "var(--admin-sidebar-fg)" }}
      >
        <LogOut className="size-4 shrink-0" />
        {(!sidebarCollapsed || isMobile) && <span className="truncate">Logout</span>}
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen flex w-full" style={{ background: "var(--admin-bg)", color: "var(--admin-fg)" }}>
      {/* Mobile Drawer Backdrop & Slide-over Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-2xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative flex flex-col w-[260px] max-w-[85vw] h-full shadow-2xl z-50 animate-in slide-in-from-left duration-200"
            style={{
              background: "var(--admin-sidebar)",
              color: "var(--admin-sidebar-fg)",
            }}
          >
            <div
              className="flex items-center justify-between px-3.5 h-14 border-b shrink-0"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <img src={bhsLogo.url} alt="Business Help Services" className="size-8 rounded-md object-contain shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-tight truncate">Business Help</div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--admin-sidebar-muted)" }}>
                    ADMIN
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--admin-surface-2)] text-[var(--admin-sidebar-fg)] cursor-pointer"
                aria-label="Close sidebar"
              >
                <X className="size-5" />
              </button>
            </div>
            {renderNavLinks(true)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar — collapsible & sticky fixed */}
      <aside
        className="hidden md:flex shrink-0 h-screen sticky top-0 flex-col border-r transition-[width] duration-200 z-30"
        style={{
          width: sidebarCollapsed ? 64 : 220,
          background: "var(--admin-sidebar)",
          color: "var(--admin-sidebar-fg)",
          borderColor: "var(--admin-border)",
        }}
      >
        <div
          className="flex items-center gap-2 px-3 h-14 border-b shrink-0"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 rounded-full p-2 hover:bg-[var(--admin-surface-2)] cursor-pointer"
            style={{ color: "var(--admin-sidebar-fg)" }}
          >
            <Menu className="size-5" />
          </button>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img src={bhsLogo.url} alt="Business Help Services" className="size-8 rounded-md object-contain shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight truncate">Business Help</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--admin-sidebar-muted)" }}>
                  ADMIN
                </div>
              </div>
            </div>
          )}
        </div>

        {renderNavLinks(false)}
      </aside>

      {/* Main App Container */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top bar — sticky fixed */}
        <header
          className="sticky top-0 z-20 flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 md:px-6 h-14 border-b shrink-0"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
        >
          <div className="flex items-center gap-1.5 md:hidden shrink-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open sidebar menu"
              className="p-1.5 rounded-lg hover:bg-[var(--admin-surface-2)] text-[var(--admin-fg)] cursor-pointer"
            >
              <Menu className="size-5" />
            </button>
            <div className="font-bold text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none" style={{ color: "var(--admin-primary)" }}>
              Business Help
            </div>
          </div>
          <div className="flex-1 max-w-2xl min-w-0">
            <GlobalSearchInput onOpenPalette={() => setPaletteOpen(true)} />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <NotificationsBell />
            <UserMenu email={email} onSignOut={async () => {
              try { window.sessionStorage.removeItem("crm_employee_session_id"); } catch { /* ignore */ }
          await supabase.auth.signOut({ scope: "local" });
              navigate({ to: "/admin-login" });
            }} />
            {isAdminUser && <DashboardPrivacyToggle />}
          </div>
        </header>

        {/* Content Area */}
        <main id="admin-main-scroll" className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-6 w-full max-w-[1600px] mx-auto space-y-6">
          <NotificationsOptIn />
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — icons only, shows primary destinations */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t flex items-stretch justify-around"
        style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
      >
        {flatVisible.slice(0, 6).map((n) => {
          const active = isActive(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className="flex-1 flex items-center justify-center py-2.5"
              style={{
                color: active ? "var(--admin-primary)" : "var(--admin-fg-muted)",
                background: active ? "var(--admin-accent-soft)" : "transparent",
              }}
              aria-label={n.label}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ReminderNotificationManager />
    </div>
  );
}

function GlobalSearchInput({ onOpenPalette }: { onOpenPalette: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const search = useServerFn(globalSearch);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data, isFetching } = useQuery<{ hits: SearchHit[] }>({
    queryKey: ["global-search", q],
    queryFn: () => search({ data: { q } }),
    enabled: q.trim().length >= 2,
    staleTime: 5_000,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hits = data?.hits ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex items-center gap-2 rounded-md border px-3 h-9"
        style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }}
      >
        <Search className="size-4 shrink-0" style={{ color: "var(--admin-fg-muted)" }} />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => q.length >= 2 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder="Search orders, leads, mobiles, complaints, Udyam no…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--admin-fg-subtle)]"
          aria-label="Global search"
        />
        {isFetching && <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--admin-fg-muted)" }} />}
        <button
          onClick={onOpenPalette}
          className="hidden sm:inline-flex rounded border px-1.5 py-0.5 text-[10px] font-mono"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg-muted)" }}
          aria-label="Open command palette"
        >
          ⌘K
        </button>
      </div>

      {open && q.trim().length >= 2 && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-md border max-h-[420px] overflow-y-auto z-40"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
        >
          {hits.length === 0 ? (
            <div className="px-3 py-4 text-xs" style={{ color: "var(--admin-fg-muted)" }}>
              {isFetching ? "Searching…" : "No matches."}
            </div>
          ) : (
            <ul className="py-1">
              {hits.map((h) => {
                const isApp = h.kind === "application";
                const isLead = h.kind === "lead";
                const formattedDate = h.created_at
                  ? new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                      .format(new Date(h.created_at))
                      .replace(",", "")
                  : null;

                if (isApp || isLead) {
                  return (
                    <li key={`${h.kind}-${h.id}`}>
                      <button
                        onClick={() => {
                          setOpen(false);
                          setQ("");
                          navigate({ to: h.href });
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-[var(--admin-surface-2)] flex items-start gap-2.5 transition-colors border-b border-slate-100/80 last:border-0"
                      >
                        <span
                          className="shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-bold"
                          style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}
                        >
                          {isApp ? "ORDER" : "LEAD"}
                        </span>
                        <span className="min-w-0 flex-1">
                          {/* Header: Name · ID · Date & Time */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm truncate" style={{ color: "var(--admin-fg)" }}>
                              {h.name || h.code}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs shrink-0 font-mono" style={{ color: "var(--admin-fg-muted)" }}>
                              <span className="font-semibold">{h.code}</span>
                              {formattedDate && <span>· {formattedDate}</span>}
                            </div>
                          </div>
                          {/* Below Line: Mobile · Email · Service Selected · Direct Assignee Name (if order) */}
                          <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--admin-fg-muted)" }}>
                            {[
                              h.mobile ? `+91 ${h.mobile}` : null,
                              h.email || null,
                              h.service || null,
                              isApp ? (h.assignee || "Unassigned") : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </span>
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={`${h.kind}-${h.id}`}>
                    <button
                      onClick={() => {
                        setOpen(false);
                        setQ("");
                        navigate({ to: h.href });
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--admin-surface-2)] flex items-start gap-2"
                    >
                      <span
                        className="shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium"
                        style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}
                      >
                        {h.kind}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate" style={{ color: "var(--admin-fg)" }}>{h.title}</span>
                        {h.subtitle && (
                          <span className="block text-[11px] truncate" style={{ color: "var(--admin-fg-muted)" }}>{h.subtitle}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const MUTE_KEY = "bhs.notif.muted";
function playChime() {
  try {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(MUTE_KEY) === "1") return;
    if (localStorage.getItem("udyam.sound.enabled") === "false") return;
    if (localStorage.getItem("udyam.sound.leads") === "false" && localStorage.getItem("udyam.sound.orders") === "false") return;
    const AC: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => ctx.close().catch(() => { });
  } catch { /* ignore */ }
}

function NotificationsBell() {
  const navigate = useNavigate();
  const fetchCount = useServerFn(getUnreadNotificationCount);
  const qc = useQueryClient();
  const [hasSession, setHasSession] = useState(false);
  const [muted, setMuted] = useState(false);
  const lastCountRef = useRef<number>(0);
  const primedRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMuted = localStorage.getItem(MUTE_KEY) === "1" || localStorage.getItem("udyam.sound.enabled") === "false";
      setMuted(isMuted);
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  // Unread count removed by request: no polling, no live listener, no badge.
  void fetchCount;
  const count = 0;

  // Chime on count increase (after initial prime so mount doesn't ring).
  useEffect(() => {
    if (!primedRef.current) {
      primedRef.current = true;
      lastCountRef.current = count;
      return;
    }
    if (count > lastCountRef.current) {
      const isMuted = typeof window !== "undefined" && (
        localStorage.getItem(MUTE_KEY) === "1" ||
        localStorage.getItem("udyam.sound.enabled") === "false" ||
        (localStorage.getItem("udyam.sound.leads") === "false" && localStorage.getItem("udyam.sound.orders") === "false")
      );
      if (!isMuted) {
        playChime();
      }
    }
    lastCountRef.current = count;
  }, [count]);

  // Dropdown panel state + recent list
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fetchList = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const { data: listData, refetch: refetchList } = useQuery<{ rows: Notification[] }>({
    queryKey: ["notifications", "recent"],
    queryFn: () => fetchList({ data: { limit: 20 } }),
    enabled: hasSession && open,
    staleTime: 15_000,
  });
  const rawRecent = listData?.rows ?? [];
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return rawRecent.filter((n) => {
      const key = `${n.title.trim().toLowerCase()}|${(n.body ?? "").trim().toLowerCase()}|${n.href ?? n.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawRecent]);

  const markOneMut = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => {
      refetchList();
      qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });
  const markAllMut = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => {
      refetchList();
      qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  function relative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1">
      <button
        onClick={() => {
          const next = !muted;
          setMuted(next);
          try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { }
        }}
        className="rounded-md p-1.5 hover:bg-[var(--admin-surface-2)] transition-colors text-[10px]"
        style={{ color: "var(--admin-fg-muted)" }}
        aria-label={muted ? "Unmute notifications" : "Mute notifications"}
        title={muted ? "Notification sound muted — click to unmute" : "Mute notification sound"}
      >
        {muted ? "🔕" : "🔔"}
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 hover:bg-[var(--admin-surface-2)] transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-semibold flex items-center justify-center"
            style={{ background: "var(--admin-danger)", color: "white" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-[380px] rounded-lg border shadow-xl z-50 overflow-hidden"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--admin-border)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--admin-fg)" }}>
              Notifications {count > 0 && <span className="ml-1 text-[11px] font-medium text-indigo-600">({count} new)</span>}
            </div>
            <button
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {recent.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs" style={{ color: "var(--admin-fg-muted)" }}>
                You're all caught up.
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--admin-border)" }}>
                {recent.map((n) => {
                  const unread = !n.read_at;
                  return (
                    <li
                      key={n.id}
                      className={`px-3 py-2.5 hover:bg-[var(--admin-surface-2)] transition-colors cursor-pointer ${unread ? "bg-indigo-50/40" : ""}`}
                      onClick={() => {
                        if (unread) markOneMut.mutate(n.id);
                        if (n.href) {
                          setOpen(false);
                          navigate({ to: n.href });
                        }
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {unread && <span className="mt-1.5 size-1.5 rounded-full bg-indigo-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <div className="text-[13px] font-medium truncate" style={{ color: "var(--admin-fg)" }}>{n.title}</div>
                            <div className="ml-auto text-[10px] shrink-0" style={{ color: "var(--admin-fg-muted)" }}>{relative(n.created_at)}</div>
                          </div>
                          {n.body && <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--admin-fg-muted)" }}>{n.body}</div>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-3 py-2 border-t text-center" style={{ borderColor: "var(--admin-border)" }}>
            <Link
              to="/admin/notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const initial = (email ?? "U").slice(0, 1).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="size-8 rounded-full flex items-center justify-center text-xs font-medium"
        style={{ background: "var(--admin-primary)", color: "#fff" }}
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-56 rounded-md border z-40"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
        >
          {email && (
            <div className="px-3 py-2 border-b text-xs truncate" style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg-muted)" }}>
              {email}
            </div>
          )}
          <button
            onClick={onSignOut}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--admin-surface-2)] flex items-center gap-2"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
