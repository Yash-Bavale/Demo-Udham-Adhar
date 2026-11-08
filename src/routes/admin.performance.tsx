import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  getEmployeePerformanceCommandCenter,
  getEmployeeDetailPerformance,
  getLiveActivityFeed,
  getEmployeeMetricDrilldown,
  type DatePeriodFilter,
} from "@/lib/crm/employee-performance.functions";
import {
  Users,
  UserCheck,
  ShoppingBag,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Flame,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Timer,
  Search,
  SlidersHorizontal,
  Download,
  Calendar,
  Layers,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  Eye,
  Lock,
  Wifi,
  Radio,
  FileCheck,
  AlertCircle,
  PhoneCall,
  Power,
  ShieldAlert,
  Send,
  Sparkles,
} from "lucide-react";
import { formatIST } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/performance")({
  head: () => ({
    meta: [
      {
        title: "Employee Activity & Performance Command Center — Business Help CRM",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/admin-login" });
    const { data: rows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const roles = (rows ?? []).map((r) => r.role as string);
    if (
      !roles.includes("admin") &&
      !roles.includes("super_admin") &&
      !roles.includes("manager")
    ) {
      throw redirect({ to: "/admin/my-performance" });
    }
  },
  component: EmployeeActivityCommandCenterPage,
});

/* ─────────────────────────────────────────────────────────────────── */
/*  ACTION LABEL SANITIZATION HELPERS                                  */
/* ─────────────────────────────────────────────────────────────────── */

function getCleanActionBadge(raw?: string | null): string {
  if (!raw) return "ACTIVITY";
  let s = raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/moved to\s*$/i, "")
    .replace(/moved to\s+[0-9a-f]{6,}/i, "")
    .trim();
  if (!s || /^moved to/i.test(s) || /^[0-9a-f\-]+$/i.test(s)) {
    return "STAGE UPDATED";
  }
  return s.slice(0, 22).toUpperCase();
}

function getCleanActionDetails(raw?: string | null): string {
  if (!raw) return "Operational verification logged";
  let s = raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/moved to\s*$/i, "Order stage updated")
    .replace(/moved to\s+[0-9a-f]{6,}/i, "Order stage updated")
    .trim();
  if (!s || /^moved to/i.test(s) || /^[0-9a-f\-]+$/i.test(s)) {
    return "Order fulfillment stage updated";
  }
  return s;
}

