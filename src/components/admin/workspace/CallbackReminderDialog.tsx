import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Clock, X, Check, Flame, BellRing, MessageSquare,
  Briefcase, FileText, CheckCircle2, Calendar, Zap,
  PhoneOff, PhoneCall, ShieldCheck, Mail, History, Server
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/datetime";
import { CustomDateTimePicker } from "./CustomDateTimePicker";
import { CallbackHistoryDialog } from "./CallbackHistoryDialog";
import {
  scheduleOrderCallback,
  cancelOrderCallback,
  completeOrderCallback,
  getActiveOrderCallback,
} from "@/lib/orders/actions/callback-reminder.functions";
import { getOrderDetailV2 } from "@/lib/crm/orders-v2.functions";
import {
  getCallbackReminderPresetSettings,
  DEFAULT_CALLBACK_PRESET_CONFIG,
} from "@/lib/settings/app-settings.functions";

interface Props {
  orderId: string;
  orderCode?: string;
  customerName?: string;
  customerMobile?: string;
  assignedName?: string;
  initialChannel?: "call" | "email";
  onClose: () => void;
}

const OUTCOMES = [
  {
    id: "unreachable",
    label: "Customer Unreachable / No Answer",
    description: "Rang 3 times, disconnected or switched off",
    defaultNote: "Customer unreachable after multiple call attempts. Phone ringing / no response.",
    dotClass: "bg-rose-500",
    icon: null,
  },
  {
    id: "call_back_later",
    label: "Customer Told: Call Back Later",
    description: "Customer gave explicit preferred time",
    defaultNote: "Customer answered and requested callback later. Will follow up at scheduled time.",
    dotClass: "bg-blue-600 animate-pulse",
    icon: null,
  },
  {
    id: "busy_meeting",
    label: "Busy / Driving / In Meeting",
    description: "Customer cannot speak right now",
    defaultNote: "Customer is currently busy / in meeting / driving. Asked to call back shortly.",
    dotClass: null,
    icon: Briefcase,
    iconClass: "text-slate-500",
  },
  {
    id: "docs_pending",
    label: "Document Pending from Customer",
    description: "Fetching Aadhaar / PAN / Bill",
    defaultNote: "Customer fetching required documents (Aadhaar / PAN / Bill). Callback set to collect details.",
    dotClass: null,
    icon: FileText,
    iconClass: "text-emerald-600",
  },
];

