import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock, X, History, User, Calendar, AlertCircle,
  CheckCircle2, XCircle, ArrowRight, PhoneCall, Mail, MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/datetime";
import { getOrderCallbackHistory, CallbackHistoryItem } from "@/lib/orders/actions/callback-reminder.functions";

interface Props {
  orderId: string;
  orderCode?: string;
  onClose: () => void;
}

function formatTimelineTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) + ", " + d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function CallbackHistoryDialog({ orderId, orderCode = "Order", onClose }: Props) {
  const getHistoryFn = useServerFn(getOrderCallbackHistory);

  const { data: history = [], isLoading, error } = useQuery({
    queryKey: ["order-callback-history", orderId],
    queryFn: () => getHistoryFn({ data: { orderId } }),
    staleTime: 5_000,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[6px] overflow-y-auto"
      id="callbackHistoryModalWrapper"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-start justify-between gap-4 border-b border-slate-800 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/80 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5 border border-indigo-800/60 shadow-inner">
              <History className="size-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base md:text-lg text-white tracking-tight">
                  Callback History
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-200 text-[11px] font-bold border border-indigo-700/50">
                  {history.length} {history.length === 1 ? "Record" : "Records"}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                Order #{orderCode} · Complete chronological audit of callback schedules &amp; reschedules
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Clock className="size-8 animate-spin text-indigo-600" />
              <p className="text-xs font-semibold">Loading callback history...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 text-rose-600 shrink-0" />
              <span>Failed to load callback history.</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                <History className="size-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">No Historical Records Yet</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Callback scheduling actions for this order will be permanently recorded and displayed here.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {history.map((item, index) => {
                const isRescheduled = item.action_type === "CALLBACK_RESCHEDULED" || (item.action_type as string) === "RESCHEDULED";
                const isScheduled = item.action_type === "CALLBACK_SCHEDULED" || (item.action_type as string) === "SCHEDULED";
                const isCompleted = item.action_type === "CALLBACK_COMPLETED" || (item.action_type as string) === "CALL_COMPLETED";
                const isCancelled = item.action_type === "CALLBACK_CANCELLED" || (item.action_type as string) === "CANCELLED";

                return (
                  <div key={item.id || index} className="relative group">
                    {/* Timeline Node Dot */}
                    <div
                      className={cn(
                        "absolute -left-6 top-3 size-3 rounded-full border-2 bg-white ring-4 ring-slate-50 transition-transform group-hover:scale-125",
                        isRescheduled
                          ? "border-amber-500 bg-amber-500"
                          : isScheduled
                          ? "border-indigo-600 bg-indigo-600"
                          : isCompleted
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-slate-400 bg-slate-400"
                      )}
                    />

                    {/* Timeline Card */}
                    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 hover:border-indigo-200 hover:shadow-xs transition-all space-y-3">
                      {/* Top Header: Action Badge + Action Date */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-2xs",
                              isRescheduled
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : isScheduled
                                ? "bg-indigo-100 text-indigo-900 border border-indigo-300"
                                : isCompleted
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                : "bg-slate-100 text-slate-800 border border-slate-300"
                            )}
                          >
                            {isRescheduled && <Clock className="size-3 text-amber-700" />}
                            {isScheduled && <Calendar className="size-3 text-indigo-700" />}
                            {isCompleted && <CheckCircle2 className="size-3 text-emerald-700" />}
                            {isCancelled && <XCircle className="size-3 text-slate-600" />}
                            {isRescheduled
                              ? "Callback Rescheduled"
                              : isScheduled
                              ? "Callback Scheduled"
                              : isCompleted
                              ? "Call Completed"
                              : "Callback Cancelled"}
                          </span>

                          {item.channel === "email" ? (
                            <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-semibold inline-flex items-center gap-1">
                              <Mail className="size-2.5" /> Email
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-semibold inline-flex items-center gap-1">
                              <PhoneCall className="size-2.5" /> Call
                            </span>
                          )}
                        </div>

                        <span className="text-xs text-slate-500 font-medium">
                          {formatTimelineTime(item.created_at)}
                        </span>
                      </div>

                      {/* Actor Information */}
                      <div className="flex items-center gap-2 text-xs text-slate-700">
                        <span className="text-slate-400 font-medium">By:</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 font-bold border border-slate-200">
                          <User className="size-3 text-slate-600" />
                          {item.actor_name || "Staff"}
                        </span>
                        {item.actor_role && (
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">
                            ({item.actor_role})
                          </span>
                        )}
                      </div>

                      {/* Reason & Notes */}
                      <div className="space-y-1">
                        <div className="text-xs text-slate-800">
                          <span className="font-bold text-slate-900">Reason:</span>{" "}
                          <span className="font-semibold text-slate-800">{item.reason_label || item.reason}</span>
                        </div>
                        {item.note && (
                          <div className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                            "{item.note}"
                          </div>
                        )}
                      </div>

                      {/* Callback Schedule Details (Previous vs New) */}
                      {(item.previous_fires_at || item.new_fires_at) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                          {item.previous_fires_at && (
                            <div className="bg-slate-50 rounded-lg p-2 border border-slate-200/80">
                              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                                Previous Schedule
                              </span>
                              <span className="font-semibold text-slate-700">
                                {formatTimelineTime(item.previous_fires_at)}
                              </span>
                              {item.previous_reason_label && (
                                <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                                  ({item.previous_reason_label})
                                </span>
                              )}
                            </div>
                          )}

                          {item.new_fires_at && (
                            <div className={cn(
                              "rounded-lg p-2 border",
                              isRescheduled
                                ? "bg-amber-50/60 border-amber-200 text-amber-950"
                                : "bg-indigo-50/60 border-indigo-200 text-indigo-950"
                            )}>
                              <span className={cn(
                                "text-[10px] uppercase font-bold block mb-0.5",
                                isRescheduled ? "text-amber-800" : "text-indigo-800"
                              )}>
                                {isRescheduled ? "New Rescheduled Time" : "Scheduled Time"}
                              </span>
                              <span className="font-bold text-slate-900">
                                {formatTimelineTime(item.new_fires_at)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Immutable callback timeline audit log
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 transition cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
