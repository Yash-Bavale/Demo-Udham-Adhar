import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  UserCog, UserPlus, Pencil, Search, ShieldCheck,
  Archive, RotateCcw, AlertTriangle, Users, Shuffle, CalendarOff,
  Activity, Zap, KeyRound, Eye, EyeOff, Copy, Check, Power,
} from "lucide-react";
import { toast } from "sonner";
import {
  listStaffUsers,
  getWorkforceDashboardMetrics,
  inviteEmployee,
  updateEmployee,
  setEmploymentStatus,
  toggleEmployeeAutoAssign,
  archiveEmployee,
  deleteEmployee,
  resetEmployeePassword,
  getEmployeeWorkAccess,
  setEmployeeWorkAccess,
} from "@/lib/crm/users-admin.functions";

import { ASSIGNABLE_ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { useRole } from "@/hooks/useRole";
import { SectionCard } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AssignmentManagementView } from "@/components/admin/reassignment/AssignmentManagementView";
import { LeadAssignmentTab } from "@/components/admin/LeadAssignmentTab";

export const Route = createFileRoute("/admin/employees")({
  head: () => ({ meta: [{ title: "Workforce Management — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: WorkforcePage,
});

type RoleColorMap = Record<string, string>;
const ROLE_COLOR: RoleColorMap = {
  super_admin: "#b91c1c",
  admin: "#1d4ed8",
  manager: "#7c3aed",
  executive: "#0891b2",
  support: "#d97706",
  accounts: "#059669",
  finance: "#16a34a",
  operations: "#0ea5e9",
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLOR[role] ?? "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${c}1a`, color: c }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {ROLE_LABELS[role as Role] ?? role.replace(/_/g, " ")}
    </span>
  );
}

function EmploymentStatusBadge({ status }: { status: string }) {
  let bg = "bg-slate-100 text-slate-700 border-slate-200";
  let dot = "bg-slate-400";
  if (status === "ACTIVE") {
    bg = "bg-emerald-50 text-emerald-700 border-emerald-200";
    dot = "bg-emerald-500";
  } else if (status === "INACTIVE" || status === "SUSPENDED") {
    bg = "bg-amber-50 text-amber-700 border-amber-200";
    dot = "bg-amber-500";
  } else if (status === "ARCHIVED" || status === "TERMINATED") {
    bg = "bg-rose-50 text-rose-700 border-rose-200";
    dot = "bg-rose-500";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${bg}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

function formatIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
      timeZone: "Asia/Kolkata",
    }).formatToParts(d);
    const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  } catch { return "—"; }
}

function WorkforcePage() {
  const role = useRole();
  const qc = useQueryClient();
  const listFn = useServerFn(listStaffUsers);
  const metricsFn = useServerFn(getWorkforceDashboardMetrics);
  const archiveFn = useServerFn(archiveEmployee);
  const deleteFn = useServerFn(deleteEmployee);
  const setStatusFn = useServerFn(setEmploymentStatus);

  const { data, isLoading } = useQuery({ queryKey: ["admin.workforce.users"], queryFn: () => listFn() });
  const { data: metricsData } = useQuery({ queryKey: ["admin.workforce.metrics"], queryFn: () => metricsFn() });

  const [query, setQuery] = useState("");
  const rows = data?.rows ?? [];

  // Filter into discrete lifecycle tabs
  const activeWorkforce = useMemo(() => {
    return rows.filter((r: any) => r.employment_status === "ACTIVE" && r.is_active);
  }, [rows]);

  const poolMembers = useMemo(() => {
    return rows.filter((r: any) => r.is_in_pool || r.auto_assign_enabled);
  }, [rows]);

  const onLeaveOrUnavailable = useMemo(() => {
    return rows.filter((r: any) => r.is_on_leave || !r.is_active || r.employment_status === "SUSPENDED");
  }, [rows]);

  const archivedOrInactive = useMemo(() => {
    return rows.filter((r: any) => r.employment_status === "ARCHIVED" || r.employment_status === "TERMINATED" || r.employment_status === "INACTIVE");
  }, [rows]);

  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [archiveRow, setArchiveRow] = useState<any | null>(null);
  const [deleteRow, setDeleteRow] = useState<any | null>(null);
  const [resetPwRow, setResetPwRow] = useState<any | null>(null);
  const [accessRow, setAccessRow] = useState<any | null>(null);

  const canManage = role.access("employees") === "full";
  const canSee = role.access("employees") !== "none";
  const isSuper = role.has("super_admin");

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin.workforce.users"] }),
      qc.invalidateQueries({ queryKey: ["admin.workforce.metrics"] }),
      qc.invalidateQueries({ queryKey: ["admin.employees"] }),
      qc.invalidateQueries({ queryKey: ["admin.assignment.metrics"] }),
    ]);
  };

  if (!role.loading && !canSee) {
    return (
      <SectionCard>
        <div className="p-8 text-center">
          <UserCog className="size-10 mx-auto mb-3" style={{ color: "var(--admin-fg-subtle)" }} />
          <div className="text-sm font-medium">You don't have access to Workforce Management.</div>
          <div className="text-xs mt-1" style={{ color: "var(--admin-fg-muted)" }}>
            Ask a super admin to grant you access.
          </div>
        </div>
      </SectionCard>
    );
  }

  const m = metricsData?.workforce || { total: 0, active: 0, onLeave: 0, available: 0, idle: 0, away: 0, offline: 0, inactive: 0 };
  const p = metricsData?.pool || { totalMembers: 0, available: 0, unavailable: 0, totalCapacity: 0, usedCapacity: 0, remainingCapacity: 0 };
  const t = metricsData?.today || { autoAssignedToday: 0, autoReassignedToday: 0, unassignedOrders: 0 };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="size-6 text-indigo-600" /> Workforce & Assignment Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative source for employee lifecycle, live availability, assignment pool, capacity, and workload balancing.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs">
            <UserPlus className="size-4" /> Add Employee
          </Button>
        )}
      </div>

      {/* SuperAdmin Live Operational Overview Dashboard Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Workforce</span>
            <Users className="size-3.5 text-slate-400" />
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{m.active}</div>
          <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{m.total} total accounts</div>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center justify-between">
            <span>Available</span>
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xl font-black text-emerald-950 mt-1">{m.available}</div>
          <div className="text-[10px] text-emerald-700/80 font-medium truncate mt-0.5">Online & active</div>
        </div>

        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center justify-between">
            <span>On Leave / Away</span>
            <CalendarOff className="size-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-950 mt-1">{m.onLeave + m.idle + m.away}</div>
          <div className="text-[10px] text-amber-700/80 font-medium truncate mt-0.5">{m.onLeave} scheduled leave</div>
        </div>

        <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center justify-between">
            <span>Auto Pool</span>
            <Shuffle className="size-3.5 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-indigo-950 mt-1">{p.available}</div>
          <div className="text-[10px] text-indigo-700/80 font-medium truncate mt-0.5">{p.totalMembers} in pool config</div>
        </div>

        <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 flex items-center justify-between">
            <span>Capacity</span>
            <Activity className="size-3.5 text-sky-600" />
          </div>
          <div className="text-xl font-black text-sky-950 mt-1">{p.usedCapacity} <span className="text-xs font-semibold text-sky-700">/ {p.totalCapacity}</span></div>
          <div className="text-[10px] text-sky-700/80 font-medium truncate mt-0.5">{p.remainingCapacity} slots remaining</div>
        </div>

        <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center justify-between">
            <span>Assigned Today</span>
            <Zap className="size-3.5 text-purple-600" />
          </div>
          <div className="text-xl font-black text-purple-950 mt-1">{t.autoAssignedToday + t.autoReassignedToday}</div>
          <div className="text-[10px] text-purple-700/80 font-medium truncate mt-0.5">{t.autoReassignedToday} auto-reassigned</div>
        </div>
      </div>

      {/* 5 Distinct Workforce Tabs */}
      <Tabs defaultValue="workforce" className="w-full">
        <TabsList className="bg-slate-100 p-1 border border-slate-200 rounded-xl flex flex-wrap gap-1">
          <TabsTrigger value="workforce" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs">
            🏢 Active Workforce ({activeWorkforce.length})
          </TabsTrigger>
          <TabsTrigger value="pool" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs">
            ⚖️ Assignment Pool ({poolMembers.length})
          </TabsTrigger>
          <TabsTrigger value="leaves" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs">
            🌴 On Leave / Reassignment ({onLeaveOrUnavailable.length})
          </TabsTrigger>
          <TabsTrigger value="performance" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs">
            📊 Workload & Performance
          </TabsTrigger>
          <TabsTrigger value="archived" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs text-slate-500">
            📦 Inactive / Archived ({archivedOrInactive.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ACTIVE WORKFORCE */}
        <TabsContent value="workforce" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative max-w-md flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search active employees by name, email, mobile, role…"
                className="pl-9 text-xs bg-white"
              />
            </div>
          </div>

          <SectionCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                    <th className="px-4 py-2.5">Emp ID</th>
                    <th className="px-4 py-2.5">Name & Email</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Department</th>
                    <th className="px-4 py-2.5">Auto Pool</th>
                    <th className="px-4 py-2.5">Capacity</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">Loading workforce records…</td></tr>
                  )}
                  {!isLoading && activeWorkforce.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No active employees found.</td></tr>
                  )}
                  {activeWorkforce
                    .filter((u: any) => !query || (u.full_name || "").toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()))
                    .map((u: any) => (
                      <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-600">
                          {u.employee_code || "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{u.full_name || "—"}</span>
                            {u.smartflo_agent_id && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200" title={`CallerDesk Member ID: ${u.smartflo_agent_id}`}>
                                CD {u.smartflo_agent_id}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r: string) => <RoleBadge key={r} role={r} />)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{u.department || "General"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${u.auto_assign_enabled ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-slate-100 text-slate-500"}`}>
                            {u.auto_assign_enabled ? "POOL ON" : "OFF"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">
                          {u.max_workload} max
                        </td>
                        <td className="px-4 py-2.5">
                          {u.is_on_leave ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              🌴 ON LEAVE
                            </span>
                          ) : (
                            <EmploymentStatusBadge status={u.employment_status} />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            {canManage && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setEditRow(u)}>
                                <Pencil className="size-3.5 text-slate-500" /> Edit
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-purple-600 gap-1" onClick={() => setAccessRow(u)}>
                                <ShieldCheck className="size-3.5" /> Work Access
                              </Button>
                            )}
                            {isSuper && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-600 gap-1" onClick={() => setResetPwRow(u)}>
                                <KeyRound className="size-3.5" /> Password
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600 gap-1" onClick={() => setArchiveRow(u)}>
                                <Archive className="size-3.5" /> Archive
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        {/* TAB 2: ASSIGNMENT POOL MANAGEMENT */}
        <TabsContent value="pool" className="mt-4">
          <LeadAssignmentTab />
        </TabsContent>

        {/* TAB 3: LEAVES & REASSIGNMENT */}
        <TabsContent value="leaves" className="mt-4">
          <AssignmentManagementView />
        </TabsContent>

        {/* TAB 4: WORKLOAD & PERFORMANCE */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          <SectionCard>
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900">Workforce Workload & Capacity Utilization</h3>
              <p className="text-xs text-slate-500 mt-0.5">Live view of effective weighted workloads, hot orders, and turnaround metrics.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Auto Pool</th>
                    <th className="px-4 py-2.5">Live Presence</th>
                    <th className="px-4 py-2.5">Active Action Orders</th>
                    <th className="px-4 py-2.5">Hot Orders</th>
                    <th className="px-4 py-2.5">Weighted Workload</th>
                    <th className="px-4 py-2.5">Capacity Remaining</th>
                    <th className="px-4 py-2.5">Avg Turnaround</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(metricsData?.workloads ?? []).map((w: any) => (
                    <tr key={w.employeeId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">{w.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{w.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${w.isAutoAssignEligible ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"}`}>
                          {w.isAutoAssignEligible ? "ELIGIBLE" : "INELIGIBLE"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-semibold text-slate-700">{w.presenceStatus}</span>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-900">{w.activeActionOrders}</td>
                      <td className="px-4 py-2.5">
                        {w.hotOrders > 0 ? (
                          <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            {w.hotOrders} Hot
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-indigo-600">{w.effectiveWorkload}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{w.remainingCapacity} / {w.maxWorkload}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        {w.perf?.avgTurnaroundHours ? `${w.perf.avgTurnaroundHours}h` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        {/* TAB 5: INACTIVE / ARCHIVED (HISTORICAL RECORDS PRESERVED) */}
        <TabsContent value="archived" className="space-y-4 mt-4">
          <SectionCard>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Archived & Inactive Employees</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Historical staff accounts are safely preserved to maintain foreign keys, audit logs, and past order history.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                    <th className="px-4 py-2.5">Name & Email</th>
                    <th className="px-4 py-2.5">Past Role</th>
                    <th className="px-4 py-2.5">Employment Status</th>
                    <th className="px-4 py-2.5">Archived Date</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {archivedOrInactive.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">No archived employees.</td></tr>
                  )}
                  {archivedOrInactive.map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-700">{u.full_name || "—"}</div>
                        <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r: string) => <RoleBadge key={r} role={r} />)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <EmploymentStatusBadge status={u.employment_status} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {formatIST(u.archived_at || u.terminated_at || u.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {canManage && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              onClick={async () => {
                                try {
                                  await setStatusFn({
                                    data: { user_id: u.id, status: "ACTIVE", reason: "Restored from archive by Admin" },
                                  });
                                  toast.success(`Restored ${u.full_name || u.email} to Active Workforce`);
                                  await refreshAll();
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              <RotateCcw className="size-3.5" /> Restore to Active
                            </Button>
                          )}
                          {isSuper && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-rose-600 gap-1 hover:bg-rose-50"
                              onClick={() => setDeleteRow(u)}
                            >
                              Delete Account
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* DIALOG: ADD EMPLOYEE */}
      <AddEmployeeModal open={addOpen} onOpenChange={setAddOpen} onCreated={refreshAll} />

      {/* DIALOG: EDIT EMPLOYEE */}
      {editRow && (
        <EditEmployeeModal row={editRow} open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)} onSaved={refreshAll} />
      )}

      {/* DIALOG: WORK ACCESS */}
      {accessRow && (
        <WorkAccessModal row={accessRow} open={!!accessRow} onOpenChange={(o) => !o && setAccessRow(null)} onSaved={refreshAll} />
      )}

      {/* DIALOG: RESET PASSWORD */}
      {resetPwRow && (
        <ResetPasswordModal row={resetPwRow} open={!!resetPwRow} onOpenChange={(o) => !o && setResetPwRow(null)} />
      )}

      {/* DIALOG: ARCHIVE EMPLOYEE */}
      {archiveRow && (
        <AlertDialog open={!!archiveRow} onOpenChange={(o) => !o && setArchiveRow(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Employee Account?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-xs text-slate-600">
                <p>
                  Archiving <strong>{archiveRow.full_name || archiveRow.email}</strong> will:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Remove them from the Active Workforce and Auto-Assignment Pool.</li>
                  <li>Automatically redistribute any currently pending action-required orders to eligible staff.</li>
                  <li><strong>Preserve all historical order assignments, completed orders, and audit logs.</strong></li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                onClick={async () => {
                  try {
                    await archiveFn({ data: { user_id: archiveRow.id, reason: "Archived by Admin" } });
                    toast.success(`Archived ${archiveRow.full_name || archiveRow.email}`);
                    setArchiveRow(null);
                    refreshAll();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Archive & Reassign Open Orders
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* DIALOG: SAFE DELETE */}
      {deleteRow && (
        <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently Delete Account?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-600">
                If <strong>{deleteRow.full_name || deleteRow.email}</strong> has historical orders, they will be safely archived instead to prevent breaking historical records.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                onClick={async () => {
                  try {
                    const res = await deleteFn({ data: { user_id: deleteRow.id } });
                    if (res.mode === "archived") {
                      toast.info(res.message);
                    } else {
                      toast.success("Account permanently deleted.");
                    }
                    setDeleteRow(null);
                    refreshAll();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Confirm Delete / Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// SUBMODALS
// ------------------------------------------------------------------------------------------------

function AddEmployeeModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const inviteFn = useServerFn(inviteEmployee);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [smartfloAgentId, setSmartfloAgentId] = useState("");
  const [role, setRole] = useState<Role>("executive");
  const [department, setDepartment] = useState("Operations");
  const [maxWorkload, setMaxWorkload] = useState(50);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await inviteFn({
        data: {
          full_name: fullName,
          email,
          mobile: mobile || null,
          smartflo_agent_id: smartfloAgentId || null,
          role,
          department,
          max_workload: maxWorkload,
          auto_assign_enabled: autoAssignEnabled,
        },
      });
      toast.success("Employee invited successfully!");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Add New Employee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <Label className="text-xs">Full Name</Label>
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Rahul Sharma" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Email Address</Label>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@company.com" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mobile Number</Label>
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 9876543210" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">CallerDesk Member ID (optional)</Label>
              <Input value={smartfloAgentId} onChange={(e) => setSmartfloAgentId(e.target.value)} placeholder="e.g. 122142 (blank = match by mobile)" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Operations" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Max Workload Capacity</Label>
              <Input type="number" min={5} max={200} value={maxWorkload} onChange={(e) => setMaxWorkload(Number(e.target.value))} className="mt-1" />
            </div>
            <div className="flex flex-col justify-end">
              <div className="flex items-center gap-2">
                <Switch checked={autoAssignEnabled} onCheckedChange={setAutoAssignEnabled} />
                <Label className="text-xs font-medium">Auto-Assign Pool</Label>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {busy ? "Saving…" : "Add Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditEmployeeModal({ row, open, onOpenChange, onSaved }: { row: any; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const updateFn = useServerFn(updateEmployee);
  const [fullName, setFullName] = useState(row.full_name || "");
  const [mobile, setMobile] = useState(row.mobile || "");
  const [smartfloAgentId, setSmartfloAgentId] = useState(row.smartflo_agent_id || "");
  const [role, setRole] = useState<Role>((row.roles[0] as Role) || "executive");
  const [department, setDepartment] = useState(row.department || "Operations");
  const [maxWorkload, setMaxWorkload] = useState(row.max_workload || 50);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(row.auto_assign_enabled ?? false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateFn({
        data: {
          user_id: row.id,
          full_name: fullName,
          mobile: mobile || null,
          smartflo_agent_id: smartfloAgentId || null,
          role,
          department,
          max_workload: maxWorkload,
          auto_assign_enabled: autoAssignEnabled,
        },
      });
      toast.success("Employee updated successfully!");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Edit Employee: {row.email}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <Label className="text-xs">Full Name</Label>
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mobile Number</Label>
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">CallerDesk Member ID (optional)</Label>
              <Input value={smartfloAgentId} onChange={(e) => setSmartfloAgentId(e.target.value)} placeholder="e.g. 122142 (blank = match by mobile)" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Max Workload Capacity</Label>
              <Input type="number" min={5} max={200} value={maxWorkload} onChange={(e) => setMaxWorkload(Number(e.target.value))} className="mt-1" />
            </div>
            <div className="flex flex-col justify-end">
              <div className="flex items-center gap-2">
                <Switch checked={autoAssignEnabled} onCheckedChange={setAutoAssignEnabled} />
                <Label className="text-xs font-medium">Auto-Assign Pool</Label>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {busy ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WorkAccessModal({ row, open, onOpenChange, onSaved }: { row: any; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const getFn = useServerFn(getEmployeeWorkAccess);
  const setFn = useServerFn(setEmployeeWorkAccess);
  const { data: accessData, isLoading } = useQuery({
    queryKey: ["admin.workaccess", row.id],
    queryFn: () => getFn({ data: { user_id: row.id } }),
    enabled: open,
  });

  const [leads, setLeads] = useState(false);
  const [orders, setOrders] = useState(false);
  const [support, setSupport] = useState(false);
  const [finance, setFinance] = useState(false);
  const [busy, setBusy] = useState(false);

  useMemo(() => {
    if (accessData?.permissions) {
      setLeads(!!accessData.permissions["work.leads"]);
      setOrders(!!accessData.permissions["work.orders"]);
      setSupport(!!accessData.permissions["work.support"]);
      setFinance(!!accessData.permissions["work.finance"]);
    }
  }, [accessData]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await setFn({
        data: {
          user_id: row.id,
          work: {
            "work.leads": leads,
            "work.orders": orders,
            "work.support": support,
            "work.finance": finance,
          },
          websites: [],
          services: [],
        },
      });
      toast.success("Work access permissions updated!");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Work Access: {row.full_name || row.email}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-6 text-center text-xs text-slate-500">Loading access rules…</div>
        ) : (
          <div className="space-y-3 text-xs py-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border">
              <div>
                <div className="font-semibold text-slate-900">Orders Module</div>
                <div className="text-slate-500 text-[11px]">Process & fulfill customer orders</div>
              </div>
              <Switch checked={orders} onCheckedChange={setOrders} />
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border">
              <div>
                <div className="font-semibold text-slate-900">Leads Module</div>
                <div className="text-slate-500 text-[11px]">Manage customer leads & follow-ups</div>
              </div>
              <Switch checked={leads} onCheckedChange={setLeads} />
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border">
              <div>
                <div className="font-semibold text-slate-900">Support & Tickets</div>
                <div className="text-slate-500 text-[11px]">Handle complaints & tickets</div>
              </div>
              <Switch checked={support} onCheckedChange={setSupport} />
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border">
              <div>
                <div className="font-semibold text-slate-900">Finance & Invoices</div>
                <div className="text-slate-500 text-[11px]">View payments, invoices & revenue</div>
              </div>
              <Switch checked={finance} onCheckedChange={setFinance} />
            </div>
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy} className="bg-purple-600 hover:bg-purple-700 text-white">
            {busy ? "Saving…" : "Save Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LOGIN_URL = "https://crm.businesshelpservices.com/admin-login";

/** Same charset as server-side generateTempPassword — safe, readable characters */
function clientGeneratePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!9";
}

function ResetPasswordModal({ row, open, onOpenChange }: { row: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const resetFn = useServerFn(resetEmployeePassword);
  const [password, setPassword] = useState(() => clientGeneratePassword());
  const [showPw, setShowPw] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Re-generate a fresh password whenever the dialog opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setPassword(clientGeneratePassword());
      setSaved(false);
      setCopied(false);
      setCopiedField(null);
      setShowPw(true);
    }
    onOpenChange(o);
  };

  const regenerate = () => {
    setPassword(clientGeneratePassword());
    setCopied(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return;
    setBusy(true);
    try {
      await resetFn({ data: { user_id: row.id, new_password: password } });
      toast.success(`Password reset for ${row.email}`);
      setSaved(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyField = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyAll = async () => {
    const text = [
      `Login URL: ${LOGIN_URL}`,
      `User ID: ${row.email}`,
      `Password: ${password}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Credentials copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <KeyRound className="size-4 text-indigo-600" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold leading-tight">Reset Password</DialogTitle>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[320px]">{row.email}</p>
            </div>
          </div>
        </div>

        {!saved ? (
          /* ── STEP 1: Set password ── */
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">New Password</Label>
              <p className="text-[10px] text-slate-400 mb-2">Auto-generated. You can regenerate or type your own.</p>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    required
                    type={showPw ? "text" : "password"}
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="pr-9 font-mono text-sm tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={regenerate}
                  className="px-2.5 text-slate-600 shrink-0"
                  title="Generate new password"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-[10px] text-rose-500 mt-1">Minimum 8 characters required.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button
                type="submit"
                size="sm"
                disabled={busy || password.length < 8}
                className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]"
              >
                {busy ? "Saving…" : "Save New Password"}
              </Button>
            </div>
          </form>
        ) : (
          /* ── STEP 2: Credentials card shown after successful reset ── */
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <Check className="size-4 flex-shrink-0" />
              <p className="text-xs font-semibold">Password updated successfully!</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden divide-y divide-slate-200">
              {/* Login Link */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Login URL</p>
                  <p className="text-xs text-slate-700 font-medium truncate mt-0.5">{LOGIN_URL}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyField(LOGIN_URL, "url")}
                  className="shrink-0 p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Copy URL"
                >
                  {copiedField === "url" ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                </button>
              </div>

              {/* User ID */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">User ID (Email)</p>
                  <p className="text-xs text-slate-700 font-medium truncate mt-0.5">{row.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyField(row.email, "email")}
                  className="shrink-0 p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Copy email"
                >
                  {copiedField === "email" ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                </button>
              </div>

              {/* Password */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Password</p>
                  <p className="text-xs text-slate-700 font-mono tracking-wider mt-0.5">
                    {showPw ? password : "•".repeat(password.length)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="shrink-0 p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                  title={showPw ? "Hide" : "Show"}
                >
                  {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyField(password, "pw")}
                  className="shrink-0 p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Copy password"
                >
                  {copiedField === "pw" ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Copy all button */}
            <Button
              type="button"
              onClick={copyAll}
              className={`w-full text-xs font-semibold transition-colors ${
                copied
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {copied ? (
                <><Check className="size-3.5 mr-1.5" /> Credentials Copied!</>
              ) : (
                <><Copy className="size-3.5 mr-1.5" /> Copy All Credentials</>
              )}
            </Button>

            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="text-xs text-slate-500" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
