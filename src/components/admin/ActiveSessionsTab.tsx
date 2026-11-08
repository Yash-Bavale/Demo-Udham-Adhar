import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActiveEmployeeSessions, terminateEmployeeSession, EmployeeSessionRecord } from "@/lib/crm/employee-presence.functions";
import { SectionCard } from "@/components/admin/ui";
import { Shield, Power, RefreshCw, Smartphone, Laptop, Clock, CheckCircle2, User } from "lucide-react";

export function ActiveSessionsTab() {
  const getSessionsFn = useServerFn(getActiveEmployeeSessions);
  const terminateSessionFn = useServerFn(terminateEmployeeSession);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin.settings.sessions"],
    queryFn: () => getSessionsFn(),
    refetchInterval: 15_000,
  });

  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const terminateMutation = useMutation({
    mutationFn: async (session: EmployeeSessionRecord) => {
      setTerminatingId(session.sessionId);
      return terminateSessionFn({
        data: {
          sessionId: session.sessionId,
          employeeId: session.employeeId,
        },
      });
    },
    onSuccess: (_, variables) => {
      setTerminatingId(null);
      setSuccessMsg(`Session for ${variables.employeeName} terminated successfully.`);
      refetch();
      setTimeout(() => setSuccessMsg(null), 3500);
    },
    onError: () => {
      setTerminatingId(null);
      alert("Failed to terminate session.");
    },
  });

  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-6">
      {/* Top Counters Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col">
          <span className="text-xs text-slate-500 font-medium">Total Staff Tracked</span>
          <span className="text-2xl font-bold text-slate-900 mt-1">{data?.totalCount ?? 0}</span>
        </div>
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-xs flex flex-col">
          <span className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            🟢 Active Now
          </span>
          <span className="text-2xl font-bold text-emerald-900 mt-1">{data?.activeCount ?? 0}</span>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-xs flex flex-col">
          <span className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            🟡 Idle
          </span>
          <span className="text-2xl font-bold text-amber-900 mt-1">{data?.idleCount ?? 0}</span>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-xs flex flex-col">
          <span className="text-xs text-slate-500 font-medium">⚫ Offline / Standby</span>
          <span className="text-2xl font-bold text-slate-700 mt-1">{data?.offlineCount ?? 0}</span>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ACTIVE SESSIONS TABLE */}
      <SectionCard title="Live Session Registry & Device Access Control">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Realtime session tokens, telemetry heartbeat timestamps, and administrator force-logout controls.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Poll Telemetry</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Device & Browser</th>
                <th className="py-3 px-4">Login Time (IST)</th>
                <th className="py-3 px-4">Last Seen</th>
                <th className="py-3 px-4">Current Module</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
              {isLoading && sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading live sessions...
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No active sessions found.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const isTerminating = terminatingId === s.sessionId;
                  return (
                    <tr key={s.sessionId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                            {s.employeeName[0] || "U"}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{s.employeeName}</div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">{s.employeeRole}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          {s.deviceType === "Mobile" ? <Smartphone className="h-3.5 w-3.5 text-slate-400" /> : <Laptop className="h-3.5 w-3.5 text-slate-400" />}
                          <span>{s.browser} / {s.os}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.ipAddress}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-600">
                        {new Date(s.loginTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {new Date(s.lastHeartbeat).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {s.currentModule}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {s.presenceStatus === "ACTIVE" && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px] flex items-center gap-1 max-w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        )}
                        {s.presenceStatus === "IDLE" && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[10px] flex items-center gap-1 max-w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Idle
                          </span>
                        )}
                        {s.presenceStatus === "AWAY" && (
                          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold text-[10px] flex items-center gap-1 max-w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            Away
                          </span>
                        )}
                        {s.presenceStatus === "OFFLINE" && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold text-[10px]">
                            Offline
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={isTerminating || s.presenceStatus === "OFFLINE"}
                          onClick={() => {
                            if (confirm(`Force logout and revoke CRM session for ${s.employeeName}?`)) {
                              terminateMutation.mutate(s);
                            }
                          }}
                          className="flex items-center gap-1 ml-auto px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px] transition disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Power className="h-3 w-3" />
                          <span>{isTerminating ? "Terminating..." : "Terminate Session"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
