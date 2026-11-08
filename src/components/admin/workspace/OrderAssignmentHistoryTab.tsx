import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrderAssignmentHistory } from "@/lib/crm/assignment-history.functions";
import { History, UserCheck, ArrowRight, ShieldAlert, Clock, Shuffle, UserCog } from "lucide-react";
import { formatIST } from "@/lib/datetime";
import { cn } from "@/lib/utils";

interface Props {
  orderId: string;
}

export function OrderAssignmentHistoryTab({ orderId }: Props) {
  const historyFn = useServerFn(getOrderAssignmentHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["order.assignment-history", orderId],
    queryFn: () => historyFn({ data: { orderId } }),
    staleTime: 10_000,
  });

  const rows: Array<{
    id: string; changeType: string; changedByName: string; source: string;
    createdAt: string; previousEmployeeId: string | null; previousEmployeeName: string;
    newEmployeeId: string | null; newEmployeeName: string; reason: string | null;
  }> = data?.rows ?? [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-3 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/4" />
        <div className="h-16 bg-slate-100 rounded-xl" />
        <div className="h-16 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200/80 shadow-xs">
        <History className="size-8 mx-auto mb-2 text-slate-400" />
        <div className="text-sm font-semibold text-slate-700">No Assignment History Recorded</div>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Assignment transitions (manual reassignments, leave redistributions, and initial intake) will be recorded here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-white rounded-xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">Assignment History & Transitions</h3>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          {rows.length} {rows.length === 1 ? "transition" : "transitions"}
        </span>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {rows.map((r, idx) => {
          const isAuto = r.changeType.startsWith("AUTO");
          const isManual = r.changeType.startsWith("MANUAL");

          return (
            <div key={r.id || idx} className="relative group">
              {/* Timeline dot */}
              <div
                className={cn(
                  "absolute -left-6 top-1.5 size-5 rounded-full border-2 border-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-110",
                  isAuto ? "bg-amber-500 text-white" : isManual ? "bg-indigo-600 text-white" : "bg-slate-700 text-white",
                )}
              >
                {isAuto ? (
                  <Shuffle className="size-2.5" />
                ) : (
                  <UserCheck className="size-2.5" />
                )}
              </div>

              {/* Card */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3.5 space-y-2 hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                        isAuto
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : isManual
                            ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            : "bg-slate-200 text-slate-800",
                      )}
                    >
                      {r.changeType.replace(/_/g, " ")}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      By {r.changedByName || "System"} ({r.source})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {formatIST(r.createdAt)}
                  </span>
                </div>

                {/* Transition flow */}
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 py-1">
                  <span className={cn(!r.previousEmployeeId ? "text-slate-400 italic font-normal" : "text-slate-700")}>
                    {r.previousEmployeeName || "Unassigned"}
                  </span>
                  <ArrowRight className="size-3.5 text-slate-400 shrink-0" />
                  <span className={cn(!r.newEmployeeId ? "text-slate-400 italic font-normal" : "text-indigo-700 font-bold")}>
                    {r.newEmployeeName || "Unassigned"}
                  </span>
                </div>

                {/* Reason note */}
                {r.reason && (
                  <div className="text-xs text-slate-600 bg-white/80 p-2 rounded-lg border border-slate-200/60 flex items-start gap-1.5">
                    <span className="text-slate-400 font-medium shrink-0">Reason:</span>
                    <span>{r.reason}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