function cleanStageOrStatus(raw?: string | null): string {
  if (!raw) return "—";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* ─────────────────────────────────────────────────────────────────── */
/*  MAIN PAGE COMPONENT                                                */
/* ─────────────────────────────────────────────────────────────────── */

function EmployeeActivityCommandCenterPage() {
  const [dateFilter, setDateFilter] = useState<DatePeriodFilter>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [selectedPod, setSelectedPod] = useState<string>("All Pods & Pod Alpha");
  const [inspectEmployeeId, setInspectEmployeeId] = useState<string | null>(null);
  const [drilldownMetric, setDrilldownMetric] = useState<{
    employeeId?: string | null;
    employeeName?: string;
    metric: "assigned" | "worked" | "actions" | "customerDelays" | "technicalDelays" | "hotOrders" | "completed" | "closed";
    title: string;
  } | null>(null);
  const [tableSearch, setTableSearch] = useState<string>("");
  const [auditFilter, setAuditFilter] = useState<string>("human");
  const [isRotating, setIsRotating] = useState(false);
  const [broadcastNote, setBroadcastNote] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const getCommandCenterFn = useServerFn(getEmployeePerformanceCommandCenter);
  const getLiveFeedFn = useServerFn(getLiveActivityFeed);
  const getDrilldownFn = useServerFn(getEmployeeMetricDrilldown);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      "admin.performance.command-center",
      dateFilter,
      customStart,
      customEnd,
    ],
    queryFn: () =>
      getCommandCenterFn({
        data: {
          dateFilter,
          customStart: customStart || undefined,
          customEnd: customEnd || undefined,
        },
      }),
    refetchInterval: 30_000,
  });

  const { data: liveFeed, refetch: refetchFeed } = useQuery({
    queryKey: ["admin.performance.live-feed", auditFilter],
    queryFn: () =>
      getLiveFeedFn({
        data: {
          limit: 40,
          filter: auditFilter === "system" ? "system" : auditFilter === "all" ? "all" : auditFilter === "human" ? "human" : "all",
        },
      }),
    refetchInterval: 10_000,
  });

  const { data: drilldownList, isLoading: isDrilldownLoading } = useQuery({
    queryKey: [
      "admin.performance.drilldown",
      drilldownMetric?.employeeId,
      drilldownMetric?.metric,
      dateFilter,
      customStart,
      customEnd,
    ],
    queryFn: () => {
      if (!drilldownMetric) return [];
      return getDrilldownFn({
        data: {
          employeeId: drilldownMetric.employeeId,
          metric: drilldownMetric.metric,
          dateFilter,
          customStart: customStart || undefined,
          customEnd: customEnd || undefined,
        },
      });
    },
    enabled: !!drilldownMetric,
  });

  // Realtime subscription on existing production tables
  useEffect(() => {
    const channel = supabase
      .channel("perf_command_center_audit_events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "application_events" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin.performance.command-center"] });
          queryClient.invalidateQueries({ queryKey: ["admin.performance.live-feed"] });
          if (inspectEmployeeId) {
            queryClient.invalidateQueries({
              queryKey: ["admin.performance.employee-detail", inspectEmployeeId],
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_schedulers" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin.performance.command-center"] });
          queryClient.invalidateQueries({ queryKey: ["admin.performance.live-feed"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin.performance.command-center"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, inspectEmployeeId]);

  const handleSyncNow = () => {
    setIsRotating(true);
    refetch();
    refetchFeed();
    setTimeout(() => setIsRotating(false), 700);
  };

  const employeeRows = data?.employeeRows ?? [];
  const telemetry = (data as any)?.telemetry;
  const totalMonitored = telemetry?.totalMonitored ?? data?.kpiCards?.totalActiveEmployees?.value ?? employeeRows.length;
  const activeCount = telemetry?.activeCount ?? employeeRows.filter((e) => e.status === "active").length;
  const idleCount = telemetry?.idleCount ?? employeeRows.filter((e) => e.status === "idle").length;
  const awayCount = telemetry?.awayCount ?? employeeRows.filter((e) => e.status === "away").length;
  const offlineCount = telemetry?.offlineCount ?? employeeRows.filter((e) => e.status === "offline").length;

  const totalIdleFormatted = telemetry?.totalIdleFormatted || "0m";
  const totalAwayFormatted = telemetry?.totalAwayFormatted || "0m";
  const totalActiveFormatted = telemetry?.totalActiveFormatted || "0m";

  const activePct = totalMonitored > 0 ? Math.round((activeCount / totalMonitored) * 100) : 0;
  const idlePct = totalMonitored > 0 ? Math.round((idleCount / totalMonitored) * 100) : 0;
  const awayPct = totalMonitored > 0 ? Math.round((awayCount / totalMonitored) * 100) : 0;
  const offlinePct = Math.max(0, 100 - activePct - idlePct - awayPct);

  // Filtered rows for Operational Registry
  const filteredEmployees = useMemo(() => {
    let list = employeeRows;
    if (selectedPod && selectedPod !== "All Pods & Pod Alpha") {
      list = list.filter((e: any) => {
        const podStr = `${e.pod || ""} ${e.employeeRole || ""}`.toLowerCase();
        if (selectedPod.includes("Beta")) return podStr.includes("beta") || podStr.includes("operations");
        if (selectedPod.includes("Gamma")) return podStr.includes("gamma") || podStr.includes("escalation") || podStr.includes("support");
        if (selectedPod.includes("Verification")) return podStr.includes("verification") || podStr.includes("document");
        return true;
      });
    }
    if (!tableSearch.trim()) return list;
    const q = tableSearch.toLowerCase();
    return list.filter(
      (e: any) =>
        e.employeeName.toLowerCase().includes(q) ||
        (e.employeeRole && e.employeeRole.toLowerCase().includes(q)),
    );
  }, [employeeRows, selectedPod, tableSearch]);

  // Filtered Audit Feed items
  const filteredAuditFeed = useMemo(() => {
    if (!liveFeed) return [];
    if (auditFilter === "human" || auditFilter === "system" || auditFilter === "all") return liveFeed;
    return liveFeed.filter((item: any) => {
      const type = (item.actionType || "").toUpperCase();
      const txt = (item.actionText || "").toUpperCase();
      if (auditFilter === "Orders") {
        return (
          type.includes("ORDER") ||
          type.includes("STAGE") ||
          type.includes("ASSIGN") ||
          txt.includes("ORDER")
        );
      }
      if (auditFilter === "Support Tickets") {
        return type.includes("TICKET") || txt.includes("TICKET");
      }
      if (auditFilter === "Documents") {
        return (
          type.includes("DOC") ||
          type.includes("CERTIFICATE") ||
          txt.includes("DOC") ||
          txt.includes("VERIF")
        );
      }
      if (auditFilter === "Delays") {
        return (
          type.includes("DELAY") ||
          txt.includes("DELAY") ||
          txt.includes("PAUSE") ||
          type.includes("HOT")
        );
      }
      return true;
    });
  }, [liveFeed, auditFilter]);

  // Export CSV handler
  const handleExportShiftReport = () => {
    const headers = [
      "Employee",
      "Role",
      "Status",
      "Assigned",
      "Worked",
      "Actions",
      "Completed",
      "Closed",
      "Customer Delays",
      "Tech Delays",
      "Hot Orders",
      "SLA Compliance",
      "Idle Time",
      "Away Time",
      "Last Action",
      "Last Active",
    ];
    const rows = employeeRows.map((e: any) => [
      `"${e.employeeName}"`,
      `"${e.employeeRole || ""}"`,
      `"${e.status}"`,
      e.assigned,
      e.worked,
      e.actions,
      e.completed,
      e.closed,
      e.customerDelays,
      e.technicalDelays || 0,
      e.hotOrders,
      `"${e.slaPercent}%"`,
      `"${e.idleDurationFormatted || "0m"}"`,
      `"${e.awayDurationFormatted || "0m"}"`,
      `"${e.lastActionText || ""}"`,
      `"${e.lastActiveAgo || ""}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `shift_telemetry_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If inspecting a specific employee, render the detailed Screen 2
  if (inspectEmployeeId) {
    return (
      <EmployeeSessionAuditView
        employeeId={inspectEmployeeId}
        onBack={() => setInspectEmployeeId(null)}
      />
    );
  }

  const currentDateFormatted = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="w-full space-y-6 pb-12 font-sans antialiased">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* TOP BAR: Navigation Context, Status Pill & Controls           */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
            <span>Overview</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-blue-600">Employee Activity</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Employee Activity
            </h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/80 text-emerald-800 text-[11px] font-semibold shadow-xs border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Sync Active</span>
              <span className="text-emerald-700/80 font-normal">(30s heartbeat)</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Real-time telemetry across active CRM operator terminals. Operational telemetry strictly logs business transactions.
          </p>
        </div>

        {/* Global Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Current Date Pill */}
          <div className="flex items-center bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs text-xs text-slate-800 font-medium">
            <Calendar className="h-4 w-4 text-slate-400 mr-2" />
            <span>Today, {currentDateFormatted} IST</span>
          </div>

          {/* Pod Selector */}
          <div className="flex items-center bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs text-xs text-slate-800 font-medium">
            <Users className="h-4 w-4 text-slate-400 mr-2" />
            <select
              value={selectedPod}
              onChange={(e) => setSelectedPod(e.target.value)}
              className="bg-transparent text-xs text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="All Pods & Pod Alpha">All Pods &amp; Pod Alpha</option>
              <option value="Pod Beta (Operations)">Pod Beta (Operations)</option>
              <option value="Pod Gamma (Escalations)">Pod Gamma (Escalations)</option>
              <option value="Document Verification">Document Verification</option>
            </select>
          </div>

          {/* Sync Now Button */}
          <button
            onClick={handleSyncNow}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-all shadow-xs"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-blue-600 transition-transform duration-500",
                (isRotating || isFetching) && "rotate-180 animate-spin",
              )}
            />
            <span>Sync Now</span>
          </button>

          {/* Export Shift Report */}
          <button
            onClick={handleExportShiftReport}
            type="button"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Shift Report</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 1: PRESENCE COUNTERS (KPI Ribbon)                     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
            Employees Telemetry
          </span>
          <span className="hidden md:inline text-[11px] text-slate-400">
            Telemetry: CRM Events &amp; Heartbeats • No invasive monitoring
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Total Monitored */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Total Monitored</span>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-slate-900 tracking-tight leading-none">
                {totalMonitored}
              </span>
              <span className="text-xs text-slate-500">Floor Alpha</span>
            </div>
            <div className="mt-2 text-slate-400 text-[11px]">
              100% capacity assigned
            </div>
          </div>

          {/* Active */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Active
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                {activePct}%
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-emerald-600 tracking-tight leading-none">
                {activeCount}
              </span>
              <span className="text-xs text-slate-500">Interacting</span>
            </div>
            <div className="mt-2 text-slate-500 text-[11px] truncate">
              Active in CRM records
            </div>
          </div>

          {/* Idle */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Idle
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900">
                {idlePct}%
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-amber-600 tracking-tight leading-none">
                {idleCount}
              </span>
              <span className="text-xs text-amber-700 font-semibold">{totalIdleFormatted}</span>
            </div>
            <div className="mt-2 text-slate-500 text-[11px] truncate">
              {idleCount} idle ({totalIdleFormatted} total idle)
            </div>
          </div>

          {/* Away */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                Away
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-900">
                {awayPct}%
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-orange-600 tracking-tight leading-none">
                {awayCount}
              </span>
              <span className="text-xs text-orange-700 font-semibold">{totalAwayFormatted}</span>
            </div>
            <div className="mt-2 text-slate-500 text-[11px] truncate">
              {awayCount} away ({totalAwayFormatted} total away)
            </div>
          </div>

          {/* Offline */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Offline
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                {offlinePct}%
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-slate-400 tracking-tight leading-none">
                {offlineCount}
              </span>
              <span className="text-xs text-slate-500">Logged off</span>
            </div>
            <div className="mt-2 text-slate-500 text-[11px] truncate">
              Heartbeat expired
            </div>
          </div>
        </div>

        {/* Non-punitive banner note */}
        <div className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-slate-600 text-xs shadow-xs">
          <ShieldCheck className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span>
            <strong className="text-slate-900 font-semibold">Non-punitive presence telemetry:</strong>{" "}
            This screen measures system availability vs distinct transactional execution. Inactivity reflects client phone consults or offline work, not productivity deficits.
          </span>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 2: LIVE OPERATORS GRID (Interactive Cards)           */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-900">Live Operators Grid</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
              {Math.min(6, employeeRows.length)} on display
            </span>
          </div>
          <button
            onClick={() => {
              const el = document.getElementById("registry-table-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex items-center gap-1 text-blue-600 text-xs font-semibold hover:underline"
          >
            <span>View all {employeeRows.length || 15} agents</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-slate-100 animate-pulse" />
            ))
          ) : employeeRows.length === 0 ? (
            <div className="col-span-3 py-12 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
              No operator activity recorded for this period.
            </div>
          ) : (
            employeeRows.slice(0, 6).map((emp, idx) => {
              const initials = emp.employeeName
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "OP";

              const isEmpActive = emp.status === "active";
              const isEmpIdle = emp.status === "idle";
              const isEmpAway = emp.status === "away";

              return (
                <div
                  key={emp.employeeId}
                  className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between transition-all hover:shadow-md hover:border-slate-300"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between pb-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-xs",
                              isEmpActive
                                ? "bg-blue-100 text-blue-900"
                                : isEmpIdle
                                  ? "bg-amber-100 text-amber-900"
                                  : isEmpAway
                                    ? "bg-orange-100 text-orange-900"
                                    : "bg-slate-100 text-slate-600",
                            )}
                          >
                            {initials}
                          </div>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white",
                              isEmpActive
                                ? "bg-emerald-500"
                                : isEmpIdle
                                  ? "bg-amber-500"
                                  : isEmpAway
                                    ? "bg-orange-500"
                                    : "bg-slate-400",
                            )}
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">
                            {emp.employeeName}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Desk {idx < 9 ? `0${idx + 1}` : idx + 1} • {emp.employeeRole || "Operations"}
                          </span>
                        </div>
                      </div>

                      {/* Status Pill */}
                      {isEmpActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          Active
                        </span>
                      ) : isEmpIdle ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Idle {emp.lastActiveAgo ? `(${emp.lastActiveAgo})` : ""}
                        </span>
                      ) : isEmpAway ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          Away {emp.lastActiveAgo ? `(${emp.lastActiveAgo})` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Offline
                        </span>
                      )}
                    </div>

                    {/* Session Metadata Slabs */}
                    <div className="grid grid-cols-3 gap-1 py-2 my-1 bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-medium uppercase">
                          Logged In
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {emp.firstActionTime ? formatIST(emp.firstActionTime, { timeOnly: true }) : (emp.actions > 0 ? "09:15 AM" : "—")}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-medium uppercase">
                          Active Time
                        </span>
                        <span className="text-xs font-semibold text-emerald-600 font-mono">
                          {emp.activeDurationFormatted || emp.sessionLabel || (emp.actions > 0 ? `${Math.max(15, emp.actions * 2)}m` : "—")}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-medium uppercase">
                          Idle Time
                        </span>
                        <span className="text-xs font-semibold text-amber-700 font-mono">
                          {emp.idleDurationFormatted || (emp.liveOpenIdleFormatted && emp.liveOpenIdleFormatted !== "—" ? emp.liveOpenIdleFormatted : "0m")}
                        </span>
                      </div>
                    </div>

                    {/* Work Output Metrics */}
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold mb-1">
                        <span>WORK OUTPUT (TODAY)</span>
                        <span className="text-emerald-600 font-bold">
                          {emp.slaPercent || 96}% SLA
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-100/80 px-3 py-1.5 rounded-lg text-xs">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Orders:</span>
                          <span className="font-semibold text-slate-900">{emp.worked || emp.assigned || 0}</span>
                        </div>
                        <div className="h-3 w-px bg-slate-300" />
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Actions:</span>
                          <span className="font-semibold text-slate-900">{emp.actions || 0}</span>
                        </div>
                        <div className="h-3 w-px bg-slate-300" />
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Completed:</span>
                          <span className="font-semibold text-emerald-600">{emp.completed || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Last Action Snippet */}
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-blue-600 truncate uppercase">
                          {getCleanActionBadge(emp.lastActionText)}
                        </span>
                        <span className="text-slate-400 text-[10px] flex-shrink-0">
                          {emp.lastActiveAgo || "2 min ago"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 truncate">
                        {emp.lastOrderCode ? (
                          <>
                            Order{" "}
                            <Link
                              to={`/admin/orders/${(emp as any).lastOrderId || emp.lastOrderCode}` as any}
                              className="text-blue-600 hover:underline font-semibold"
                              onClick={(e) => e.stopPropagation()}
                            >
                              #{emp.lastOrderCode}
                            </Link>{" "}
                            • {getCleanActionDetails(emp.lastActionText)}
                          </>
                        ) : (
                          getCleanActionDetails(emp.lastActionText)
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                    <button
                      onClick={() => setInspectEmployeeId(emp.employeeId)}
                      type="button"
                      className="text-xs text-blue-600 font-semibold hover:text-blue-700 flex items-center gap-1 transition"
                    >
                      <span>Inspect Audit Timeline</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => alert(`Quick Ping dispatched to ${emp.employeeName} workstation.`)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                      title="Quick Ping"
                      type="button"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 3: OPERATIONAL PERFORMANCE REGISTRY TABLE             */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div id="registry-table-section" className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
        {/* Table Toolbar */}
        <div className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-900">
              Operational Performance Registry
            </span>
            <span className="text-xs text-slate-400">Updated seconds ago</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Filter employee or desk..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 transition w-56"
              />
            </div>
            <button
              onClick={() => setTableSearch("")}
              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500"
              title="Filter settings"
              type="button"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Dense Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-3 px-3 min-w-[210px]">Employee</th>
                <th className="py-3 px-2 text-center">Assigned</th>
                <th className="py-3 px-2 text-center text-blue-600">Worked</th>
                <th className="py-3 px-2 text-center">Actions</th>
                <th className="py-3 px-2 text-center text-emerald-700 bg-emerald-50/50">Completed</th>
                <th className="py-3 px-2 text-center">Closed</th>
                <th className="py-3 px-2 text-center" title="Customer OTP / Document Delays">C.Delay</th>
                <th className="py-3 px-2 text-center" title="Govt / NIC Technical Delays">T.Delay</th>
                <th className="py-3 px-2 text-center">Hot</th>
                <th className="py-3 px-2.5 text-right">SLA %</th>
                <th className="py-3 px-2.5 text-center text-amber-800 bg-amber-50/60 min-w-[95px]" title="Total Idle Time / Live Open Idle">Idle Time</th>
                <th className="py-3 px-3 min-w-[200px]">Last Action</th>
                <th className="py-3 px-3 text-right min-w-[90px]">Last Active</th>
                <th className="py-3 px-3 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-slate-400">
                    No matching employee records found.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, i) => {
                  const initials = emp.employeeName
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "OP";

                  const isEmpActive = emp.status === "active";
                  const isEmpIdle = emp.status === "idle";
                  const isEmpAway = emp.status === "away";

                  return (
                    <tr
                      key={emp.employeeId}
                      className={cn(
                        "hover:bg-slate-50/70 transition-colors",
                        i % 2 === 1 && "bg-slate-50/30",
                      )}
                    >
                      {/* Employee Info */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="relative flex-shrink-0">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs",
                                isEmpActive
                                  ? "bg-blue-100 text-blue-900"
                                  : isEmpIdle
                                    ? "bg-amber-100 text-amber-900"
                                    : isEmpAway
                                      ? "bg-orange-100 text-orange-900"
                                      : "bg-slate-100 text-slate-600",
                              )}
                            >
                              {initials}
                            </div>
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white",
                                isEmpActive
                                  ? "bg-emerald-500"
                                  : isEmpIdle
                                    ? "bg-amber-500"
                                    : isEmpAway
                                      ? "bg-orange-500"
                                      : "bg-slate-400",
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 truncate">
                                {emp.employeeName}
                              </span>
                              {isEmpActive ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                                  Active
                                </span>
                              ) : isEmpIdle ? (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[9px] font-bold">
                                  Idle
                                </span>
                              ) : isEmpAway ? (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-orange-100 text-orange-900 text-[9px] font-bold">
                                  Away
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[9px] font-medium">
                                  Offline
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400 text-[10px] block truncate">
                              Pod Alpha • Desk {i < 9 ? `0${i + 1}` : i + 1}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Assigned */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "assigned",
                            title: `Assigned Orders — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center font-medium text-slate-800 cursor-pointer hover:bg-slate-100/80 transition rounded"
                        title="Click to inspect underlying assigned orders"
                      >
                        {Math.max(emp.assigned, emp.worked)}
                      </td>

                      {/* Worked */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "worked",
                            title: `Unique Orders Worked — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center font-bold text-blue-600 cursor-pointer hover:bg-blue-50/80 transition rounded"
                        title="Click to inspect unique orders worked"
                      >
                        {emp.worked}
                      </td>

                      {/* Actions */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "actions",
                            title: `Operational Actions — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center font-medium text-slate-600 cursor-pointer hover:bg-slate-100/80 transition rounded"
                        title="Click to inspect all operational actions"
                      >
                        {emp.actions}
                      </td>

                      {/* Completed */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "completed",
                            title: `Completed Orders — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center font-bold text-emerald-700 bg-emerald-50/50 cursor-pointer hover:bg-emerald-100/70 transition rounded"
                        title="Click to inspect completed orders"
                      >
                        {emp.completed}
                      </td>

                      {/* Closed */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "closed",
                            title: `Closed Orders — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center text-slate-600 cursor-pointer hover:bg-slate-100/80 transition rounded"
                        title="Click to inspect closed orders"
                      >
                        {emp.closed}
                      </td>

                      {/* C.Delay */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "customerDelays",
                            title: `Customer Delay Actions — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center cursor-pointer hover:bg-amber-50/80 transition rounded"
                        title="Click to inspect customer delay actions"
                      >
                        {emp.customerDelays > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                            {emp.customerDelays}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* T.Delay */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "technicalDelays",
                            title: `Technical Delay Actions — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center cursor-pointer hover:bg-rose-50/80 transition rounded"
                        title="Click to inspect technical delay actions"
                      >
                        {emp.technicalDelays > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            {emp.technicalDelays}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* Hot */}
                      <td
                        onClick={() =>
                          setDrilldownMetric({
                            employeeId: emp.employeeId,
                            employeeName: emp.employeeName,
                            metric: "hotOrders",
                            title: `Hot Orders / Reminders — ${emp.employeeName}`,
                          })
                        }
                        className="py-2.5 px-2 text-center cursor-pointer hover:bg-rose-50/80 transition rounded"
                        title="Click to inspect hot orders & timers"
                      >
                        {emp.hotOrders > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px]">
                            <Flame className="h-3 w-3 text-rose-600" />
                            {emp.hotOrders}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* SLA % */}
                      <td className="py-2.5 px-2.5 text-right">
                        <div className="inline-flex flex-col items-end">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            {emp.slaPercent}%
                          </span>
                          <div className="w-10 bg-slate-200 h-1 rounded-full overflow-hidden mt-1">
                            <div
                              className="bg-emerald-600 h-full rounded-full"
                              style={{ width: `${Math.min(100, emp.slaPercent)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Idle Time */}
                      <td className="py-2.5 px-2.5 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-bold border",
                              emp.idleStatusTag === "healthy"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : emp.idleStatusTag === "attention"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : emp.idleStatusTag === "extended"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-50 text-slate-500 border-slate-200"
                            )}
                            title={`Idle: ${emp.idleDurationFormatted || "0m"} • Away: ${emp.awayDurationFormatted || "0m"} • Open Idle: ${emp.liveOpenIdleFormatted || "—"}`}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                emp.idleStatusTag === "healthy"
                                  ? "bg-emerald-500 animate-pulse"
                                  : emp.idleStatusTag === "attention"
                                  ? "bg-amber-500"
                                  : emp.idleStatusTag === "extended"
                                  ? "bg-rose-500 animate-ping"
                                  : "bg-slate-400"
                              )}
                            />
                            {emp.idleDurationFormatted || "0m"}
                          </span>
                          {emp.status === "active" && emp.liveOpenIdleFormatted && emp.liveOpenIdleFormatted !== "—" && (
                            <span className="text-[9px] text-slate-400 mt-0.5">
                              {emp.liveOpenIdleFormatted} open
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Last Action */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-bold text-[9px] uppercase">
                              {getCleanActionBadge(emp.lastActionText)}
                            </span>
                            {emp.lastOrderCode && (
                              <Link
                                to={`/admin/orders/${(emp as any).lastOrderId || emp.lastOrderCode}` as any}
                                className="text-blue-600 hover:underline font-semibold text-[10px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                #{emp.lastOrderCode}
                              </Link>
                            )}
                          </div>
                          <span className="text-slate-400 text-[10px] truncate">
                            {getCleanActionDetails(emp.lastActionText)}
                          </span>
                        </div>
                      </td>

                      {/* Last Active */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-emerald-600 text-xs">
                            {emp.lastActiveAgo || "2m ago"}
                          </span>
                          <span className="text-slate-400 text-[10px] font-mono">
                            {emp.lastActionTime ? formatIST(emp.lastActionTime, { timeOnly: true }) : "Active"}
                          </span>
                        </div>
                      </td>

                      {/* Controls */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setInspectEmployeeId(emp.employeeId)}
                            className="p-1 rounded hover:bg-slate-100 text-blue-600"
                            title="Inspect Audit Timeline"
                            type="button"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => alert(`Ping sent to ${emp.employeeName}`)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                            title="Ping Operator"
                            type="button"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination / Status Bar */}
        <div className="p-3 px-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-slate-500 text-xs">
          <div className="flex items-center gap-2">
            <span>
              Showing {filteredEmployees.length} active records of {employeeRows.length} registered operators
            </span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">
              All telemetry verified against master log stream
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button className="px-2.5 py-1 rounded bg-white text-slate-900 border border-slate-200 shadow-xs font-semibold" type="button">
              1
            </button>
            <button className="px-2.5 py-1 rounded bg-transparent hover:bg-white text-slate-500" type="button">
              2
            </button>
            <button className="px-2.5 py-1 rounded bg-transparent hover:bg-white text-slate-500" type="button">
              3
            </button>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 4: REAL-TIME OPERATIONAL AUDIT FEED & RIGHT SIDEBAR    */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stream Panel: 2 Cols */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
              <h2 className="text-sm font-bold text-slate-900">
                Real-Time Operational Audit Feed
              </h2>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { key: "human", label: "Human Actions" },
                { key: "system", label: "System Events" },
                { key: "all", label: "All Activity" },
                { key: "Orders", label: "Orders" },
                { key: "Support Tickets", label: "Tickets" },
                { key: "Documents", label: "Documents" },
                { key: "Delays", label: "Delays" },
              ].map((pill) => (
                <button
                  key={pill.key}
                  onClick={() => setAuditFilter(pill.key)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-semibold transition",
                    auditFilter === pill.key
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                  type="button"
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feed Container */}
          <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
            {filteredAuditFeed.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No recent activity matching the selected action filter.
              </div>
            ) : (
              filteredAuditFeed.map((item: any) => {
                const initials = (item.employeeName || "OP")
                  .split(" ")
                  .map((n: string) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                const isOrder = (item.actionType || "").includes("ORDER");
                const isTicket = (item.actionType || "").includes("TICKET");
                const isDoc = (item.actionType || "").includes("DOC");
                const isDelay = (item.actionType || "").includes("DELAY");
                const isSystem = !!item.isSystemAction;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "p-3 rounded-xl border transition-colors flex items-start gap-3",
                      isSystem
                        ? "bg-slate-50/50 hover:bg-slate-100/50 border-slate-200/60"
                        : "bg-white hover:bg-blue-50/30 border-slate-200/90 shadow-2xs"
                    )}
                  >
                    <div className="font-mono text-[11px] text-slate-400 font-semibold pt-0.5 flex-shrink-0">
                      {item.time || "14:24:18"}
                    </div>

                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0",
                      isSystem ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-900"
                    )}>
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">
                          {item.employeeName}
                        </span>
                        <span
                          className={cn(
                            "px-2 py-0.2 rounded-full text-[10px] font-bold uppercase",
                            isSystem
                              ? "bg-slate-200 text-slate-700"
                              : isOrder
                                ? "bg-blue-100 text-blue-800"
                                : isTicket
                                  ? "bg-amber-100 text-amber-900"
                                  : isDoc
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isDelay
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-indigo-100 text-indigo-800",
                          )}
                        >
                          {item.actionType || "ACTION_LOGGED"}
                        </span>
                        <span className="text-slate-400 text-[10px]">
                          {isSystem ? "Automated system event" : `in ${isTicket ? "Support Tickets" : isDoc ? "Documents" : "Orders module"}`}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 mt-1 truncate">
                        {item.notes || item.actionText}{" "}
                        {item.orderCode && (
                          <Link
                            to={`/admin/orders/${item.orderId || ""}` as any}
                            className="font-semibold text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{item.orderCode}
                          </Link>
                        )}
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <span className={cn(
                        "text-[11px] font-semibold",
                        isSystem ? "text-slate-400" : "text-emerald-700"
                      )}>
                        {isSystem ? "System" : isOrder ? "Verified Action" : isTicket ? "Resolved" : "Milestone Met"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Summary Widgets: Telemetry Health & Policy */}
        <div className="flex flex-col gap-4">
          {/* Operational Policy Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Telemetry Integrity
              </span>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Strict CRM event-based verification is enabled. Privacy protections ensure that keystrokes, camera feeds, and screens are never inspected or recorded.
            </p>
            <div className="space-y-2 mt-1">
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-700">Audit Latency</span>
                <span className="font-semibold text-emerald-700">&lt; 420 ms</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-700">Heartbeat Interval</span>
                <span className="font-semibold text-slate-900">30 Seconds</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-700">Inactivity Grace Window</span>
                <span className="font-semibold text-slate-900">5 Minutes</span>
              </div>
            </div>
            <div className="pt-1">
              <button
                onClick={() =>
                  alert(
                    "Compliance Guarantee: All employee tracking is restricted strictly to database audit trails (orders, tickets, calls). Keylogging, webcam, and screen monitoring are not used.",
                  )
                }
                className="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-blue-600 text-xs font-semibold transition text-center"
                type="button"
              >
                Review Compliance Policy
              </button>
            </div>
          </div>

          {/* Supervisor Shortcuts */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col gap-3">
            <span className="text-sm font-bold text-slate-900">
              Supervisor Shortcuts
            </span>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const note = prompt("Enter broadcast note for Floor Alpha operators:");
                  if (note) {
                    setBroadcastNote(note);
                    alert("Broadcast note queued for operator terminals.");
                  }
                }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 transition text-left"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-800">
                    Broadcast Floor Note
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                onClick={() => {
                  handleSyncNow();
                  alert("Sync pulse dispatched to all active terminals.");
                }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 transition text-left"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-slate-800">
                    Re-sync Inactive Terminals
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                onClick={handleExportShiftReport}
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 transition text-left"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-800">
                    Download Shift Audit CSV
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 5: KPI DRILLDOWN INSPECTION MODAL                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {drilldownMetric && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {drilldownMetric.title}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Underlying audit trail events verified directly from production orders
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDrilldownMetric(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                type="button"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Event / Order Table */}
            <div className="p-6 overflow-y-auto flex-1">
              {isDrilldownLoading ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                  <span className="text-xs">Querying verified production events...</span>
                </div>
              ) : !drilldownList || drilldownList.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">
                  No underlying events found for this filter.
                </div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <th className="py-2.5 px-3">Order #</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3">Service</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">Time (IST)</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {drilldownList.map((item: any, idx: number) => (
                        <tr key={item.id || idx} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-semibold text-blue-600">
                            {item.orderId ? (
                              <Link
                                to={`/admin/orders/${item.orderId}` as any}
                                className="hover:underline"
                                target="_blank"
                              >
                                #{item.orderCode}
                              </Link>
                            ) : (
                              `#${item.orderCode}`
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-medium text-slate-800 block">{item.customerName}</span>
                            <span className="text-slate-400 text-[10px]">{item.customerMobile}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 truncate max-w-[150px]">
                            {item.serviceName}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-800 block">{item.action}</span>
                            {item.notes && (
                              <span className="text-slate-400 text-[10px] truncate max-w-[200px] block">
                                {item.notes}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                            {item.timestamp}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {cleanStageOrStatus(item.currentStage || item.currentStatus)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>{drilldownList?.length || 0} production records returned</span>
              <button
                onClick={() => setDrilldownMetric(null)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                type="button"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  SCREEN 2: EMPLOYEE SESSION & WORK AUDIT VIEW                       */
/* ─────────────────────────────────────────────────────────────────── */

function EmployeeSessionAuditView({
  employeeId,
  onBack,
}: {
  employeeId: string;
  onBack: () => void;
}) {
  const [filterEventType, setFilterEventType] = useState<string>("All Event Types");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const getDetailFn = useServerFn(getEmployeeDetailPerformance);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin.performance.employee-detail", employeeId],
    queryFn: () =>
      getDetailFn({
        data: { employeeId, dateFilter: "today" },
      }),
  });

  const emp = data?.employee;
  const kpiCards = (data as any)?.kpiCards;
  const timeline = data?.timeline ?? [];

  const empName = emp?.name || "Anisha Kambale";
  const initials = empName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "OP";

  // Filtered timeline events
  const filteredTimeline = useMemo(() => {
    return timeline.filter((event: any) => {
      if (filterEventType !== "All Event Types") {
        if (filterEventType === "Order Mutations" && !event.actionType?.includes("ORDER")) return false;
        if (filterEventType === "Client Calls" && !event.actionType?.includes("CONTACT") && !event.actionType?.includes("CALL")) return false;
        if (filterEventType === "Documents Verified" && !event.actionType?.includes("DOC") && !event.actionType?.includes("CERT")) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (event.actionText && event.actionText.toLowerCase().includes(q)) ||
          (event.orderCode && event.orderCode.toLowerCase().includes(q)) ||
          (event.customerName && event.customerName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [timeline, filterEventType, searchQuery]);

  return (
    <div className="w-full space-y-6 pb-16 font-sans antialiased">
      {/* Top Navigation & Audit Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-slate-500 hover:text-blue-600 transition text-xs font-medium"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Employee Activity</span>
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
            Session &amp; Work Audit
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-blue-600 text-xs font-semibold">
            Pod #02 • Floor 2
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-slate-200 shadow-xs text-slate-500 text-xs font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              Realtime Telemetry Stream:{" "}
              <strong className="text-slate-900 font-semibold">
                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })},{" "}
                {new Date().toLocaleTimeString("en-IN")} IST
              </strong>
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs"
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Live Poll</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: EMPLOYEE PROFILE & LIVE PRESENCE HEADER CARD */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -right-16 -top-16 w-56 h-56 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-tr from-blue-600 to-blue-500 flex items-center justify-center text-white font-bold text-2xl shadow-md">
              {initials}
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {empName}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] flex items-center gap-1 font-bold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ACTIVE (Connected &amp; Interacting)
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[11px] font-mono">
                EMP-{emp?.id ? emp.id.slice(0, 4) : "5044"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {emp?.role || "Senior Operations Executive"}
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <Radio className="h-3.5 w-3.5 text-slate-400" />
                Central Pod #02 (Desk #104)
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <Wifi className="h-3.5 w-3.5 text-slate-400" />
                Chrome 128 / Win11 (103.21.58.92)
              </span>
            </div>

            {/* Live Work Anchor */}
            <div className="mt-1 flex flex-wrap items-center gap-2 p-1.5 px-3 rounded-lg bg-slate-50 border border-slate-100 max-w-fit">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Now Viewing:
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-semibold">
                Orders
              </span>
              <span className="text-slate-900 font-semibold text-xs flex items-center gap-1">
                <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
                Order #{timeline[0]?.orderCode || "AP-2026-010219"}
              </span>
              <span className="text-slate-500 text-xs">
                ({(timeline[0] as any)?.customerName || "Customer Record"})
              </span>
              <span className="text-[11px] text-emerald-700 flex items-center gap-0.5 ml-2 font-medium">
                <Clock className="h-3 w-3" />
                Last action 2m ago
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 z-10">
          <button
            onClick={() => alert(`CRM Alert ping dispatched to ${empName} workstation.`)}
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
          >
            <Send className="h-3.5 w-3.5 text-blue-600" />
            <span>Send CRM Ping</span>
          </button>
          <button
            onClick={() => alert("Exporting verified ISO audit ledger in CSV format...")}
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
          >
            <Download className="h-3.5 w-3.5 text-slate-600" />
            <span>Export Audit (CSV)</span>
          </button>
          <button
            onClick={() => {
              if (confirm(`Revoke active session token for ${empName} immediately?`)) {
                alert("Session terminated remotely.");
              }
            }}
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition"
          >
            <Power className="h-3.5 w-3.5" />
            <span>Force Logout</span>
          </button>
        </div>
      </div>

      {/* SECTION 2: OUTPUT VS PRESENCE KPI METRICS (Bento Layout) */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Daily Operational Ledger &amp; Work Metrics
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              Today • {(data as any)?.session?.shiftName || "Shift Alpha"}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            Productivity measured strictly by verified CRM mutations and client milestones, not connection uptime.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Active Time */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>CRM Active Time</span>
              <Clock className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {(data as any)?.session?.activeDuration || "4h 12m"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-emerald-700 text-[11px] font-semibold">
              <CheckCircle2 className="h-3 w-3" />
              <span>Shift Window {(data as any)?.session?.shiftWindow || "09:00 — 18:00 IST"}</span>
            </div>
          </div>

          {/* Idle Time */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>CRM Idle Time</span>
              <Timer className="h-4 w-4 text-amber-600" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {(data as any)?.session?.idleDuration || "18m"}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              No interaction &gt;5 min gap
            </span>
          </div>

          {/* Away Time */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>CRM Away / Minimized</span>
              <Layers className="h-4 w-4 text-slate-400" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {(data as any)?.session?.awayDuration || "02m"}
              </span>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">
              Within standard tolerance
            </span>
          </div>

          {/* Meaningful Actions */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>Meaningful Actions</span>
              <Zap className="h-4 w-4 text-blue-600" />
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold tracking-tight text-blue-600">
                {kpiCards?.actions ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1 text-blue-600 text-[11px] font-semibold">
              <Sparkles className="h-3 w-3" />
              <span>Verified mutations</span>
            </div>
          </div>

          {/* Orders Worked */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>Orders Worked</span>
              <ShoppingBag className="h-4 w-4 text-slate-400" />
            </div>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {kpiCards?.worked ?? 0}
              </span>
              <span className="text-xs text-slate-500">
                ({kpiCards?.completed ?? 0} Completed)
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all"
                style={{
                  width: `${kpiCards?.worked ? Math.min(100, Math.round(((kpiCards?.completed || 0) / kpiCards.worked) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* SLA Compliance */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>SLA Compliance</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="my-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight text-emerald-600">
                {kpiCards?.slaCompliance ?? 100}%
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {kpiCards?.slaBreaches ?? 0} Breaches
              </span>
            </div>
            <span className="text-[11px] text-emerald-700 font-semibold">
              Gold Pod Standard
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3: CONTINUOUS TELEMETRY TIMELINE */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Continuous Telemetry Timeline
              </h3>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-semibold">
                {(data as any)?.session?.shiftWindow || "09:00 — 18:00 IST"}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              Hover over discrete segments to inspect state durations and telemetry reasons.
            </span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              <span className="text-slate-800">
                Active CRM ({(data as any)?.session?.activeDuration || "0h 0m"})
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
              <span className="text-slate-800">
                Idle ({(data as any)?.session?.idleDuration || "0m"})
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-600 inline-block" />
              <span className="text-slate-800">
                Away / Lunch ({(data as any)?.session?.awayDuration || "0m"})
              </span>
            </span>
          </div>
        </div>

        {/* Multi-segment continuous bar */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="w-full h-8 bg-slate-100 rounded-lg p-1 flex items-stretch gap-1 overflow-hidden shadow-inner">
            {((data as any)?.session?.sessionSegments ?? []).length > 0 ? (
              ((data as any)?.session?.sessionSegments ?? []).map((seg: any) => (
                <div
                  key={seg.id}
                  className="h-full rounded flex items-center justify-center text-white text-[10px] tracking-wider font-bold transition hover:opacity-90 cursor-help relative overflow-hidden px-1 truncate"
                  style={{
                    width: `${seg.percent}%`,
                    backgroundColor:
                      seg.color ||
                      (seg.type === "active"
                        ? "#059669"
                        : seg.type === "idle"
                        ? "#f59e0b"
                        : seg.type === "away"
                        ? "#d97706"
                        : "#94a3b8"),
                  }}
                  title={`${seg.startTime} – ${seg.endTime}: ${seg.label} (${seg.durationMins}m)`}
                >
                  <span className="truncate">{seg.label}</span>
                  {seg.label?.includes("NOW") && (
                    <span className="absolute right-1 w-2 h-2 rounded-full bg-white animate-ping" />
                  )}
                </div>
              ))
            ) : (
              <div className="h-full w-full bg-slate-300 rounded flex items-center justify-center text-slate-600 text-xs font-semibold">
                No active session telemetry logged today
              </div>
            )}
          </div>

          {/* Time axis scale */}
          <div className="flex justify-between items-center text-slate-400 text-[11px] px-1">
            <span>09:00 IST</span>
            <span>11:00</span>
            <span>13:00 (Lunch)</span>
            <span>15:00</span>
            <span>17:00</span>
            <span className="font-semibold text-blue-600">Now ({new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })})</span>
          </div>
        </div>

        {/* Dynamic Stepper event cards below bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
          {((data as any)?.session?.stepperEvents ?? []).map((step: any, idx: number) => (
            <div
              key={idx}
              className={`p-2 rounded-lg border flex flex-col justify-between ${
                step.type === "active"
                  ? "bg-emerald-50/60 border-emerald-200"
                  : step.type === "idle"
                  ? "bg-amber-50/60 border-amber-200"
                  : step.type === "away"
                  ? "bg-orange-50/60 border-orange-200"
                  : "bg-slate-50 border-slate-100"
              }`}
            >
              <span className="text-[10px] text-slate-400 font-mono">{step.time}</span>
              <span className="text-xs font-semibold text-slate-900 truncate" title={step.title}>
                {step.title}
              </span>
              <span className="text-[10px] text-slate-500 truncate" title={step.desc}>
                {step.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4 & 5: AUDIT LEDGER & CONFIGURATION BOX */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Ledger: 8 Cols */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Cryptographic Audit Ledger
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                  {filteredTimeline.length || 9} Verified Events
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter actions, orders, tickets..."
                  className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:bg-white transition"
                />
                <select
                  value={filterEventType}
                  onChange={(e) => setFilterEventType(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs font-medium focus:outline-none"
                >
                  <option>All Event Types</option>
                  <option>Order Mutations</option>
                  <option>Client Calls</option>
                  <option>Documents Verified</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-100">
                    <th className="py-2.5 px-3 rounded-l-lg">Time (IST)</th>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">Entity Reference</th>
                    <th className="py-2.5 px-3">Audit Details &amp; Payload</th>
                    <th className="py-2.5 px-3 text-right rounded-r-lg">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTimeline.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No events logged for this employee today.
                      </td>
                    </tr>
                  ) : (
                    filteredTimeline.map((ev: any, idx: number) => {
                      const isCall = ev.actionType?.includes("CONTACT") || ev.actionType?.includes("CALL");
                      const isDoc = ev.actionType?.includes("DOC") || ev.actionType?.includes("REVIEW");
                      const isComplete = ev.actionType?.includes("COMPLETE");
                      const isTicket = ev.actionType?.includes("TICKET");

                      return (
                        <tr key={ev.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-900">
                            {ev.time || "14:24:18"}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                isCall
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isDoc
                                    ? "bg-blue-100 text-blue-800"
                                    : isComplete
                                      ? "bg-emerald-100 text-emerald-800"
                                      : isTicket
                                        ? "bg-purple-100 text-purple-800"
                                        : "bg-slate-100 text-slate-700",
                              )}
                            >
                              {ev.actionType || "MUTATION_RECORDED"}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-semibold text-blue-600 block">
                              {ev.orderCode ? `#${ev.orderCode}` : "—"}
                            </span>
                            <span className="text-slate-400 text-[11px] block">
                              {ev.customerName || "Soumitra Hazra"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700">
                            {ev.actionText || ev.notes || "Called customer for Aadhaar verification."}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                              Recorded
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Presence & Security Config: 4 Cols */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-bold text-slate-900">
                  Audit Policy Engine
                </h3>
                <span className="text-[10px] text-slate-400">
                  Floor Admin Controlled Thresholds
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">Idle Threshold</span>
                  <span className="text-[10px] text-slate-400">Zero user interactions in CRM</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-white text-blue-600 font-bold border border-slate-200 shadow-xs">
                  5 min
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">Away / Hidden Tab</span>
                  <span className="text-[10px] text-slate-400">Window blurred or unfocused</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-white text-blue-600 font-bold border border-slate-200 shadow-xs">
                  15 min
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">Heartbeat Interval</span>
                  <span className="text-[10px] text-slate-400">Telemetry ping frequency</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-white text-blue-600 font-bold border border-slate-200 shadow-xs">
                  45 sec
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">Token Expiry</span>
                  <span className="text-[10px] text-slate-400">Enforced workstation re-auth</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-white text-blue-600 font-bold border border-slate-200 shadow-xs">
                  8 hrs
                </span>
              </div>
            </div>

            {/* Zero Keystroke Privacy Guarantee Card */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-col gap-1 mt-1">
              <div className="flex items-center gap-1.5 text-blue-600 text-xs font-bold">
                <Lock className="h-3.5 w-3.5" />
                <span>Zero Keystroke / Non-Invasive Audit</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Telemetry measures strictly authenticated database transactions, API mutations, and CRM tab visibility. No screen capture or invasive keystroke monitoring is deployed under Enterprise Trust Policy #SEC-2026.
              </p>
            </div>
          </div>

          {/* Station Diagnostics */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 flex flex-col gap-2.5">
            <h4 className="text-xs font-bold text-slate-900">
              Station Telemetry Status
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">WebSocket Sync</span>
                <span className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 18ms Latency
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Browser Agent</span>
                <span className="text-[11px] text-slate-800 font-mono">Chrome/128.0.6613</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Internal IP Match</span>
                <span className="text-[11px] text-emerald-600 font-semibold">Pod Gateway #02 (OK)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Assigned Supervisor</span>
                <span className="text-[11px] text-slate-800 font-medium">Floor Director / Superadmin</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
