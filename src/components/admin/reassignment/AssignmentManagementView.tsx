import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  History, Users, UserX, AlertTriangle, ArrowRight, RefreshCw,
  Calendar, Search, Filter, ShieldAlert, CheckCircle2, Clock, Plus,
  Sparkles, FileText, ChevronLeft, ChevronRight, XCircle, Info
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  listAssignmentHistoryAdmin,
  getAssignmentOperationalMetrics,
  listEmployeeLeaves,
  createEmployeeLeave,
  cancelEmployeeLeave,
  triggerEmployeeReassignment
} from "@/lib/crm/assignment-history.functions";
import { listStaffUsers } from "@/lib/crm/users-admin.functions";
import { formatIST, relativeIST } from "@/lib/datetime";

const CHANGE_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  AUTO_LEAVE: { label: "Auto: Leave", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  AUTO_UNAVAILABLE: { label: "Auto: Unavailable", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
  AUTO_INACTIVITY: { label: "Auto: Inactivity", bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
  AUTO_CAPACITY: { label: "Auto: Capacity", bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
  MANUAL: { label: "Manual", bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
  MANUAL_BULK: { label: "Manual Bulk", bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800" },
  SYSTEM: { label: "System", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300", border: "border-slate-300 dark:border-slate-700" },
};

export function AssignmentManagementView() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"history" | "leaves" | "metrics">("history");

  // Server functions
  const metricsFn = useServerFn(getAssignmentOperationalMetrics);
  const historyFn = useServerFn(listAssignmentHistoryAdmin);
  const leavesFn = useServerFn(listEmployeeLeaves);
  const staffFn = useServerFn(listStaffUsers);
  const createLeaveFn = useServerFn(createEmployeeLeave);
  const cancelLeaveFn = useServerFn(cancelEmployeeLeave);
  const triggerReassignFn = useServerFn(triggerEmployeeReassignment);

  // Filter states for history
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChangeType, setSelectedChangeType] = useState<string>("ALL");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("ALL");
  const [selectedPreviousEmpId, setSelectedPreviousEmpId] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Modals
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [manualReassignTarget, setManualReassignTarget] = useState<string | null>(null);

  // Queries
  const { data: metrics, isLoading: loadingMetrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["admin.assignment.metrics"],
    queryFn: () => metricsFn(),
    refetchInterval: 30_000,
  });

  const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: [
      "admin.assignment.history",
      searchQuery,
      selectedChangeType,
      selectedEmployeeId,
      selectedPreviousEmpId,
      page,
    ],
    queryFn: () =>
      historyFn({
        data: {
          searchQuery: searchQuery || undefined,
          changeType: selectedChangeType !== "ALL" ? selectedChangeType : undefined,
          employeeId: selectedEmployeeId !== "ALL" ? selectedEmployeeId : undefined,
          previousEmployeeId: selectedPreviousEmpId !== "ALL" ? selectedPreviousEmpId : undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
      }),
  });

  const { data: leavesData, isLoading: loadingLeaves, refetch: refetchLeaves } = useQuery({
    queryKey: ["admin.employee.leaves"],
    queryFn: () => leavesFn(),
  });

  const { data: staffList } = useQuery({
    queryKey: ["admin.staff.list"],
    queryFn: () => staffFn(),
  });

  // Mutations
  const cancelLeaveMutation = useMutation({
    mutationFn: (leaveId: string) => cancelLeaveFn({ data: { leaveId } }),
    onSuccess: (res) => {
      toast.success("Leave cancelled successfully");
      qc.invalidateQueries({ queryKey: ["admin.employee.leaves"] });
      qc.invalidateQueries({ queryKey: ["admin.assignment.metrics"] });
    },
  });

  const triggerReassignMutation = useMutation({
    mutationFn: (employeeId: string) =>
      triggerReassignFn({
        data: {
          employeeId,
          reason: "SuperAdmin triggered manual order reassignment",
          changeType: "AUTO_UNAVAILABLE",
        },
      }),
    onSuccess: (res) => {
      toast.success(res.summaryMessage || `Successfully reassigned ${res.reassignedCount} orders!`);
      setManualReassignTarget(null);
      qc.invalidateQueries({ queryKey: ["admin.assignment.metrics"] });
      qc.invalidateQueries({ queryKey: ["admin.assignment.history"] });
      qc.invalidateQueries({ queryKey: ["admin.orders"] });
    },
  });

  const activeLeavesCount = useMemo(() => {
    return (leavesData?.rows ?? []).filter((l: any) => String(l.status).toUpperCase() === "ACTIVE").length;
  }, [leavesData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <History className="size-6 text-indigo-600" />
            Automatic Order Reassignment & Leaves
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Centralized workload redistribution, staff leave scheduling, and immutable assignment transition audit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              refetchMetrics();
              refetchHistory();
              refetchLeaves();
              toast.info("Refreshed assignment data");
            }}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>

          <Button
            size="sm"
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => setLeaveModalOpen(true)}
          >
            <Plus className="size-3.5" /> Schedule Leave
          </Button>
        </div>
      </div>

      {/* ── Operational Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <MetricCard
          title="Staff Unavailable"
          value={metrics?.employeesUnavailableCount ?? 0}
          subtitle={`${activeLeavesCount} on scheduled leave`}
          icon={UserX}
          color="amber"
          loading={loadingMetrics}
        />
        <MetricCard
          title="Reassigned Today"
          value={metrics?.ordersReassignedToday ?? 0}
          subtitle="Action orders redistributed"
          icon={Sparkles}
          color="indigo"
          loading={loadingMetrics}
        />
        <MetricCard
          title="Auto Reassignments"
          value={metrics?.autoReassignmentsToday ?? 0}
          subtitle="Engine triggered changes"
          icon={RefreshCw}
          color="emerald"
          loading={loadingMetrics}
        />
        <MetricCard
          title="Manual Assignments"
          value={metrics?.manualReassignmentsToday ?? 0}
          subtitle="SuperAdmin / Single & Bulk"
          icon={Users}
          color="blue"
          loading={loadingMetrics}
        />
        <MetricCard
          title="Capacity Alerts"
          value={metrics?.ordersNeedingAssignment ?? 0}
          subtitle="Orders requiring attention"
          icon={AlertTriangle}
          color={metrics?.ordersNeedingAssignment ? "red" : "slate"}
          loading={loadingMetrics}
        />
      </div>

      {/* ── Unavailable Staff Overview ── */}
      {(metrics?.unavailableEmployees?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                Unavailable Staff Requiring Workload Redistribution
              </h3>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {metrics?.unavailableEmployees?.map((emp) => (
              <div
                key={emp.employeeId}
                className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 shadow-xs"
              >
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{emp.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                      {emp.unavailabilityReason || "Unavailable"}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {emp.activeActionOrders} active orders
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-300 text-amber-900 hover:bg-amber-50"
                  onClick={() => triggerReassignMutation.mutate(emp.employeeId)}
                  disabled={triggerReassignMutation.isPending}
                >
                  <RefreshCw className={`size-3 mr-1 ${triggerReassignMutation.isPending ? "animate-spin" : ""}`} />
                  Reassign Now
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sub Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
            activeTab === "history"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          Assignment Transition History
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("leaves")}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
            activeTab === "leaves"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          Staff Leave Schedule ({leavesData?.rows?.length ?? 0})
        </button>
      </div>

      {/* ── Tab 1: Assignment History ── */}
      {activeTab === "history" && (
        <SectionCard>
          <div className="space-y-4">
            {/* Filters Row */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 flex-wrap">
              <div className="relative w-full md:w-80">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search order #, customer, ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 h-9 text-sm"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                {/* Change Type Filter */}
                <Select
                  value={selectedChangeType}
                  onValueChange={(v) => {
                    setSelectedChangeType(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue placeholder="All Change Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="AUTO_LEAVE">Auto: Leave</SelectItem>
                    <SelectItem value="AUTO_UNAVAILABLE">Auto: Unavailable</SelectItem>
                    <SelectItem value="AUTO_INACTIVITY">Auto: Inactivity</SelectItem>
                    <SelectItem value="AUTO_CAPACITY">Auto: Capacity</SelectItem>
                    <SelectItem value="MANUAL">Manual</SelectItem>
                    <SelectItem value="MANUAL_BULK">Manual Bulk</SelectItem>
                    <SelectItem value="SYSTEM">System</SelectItem>
                  </SelectContent>
                </Select>

                {/* Target Employee Filter */}
                <Select
                  value={selectedEmployeeId}
                  onValueChange={(v) => {
                    setSelectedEmployeeId(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-44 text-xs">
                    <SelectValue placeholder="New Assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All New Assignees</SelectItem>
                    {staffList?.rows?.map((s: { id: string; full_name: string | null; email: string }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name || s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(searchQuery || selectedChangeType !== "ALL" || selectedEmployeeId !== "ALL") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedChangeType("ALL");
                      setSelectedEmployeeId("ALL");
                      setPage(1);
                    }}
                    className="h-9 text-xs text-slate-500"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Order # / Service</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Previous Assignee</th>
                    <th className="px-4 py-3 text-center">→</th>
                    <th className="px-4 py-3">New Assignee</th>
                    <th className="px-4 py-3">Change Type</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Source / Changed By</th>
                    <th className="px-4 py-3 text-right">Date / Time (IST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingHistory ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : (historyData?.rows?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                        <History className="size-8 mx-auto mb-2 text-slate-300" />
                        No assignment history records found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    historyData?.rows?.map((row: any) => {
                      const badge = CHANGE_TYPE_CONFIG[row.changeType] ?? CHANGE_TYPE_CONFIG.SYSTEM;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                          <td className="px-4 py-3">
                            <a
                              href={`/admin/orders/${row.orderId}`}
                              className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              {row.applicationCode || "—"}
                            </a>
                            <div className="text-[11px] text-slate-500">Order assignment</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{row.customerName || "—"}</div>
                            <div className="text-[11px] text-slate-500">{row.customerMobile || ""}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">
                            {row.previousEmployeeName || "Unassigned"}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-400">
                            <ArrowRight className="size-3.5 mx-auto" />
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {row.newEmployeeName || "Unassigned"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={row.reason || ""}>
                            {row.reason || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            <div className="font-semibold text-slate-700 dark:text-slate-300">{row.source || "SYSTEM"}</div>
                            <div className="text-[10px]">{row.changedByName}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">
                            <div className="font-medium text-slate-700 dark:text-slate-300">{formatIST(row.createdAt)}</div>
                            <div className="text-[10px] text-slate-400">{relativeIST(row.createdAt)}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500">
                Showing {Math.min((historyData?.total ?? 0), (page - 1) * pageSize + 1)} -{" "}
                {Math.min(page * pageSize, (historyData?.total ?? 0))} of {historyData?.total ?? 0} events
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 gap-1 text-xs"
                >
                  <ChevronLeft className="size-3.5" /> Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(page * pageSize) >= (historyData?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 gap-1 text-xs"
                >
                  Next <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Tab 2: Staff Leave Management ── */}
      {activeTab === "leaves" && (
        <SectionCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Scheduled & Active Leaves</h3>
                <p className="text-xs text-slate-500">
                  When leave becomes active with auto-reassign enabled, eligible orders are atomically balanced across active staff.
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => setLeaveModalOpen(true)}
              >
                <Plus className="size-3.5" /> Add Leave
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Leave Period (IST)</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Auto Reassign</th>
                    <th className="px-4 py-3">Orders Reassigned</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingLeaves ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : (leavesData?.rows?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        <Calendar className="size-8 mx-auto mb-2 text-slate-300" />
                        No employee leave schedules registered.
                      </td>
                    </tr>
                  ) : (
                    leavesData?.rows?.map((l: any) => (
                      <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{l.employeeName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {formatIST(l.startTime)} → {formatIST(l.endTime)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{l.reason || "Scheduled Leave"}</td>
                        <td className="px-4 py-3">
                          {l.autoReassign ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="size-3" /> Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold text-indigo-600 dark:text-indigo-400">
                          {l.reassignedCount} orders
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              l.status === "active"
                                ? "bg-amber-100 text-amber-800"
                                : l.status === "scheduled"
                                ? "bg-blue-100 text-blue-800"
                                : l.status === "completed"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.status !== "completed" && l.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-600 hover:bg-red-50"
                              onClick={() => cancelLeaveMutation.mutate(l.id)}
                              disabled={cancelLeaveMutation.isPending}
                            >
                              Cancel Leave
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Schedule Leave Dialog ── */}
      {leaveModalOpen && (
        <ScheduleLeaveDialog
          open={leaveModalOpen}
          onClose={() => setLeaveModalOpen(false)}
          staffList={staffList?.rows ?? []}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["admin.employee.leaves"] });
            qc.invalidateQueries({ queryKey: ["admin.assignment.metrics"] });
            qc.invalidateQueries({ queryKey: ["admin.assignment.history"] });
          }}
        />
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: any;
  color: "amber" | "indigo" | "emerald" | "blue" | "red" | "slate";
  loading?: boolean;
}) {
  const colorMap = {
    amber: "border-amber-200 bg-amber-50/50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/60",
    indigo: "border-indigo-200 bg-indigo-50/50 text-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-300 dark:border-indigo-900/60",
    emerald: "border-emerald-200 bg-emerald-50/50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/60",
    blue: "border-blue-200 bg-blue-50/50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/60",
    red: "border-red-200 bg-red-50/50 text-red-800 dark:bg-red-950/20 dark:text-red-300 dark:border-red-900/60",
    slate: "border-slate-200 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
  };

  return (
    <div className={`p-4 rounded-xl border shadow-xs transition ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider opacity-80">{title}</span>
        <Icon className="size-4 opacity-70" />
      </div>
      <div className="text-2xl font-extrabold tracking-tight">
        {loading ? "..." : value}
      </div>
      <div className="text-[11px] font-medium opacity-75 mt-0.5">{subtitle}</div>
    </div>
  );
}

function ScheduleLeaveDialog({
  open,
  onClose,
  staffList,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  staffList: Array<{ id: string; full_name: string | null; email: string }>;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [endTime, setEndTime] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState("Annual Leave");
  const [autoReassign, setAutoReassign] = useState(true);

  const createLeaveFn = useServerFn(createEmployeeLeave);
  const mutation = useMutation({
    mutationFn: () =>
      createLeaveFn({
        data: {
          employeeId,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          reason,
          autoReassign,
        },
      }),
    onSuccess: (res) => {
      const reassignedCount = res.redistributionSummary?.reassignedCount ?? 0;
      toast.success(`Leave scheduled! ${reassignedCount ? `${reassignedCount} orders reassigned.` : ""}`);
      onCreated();
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Calendar className="size-5 text-indigo-600" />
            Schedule Employee Leave
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Select Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member..." />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name || s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Start Date & Time</Label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">End Date & Time</Label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason for Leave</Label>
            <Input
              placeholder="e.g. Vacation, Sick Leave, Family Emergency"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-900">
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Auto-Reassign Orders</div>
              <div className="text-[11px] text-slate-500">
                Instantly redistribute active action-required orders across eligible staff.
              </div>
            </div>
            <Switch checked={autoReassign} onCheckedChange={setAutoReassign} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!employeeId || mutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {mutation.isPending ? "Scheduling..." : "Schedule Leave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