export function CallbackReminderDialog({
  orderId,
  orderCode: propOrderCode,
  customerName: propCustomerName,
  customerMobile: propCustomerMobile,
  assignedName: propAssignedName,
  initialChannel = "call",
  onClose,
}: Props) {
  const qc = useQueryClient();

  const getActiveFn = useServerFn(getActiveOrderCallback);
  const scheduleFn = useServerFn(scheduleOrderCallback);
  const cancelFn = useServerFn(cancelOrderCallback);
  const completeFn = useServerFn(completeOrderCallback);
  const getDetailFn = useServerFn(getOrderDetailV2);
  const getPresetsFn = useServerFn(getCallbackReminderPresetSettings);

  // Fetch presets configured by Admin
  const { data: presetConfig } = useQuery({
    queryKey: ["callback-reminder-presets"],
    queryFn: () => getPresetsFn(),
    staleTime: 60_000,
  });

  const quickMinutes = presetConfig?.quickMinutes ?? DEFAULT_CALLBACK_PRESET_CONFIG.quickMinutes;
  const recommendedHours = presetConfig?.recommendedHours ?? DEFAULT_CALLBACK_PRESET_CONFIG.recommendedHours;
  const afternoonHours = presetConfig?.afternoonHours ?? presetConfig?.eveningHours ?? DEFAULT_CALLBACK_PRESET_CONFIG.afternoonHours;
  const beforeShiftEndHours = presetConfig?.beforeShiftEndHours ?? presetConfig?.laterTodayHours ?? DEFAULT_CALLBACK_PRESET_CONFIG.beforeShiftEndHours;
  const tomorrowDefaultTime = presetConfig?.tomorrowDefaultTime ?? DEFAULT_CALLBACK_PRESET_CONFIG.tomorrowDefaultTime;

  // Fetch active callback
  const { data: activeCallback } = useQuery({
    queryKey: ["active-order-callback", orderId],
    queryFn: () => getActiveFn({ data: { orderId } }),
    staleTime: 5_000,
  });

  // Fetch full order info if props not passed
  const { data: orderDetail } = useQuery({
    queryKey: ["order-detail-v2", orderId],
    queryFn: () => getDetailFn({ data: { orderId } }),
    enabled: !propOrderCode || !propCustomerName,
    staleTime: 60_000,
  });

  const orderCode = propOrderCode || orderDetail?.application?.application_code || "Order";
  const customerName = propCustomerName || orderDetail?.customer?.name || orderDetail?.lead?.name || "Customer";
  const customerMobile = propCustomerMobile || (orderDetail as any)?.customer?.primary_mobile || (orderDetail as any)?.lead?.mobile || "";
  const staffName = propAssignedName || (orderDetail as any)?.assignedStaff?.display_name || (orderDetail as any)?.assignedStaff?.email || "Assigned Executive";

  const [selectedOutcome, setSelectedOutcome] = useState<string>("call_back_later");
  const [durationPreset, setDurationPreset] = useState<string>("recommended"); // 'quick' | 'recommended' | 'afternoon' | 'before_shift_end' | 'tomorrow' | 'custom'
  const [customDate, setCustomDate] = useState<Date>(() => new Date(Date.now() + 120 * 60_000));
  const [channel, setChannel] = useState<"call" | "email">(initialChannel);

  const [note, setNote] = useState<string>("Customer answered and requested callback. Will keep Aadhaar OTP ready for verification.");
  const [completeNote, setCompleteNote] = useState<string>("");

  // Automated trigger toggles
  const [hotOrderSurge, setHotOrderSurge] = useState(true);
  const [desktopAlert, setDesktopAlert] = useState(true);
  const [whatsappReminder, setWhatsappReminder] = useState(true);

  // Calculate target date dynamically from settings
  const targetDate = useMemo(() => {
    const now = new Date();
    if (durationPreset === "quick") {
      return new Date(now.getTime() + quickMinutes * 60_000);
    } else if (durationPreset === "recommended") {
      return new Date(now.getTime() + Math.round(recommendedHours * 60) * 60_000);
    } else if (durationPreset === "afternoon" || durationPreset === "evening") {
      return new Date(now.getTime() + Math.round(afternoonHours * 60) * 60_000);
    } else if (durationPreset === "before_shift_end" || durationPreset === "later_today") {
      return new Date(now.getTime() + Math.round(beforeShiftEndHours * 60) * 60_000);
    } else if (durationPreset === "tomorrow") {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      const [h, m] = (tomorrowDefaultTime || "10:30").split(":").map(Number);
      t.setHours(isNaN(h) ? 10 : h, isNaN(m) ? 30 : m, 0, 0);
      return t;
    } else if (durationPreset === "custom") {
      return customDate;
    }
    return new Date(now.getTime() + Math.round(recommendedHours * 60) * 60_000);
  }, [durationPreset, customDate, quickMinutes, recommendedHours, afternoonHours, beforeShiftEndHours, tomorrowDefaultTime]);


  const [showHistory, setShowHistory] = useState(false);
  const idempotencyKey = useMemo(() => `${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, [orderId]);

  // When outcome changes, update default note if user hasn't heavily modified it
  const handleSelectOutcome = (outcomeId: string) => {
    setSelectedOutcome(outcomeId);
    const found = OUTCOMES.find((o) => o.id === outcomeId);
    if (found?.defaultNote) {
      setNote(found.defaultNote);
    }
  };

  const scheduleMut = useMutation({
    mutationFn: async () => {
      const outcomeObj = OUTCOMES.find((o) => o.id === selectedOutcome) || {
        id: "call_back_later",
        label: "Customer Follow-Up",
      };

      return scheduleFn({
        data: {
          orderId,
          reason: outcomeObj.id,
          reasonLabel: outcomeObj.label,
          customFiresAt: targetDate.toISOString(),
          note: note.trim() || null,
          channel,
          idempotencyKey,
        },
      });
    },
    onSuccess: (res) => {
      const isReschedule = res?.actionType === "CALLBACK_RESCHEDULED";
      toast.success(
        isReschedule
          ? `Callback rescheduled for ${formatIST(targetDate.toISOString())}.`
          : `Callback scheduled for ${formatIST(targetDate.toISOString())}. Order tagged as HOT.`
      );
      qc.invalidateQueries({ queryKey: ["active-order-callback", orderId] });
      qc.invalidateQueries({ queryKey: ["order-callback-history", orderId] });
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["order-detail-v2", orderId] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to schedule callback");
    },
  });

  const cancelMut = useMutation({
    mutationFn: async () => cancelFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Callback reminder cancelled");
      qc.invalidateQueries({ queryKey: ["active-order-callback", orderId] });
      qc.invalidateQueries({ queryKey: ["order-callback-history", orderId] });
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to cancel reminder"),
  });

  const completeMut = useMutation({
    mutationFn: async () => completeFn({ data: { orderId, callOutcomeNote: completeNote.trim() || null } }),
    onSuccess: () => {
      toast.success("Callback marked as completed!");
      qc.invalidateQueries({ queryKey: ["active-order-callback", orderId] });
      qc.invalidateQueries({ queryKey: ["order-callback-history", orderId] });
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to complete callback"),
  });

  const isBusy = scheduleMut.isPending || cancelMut.isPending || completeMut.isPending;

  // Formatted trigger string
  const formattedTrigger = useMemo(() => {
    return formatIST(targetDate.toISOString());
  }, [targetDate]);

  // Staff initials
  const initials = useMemo(() => {
    const parts = staffName.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return staffName.slice(0, 2).toUpperCase();
  }, [staffName]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[6px] overflow-y-auto"
      id="callbackModalWrapper"
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Modal Header Banner */}
        <div className="bg-slate-900 px-6 py-4 flex items-start justify-between gap-4 border-b border-slate-800 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-teal-300 shrink-0 mt-0.5 border border-slate-700 shadow-inner">
              <Clock className="size-6" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base md:text-lg text-white tracking-tight">
                  Schedule Customer Callback &amp; Reminder
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                Customer is unreachable or requested a later callback. Set reminder timer &amp; hot order trigger.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 text-[11px] font-semibold uppercase tracking-wider border border-slate-700">
              Order #{orderCode}
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 md:p-5 space-y-4 overflow-y-auto flex-1 text-slate-800">
          {/* Active Reminder Banner if exists */}
          {activeCallback && (
            <div className={cn(
              "rounded-xl border p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3",
              activeCallback.isDue
                ? "border-rose-300 bg-rose-50 text-rose-950"
                : "border-indigo-200 bg-indigo-50/80 text-indigo-950"
            )}>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const isTicketSourceHot = Boolean(
                      activeCallback.parsedRemarks?.channel === "email" ||
                      activeCallback.parsedRemarks?.reason === "ticket_hot_priority" ||
                      activeCallback.parsedRemarks?.reason === "order_reopened" ||
                      activeCallback.parsedRemarks?.ticketNumber ||
                      activeCallback.parsedRemarks?.origin === "support_ticket" ||
                      (activeCallback.parsedRemarks?.reasonLabel && activeCallback.parsedRemarks.reasonLabel.toLowerCase().includes("ticket")) ||
                      (activeCallback.parsedRemarks?.note && activeCallback.parsedRemarks.note.toLowerCase().includes("ticket"))
                    );

                    return (
                      <>
                        {activeCallback.isDue ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs">
                            <Flame className="size-3" /> {isTicketSourceHot ? "Email Action Due (HOT ORDER)" : "Call Due Now (HOT ORDER)"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs">
                            <Clock className="size-3" /> {isTicketSourceHot ? "Email Action Reminder Active" : "Scheduled Reminder Active"}
                          </span>
                        )}
                        <span className="text-sm font-bold text-slate-900">
                          Due: {formatIST(activeCallback.fires_at)}
                        </span>
                        {activeCallback.parsedRemarks?.channel === "technical_delay" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 text-xs font-bold shadow-2xs">
                            <Server className="size-3.5 text-sky-700" /> Technical Delay
                          </span>
                        ) : (activeCallback.parsedRemarks?.channel === "email" || isTicketSourceHot) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-xs font-bold shadow-2xs">
                            <Mail className="size-3.5 text-purple-700" /> Check Email
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold shadow-2xs">
                            <PhoneCall className="size-3.5 text-amber-700" /> Check Call
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <p className="text-sm text-slate-800">
                  <strong className="font-bold text-slate-900">Reason:</strong> {activeCallback.parsedRemarks?.reasonLabel || "Follow-up"}
                  {activeCallback.parsedRemarks?.note ? ` — "${activeCallback.parsedRemarks.note}"` : null}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {(activeCallback.historyCount ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition cursor-pointer shadow-2xs"
                  >
                    <History className="size-3.5 text-indigo-600" />
                    History ({activeCallback.historyCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => cancelMut.mutate()}
                  disabled={isBusy}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-rose-600 transition cursor-pointer"
                >
                  Cancel Reminder
                </button>
                <button
                  type="button"
                  onClick={() => completeMut.mutate()}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
                >
                  <Check className="size-3.5" /> Complete Call
                </button>
              </div>
            </div>
          )}

          {/* Section 1: Why is callback needed? (Call Outcome) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[11px] font-bold">
                  1
                </span>
                Why is callback needed? (Call Outcome)
              </label>
              <span className="text-[11px] text-rose-600 font-bold tracking-wide uppercase">
                Mandatory
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OUTCOMES.map((item) => {
                const isSelected = selectedOutcome === item.id;
                const Icon = item.icon;

                return (
                  <label
                    key={item.id}
                    onClick={() => handleSelectOutcome(item.id)}
                    className={cn(
                      "group relative flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all border select-none",
                      isSelected
                        ? "bg-blue-50/70 border-blue-500/60 shadow-xs ring-1 ring-blue-500/30"
                        : "bg-slate-50/50 hover:bg-slate-50 border-slate-200"
                    )}
                  >
                    <input
                      type="radio"
                      name="call_outcome"
                      checked={isSelected}
                      onChange={() => handleSelectOutcome(item.id)}
                      className="mt-0.5 accent-blue-600"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {item.dotClass && (
                          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", item.dotClass)} />
                        )}
                        {Icon && (
                          <Icon className={cn("size-3.5 shrink-0", item.iconClass)} />
                        )}
                        <span className={cn(
                          "text-xs font-bold truncate",
                          isSelected ? "text-blue-950" : "text-slate-800"
                        )}>
                          {item.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="size-4 text-blue-600 ml-auto shrink-0 mt-0.5" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 2: Set Reminder Duration */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[11px] font-bold">
                  2
                </span>
                Set Reminder Duration
              </label>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs shadow-2xs">
                <Zap className="size-3 text-indigo-600 fill-indigo-600" />
                <span>
                  Calculated Trigger: <strong className="font-bold text-slate-900">{formattedTrigger}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {/* Quick Preset */}
              <button
                type="button"
                onClick={() => setDurationPreset("quick")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-center transition-colors border select-none cursor-pointer",
                  durationPreset === "quick"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                )}
              >
                <div className={cn("text-[10px] uppercase font-semibold", durationPreset === "quick" ? "text-blue-100" : "text-slate-400")}>
                  Quick
                </div>
                <div className="text-xs font-bold">+{quickMinutes} Mins</div>
              </button>

              {/* Recommended Preset */}
              <button
                type="button"
                onClick={() => setDurationPreset("recommended")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-center transition-colors border select-none cursor-pointer",
                  durationPreset === "recommended"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                )}
              >
                <div className={cn("text-[10px] uppercase font-semibold", durationPreset === "recommended" ? "text-blue-100" : "text-blue-600 font-bold")}>
                  Recommended
                </div>
                <div className="text-xs font-bold flex items-center justify-center gap-1">
                  {recommendedHours} {recommendedHours === 1 ? "Hour" : "Hours"}
                  {durationPreset === "recommended" && <Check className="size-3" />}
                </div>
              </button>

              {/* Afternoon Preset */}
              <button
                type="button"
                onClick={() => setDurationPreset("afternoon")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-center transition-colors border select-none cursor-pointer",
                  durationPreset === "afternoon" || durationPreset === "evening"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                )}
              >
                <div className={cn("text-[10px] uppercase font-semibold", (durationPreset === "afternoon" || durationPreset === "evening") ? "text-blue-100" : "text-slate-400")}>
                  Afternoon
                </div>
                <div className="text-xs font-bold">{afternoonHours} {afternoonHours === 1 ? "Hour" : "Hours"}</div>
              </button>

              {/* Before Shift End Preset */}
              <button
                type="button"
                onClick={() => setDurationPreset("before_shift_end")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-center transition-colors border select-none cursor-pointer",
                  durationPreset === "before_shift_end" || durationPreset === "later_today"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                )}
              >
                <div className={cn("text-[10px] uppercase font-semibold", (durationPreset === "before_shift_end" || durationPreset === "later_today") ? "text-blue-100" : "text-slate-400")}>
                  Before Shift End
                </div>
                <div className="text-xs font-bold">{beforeShiftEndHours} {beforeShiftEndHours === 1 ? "Hour" : "Hours"}</div>
              </button>

              {/* Tomorrow Default Time */}
              <button
                type="button"
                onClick={() => setDurationPreset("tomorrow")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-center transition-colors border select-none cursor-pointer",
                  durationPreset === "tomorrow"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                )}
              >
                <div className={cn("text-[10px] uppercase font-semibold", durationPreset === "tomorrow" ? "text-blue-100" : "text-slate-400")}>
                  Tomorrow
                </div>
                <div className="text-xs font-bold">{tomorrowDefaultTime || "10:30"}</div>
              </button>

              {/* Custom */}
              <button
                type="button"
                onClick={() => setDurationPreset("custom")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-center transition-colors border select-none cursor-pointer flex flex-col items-center justify-center",
                  durationPreset === "custom"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                )}
              >
                <Calendar className={cn("size-3.5 mb-0.5", durationPreset === "custom" ? "text-white" : "text-slate-400")} />
                <div className="text-xs font-bold">Custom</div>
              </button>
            </div>


            {durationPreset === "custom" && (
              <div className="pt-2 animate-in fade-in duration-150">
                <CustomDateTimePicker
                  value={customDate}
                  onChange={(d) => setCustomDate(d)}
                />
              </div>
            )}
          </div>

          {/* Section 3: Employee Calling Note */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[11px] font-bold">
                    3
                  </span>
                  Employee Calling Note
                </label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                  <Zap className="size-3" /> Auto-generated note from outcome
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {note.length} / 500 chars
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={2}
                className="w-full bg-transparent text-xs text-slate-900 resize-none focus:outline-none placeholder:text-slate-400 leading-normal"
                placeholder="Enter specific notes about the customer call..."
              />

              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-200/80">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-semibold text-slate-400 mr-0.5">Quick Add:</span>
                  {[
                    "Keep Aadhaar ready",
                    "Spoke to spouse",
                    "Switched off",
                    "In meeting",
                    "WhatsApp link sent",
                  ].map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setNote((prev) => (prev ? `${prev} | ${quick}` : quick))}
                      className="px-2 py-0.5 rounded bg-white hover:bg-blue-600 hover:text-white border border-slate-200 text-[11px] font-medium text-slate-700 transition-colors shadow-2xs cursor-pointer"
                    >
                      + {quick}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium ml-auto">
                  {customerMobile && (
                    <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                      <ShieldCheck className="size-3.5" /> +91 {customerMobile}
                    </span>
                  )}
                  <span>• {staffName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Channel & Automated System Triggers */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3">
            {/* 4A: Follow-up Channel Reference (Call vs Email) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[11px] font-bold">
                    4
                  </span>
                  Follow-up Mode / Channel Reference
                </label>
                <span className="text-[11px] font-semibold text-slate-500">
                  Select whether to check Call or Email history
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Call Option */}
                <label
                  className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none",
                    channel === "call"
                      ? "bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/50 shadow-xs"
                      : "bg-white border-slate-200 hover:bg-slate-50/80"
                  )}
                >
                  <input
                    type="radio"
                    name="callback_channel"
                    value="call"
                    checked={channel === "call"}
                    onChange={() => setChannel("call")}
                    className="w-4 h-4 rounded-full accent-amber-600 cursor-pointer"
                  />
                  <div className="p-1.5 rounded-md bg-amber-100 text-amber-800">
                    <PhoneCall className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      Call <span className="text-[10px] font-semibold text-amber-700 font-mono">(Check Call)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Employee will check phone call history
                    </div>
                  </div>
                  {channel === "call" && (
                    <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                  )}
                </label>

                {/* Email Option */}
                <label
                  className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none",
                    channel === "email"
                      ? "bg-purple-50/80 border-purple-300 ring-1 ring-purple-400/50 shadow-xs"
                      : "bg-white border-slate-200 hover:bg-slate-50/80"
                  )}
                >
                  <input
                    type="radio"
                    name="callback_channel"
                    value="email"
                    checked={channel === "email"}
                    onChange={() => setChannel("email")}
                    className="w-4 h-4 rounded-full accent-purple-600 cursor-pointer"
                  />
                  <div className="p-1.5 rounded-md bg-purple-100 text-purple-800">
                    <Mail className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      Email <span className="text-[10px] font-semibold text-purple-700 font-mono">(Check Email)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Employee will check email thread history
                    </div>
                  </div>
                  {channel === "email" && (
                    <CheckCircle2 className="size-4 text-purple-600 shrink-0" />
                  )}
                </label>
              </div>
            </div>

            {/* 4B: Automated System Triggers */}
            <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Zap className="size-3.5 text-blue-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Automated System Triggers
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {[hotOrderSurge, desktopAlert, whatsappReminder].filter(Boolean).length} active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Trigger 1: Hot Order Surge */}
                <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:bg-slate-50/80 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={hotOrderSurge}
                    onChange={(e) => setHotOrderSurge(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-rose-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      🔥 Hot Order Surge
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Top list at {formatIST(targetDate.toISOString(), { timeOnly: true })} IST
                    </div>
                  </div>
                </label>

                {/* Trigger 2: Desktop Alert + Audio */}
                <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:bg-slate-50/80 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={desktopAlert}
                    onChange={(e) => setDesktopAlert(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      🔔 Desktop Alert + Audio
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Instant popup &amp; tone
                    </div>
                  </div>
                </label>

                {/* Trigger 3: WhatsApp Reminder */}
                <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:bg-slate-50/80 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={whatsappReminder}
                    onChange={(e) => setWhatsappReminder(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-emerald-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      💬 WhatsApp Reminder
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Auto-SMS to customer
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-xs font-bold border border-slate-300">
              {initials}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 leading-tight">
                {staffName}
              </span>
              <span className="text-[11px] text-slate-500 leading-tight">
                Assigned Executive
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => scheduleMut.mutate()}
              disabled={isBusy}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold shadow-md flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Clock className="size-4" />
              <span>{scheduleMut.isPending ? "Setting Timer…" : "Confirm & Set Callback Timer"}</span>
            </button>
          </div>
        </div>
      </div>

      {showHistory && (
        <CallbackHistoryDialog
          orderId={orderId}
          orderCode={orderCode}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
