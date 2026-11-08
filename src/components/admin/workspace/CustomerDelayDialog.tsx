import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  MessageCircle,
  Info,
  Search,
  User2,
  Phone,
  PhoneOff,
  XCircle,
  FileText,
  Clock,
  MessageSquare,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { setExternalDelay, listDelayReasons } from "@/lib/crm/workflow.functions";
import { getAppSettings } from "@/lib/settings/app-settings.functions";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  applicationId: string;
  open: boolean;
  onClose: () => void;
}

function fmtDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60),
      m = mins % 60;
    return m ? `${h}h ${m}m` : `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.floor(mins / (60 * 24));
  return `${d} day${d === 1 ? "" : "s"}`;
}

function KeypadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="4" />
      <path d="M7 8h2" />
      <path d="M11 8h2" />
      <path d="M15 8h2" />
      <path d="M7 12h2" />
      <path d="M11 12h2" />
      <path d="M15 12h2" />
      <path d="M7 16h2" />
      <path d="M11 16h2" />
      <path d="M15 16h2" />
    </svg>
  );
}

interface ReasonVisuals {
  Icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
}

function getReasonVisuals(r: { code: string; label: string }): ReasonVisuals {
  const code = (r.code || "").toLowerCase();
  const label = (r.label || "").toLowerCase();

  // 1. Customer Unreachable / Non-Responsive
  if (
    code.includes("customer_non_responsive") ||
    code.includes("unreachable") ||
    label.includes("unreachable") ||
    label.includes("non-responsive")
  ) {
    return {
      Icon: Phone,
      iconBg: "bg-blue-100 text-blue-600",
    };
  }

  // 2. OTP / Verification Assistance Not Provided
  if (
    code.includes("otp") ||
    code.includes("verification") ||
    label.includes("otp") ||
    label.includes("verification assistance")
  ) {
    return {
      Icon: KeypadIcon,
      iconBg: "bg-purple-100 text-purple-600",
    };
  }

  // 3. User Does Not Wish to Proceed
  if (
    code.includes("user_does_not_wish_to_proceed") ||
    code.includes("change_of_mind") ||
    label.includes("does not wish") ||
    label.includes("wish to proceed") ||
    label.includes("change of mind")
  ) {
    return {
      Icon: XCircle,
      iconBg: "bg-rose-100 text-rose-500",
    };
  }

  // 4. Required Documents Not Provided
  if (
    code.includes("documents_missing") ||
    code.includes("document") ||
    label.includes("document")
  ) {
    return {
      Icon: FileText,
      iconBg: "bg-emerald-100 text-emerald-600",
    };
  }

  // 5. Incorrect / Incomplete Information Provided
  if (
    code.includes("incorrect_information") ||
    label.includes("incorrect") ||
    label.includes("incomplete")
  ) {
    return {
      Icon: User2,
      iconBg: "bg-amber-100 text-amber-600",
    };
  }

  // 6. Customer Requested to Wait / On Hold
  if (
    code.includes("wait") ||
    code.includes("on_hold") ||
    label.includes("wait") ||
    label.includes("on hold")
  ) {
    return {
      Icon: Clock,
      iconBg: "bg-amber-100 text-amber-500",
    };
  }

  // 7. Call Not Answered
  if (
    code.includes("call_not_answered") ||
    label.includes("call not answered") ||
    label.includes("call not")
  ) {
    return {
      Icon: PhoneOff,
      iconBg: "bg-pink-100 text-pink-500",
    };
  }

  // 8. Not Responding on WhatsApp / Email
  if (
    code.includes("whatsapp") ||
    code.includes("email") ||
    label.includes("whatsapp") ||
    label.includes("email")
  ) {
    return {
      Icon: MessageSquare,
      iconBg: "bg-teal-100 text-teal-600",
    };
  }

  // Fallbacks
  if (code.includes("eligibility") || label.includes("eligibility")) {
    return {
      Icon: AlertTriangle,
      iconBg: "bg-indigo-100 text-indigo-600",
    };
  }

  return {
    Icon: Clock,
    iconBg: "bg-sky-100 text-sky-600",
  };
}

function getBadgeText(r: any): string {
  if (r.email_template_code) {
    return r.email_template_code.toUpperCase().replace(/^BHS_/, "");
  }
  return (r.code || "").toUpperCase();
}

export function CustomerDelayDialog({ applicationId, open, onClose }: Props) {
  const qc = useQueryClient();
  const fnReasons = useServerFn(listDelayReasons);
  const fnSubmit = useServerFn(setExternalDelay);
  const fnSettings = useServerFn(getAppSettings);

  const { data: reasons, isLoading: reasonsLoading } = useQuery({
    queryKey: ["workflow-delay-reasons"],
    queryFn: () => fnReasons({ data: {} as never }),
    enabled: open,
  });
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => fnSettings(),
    enabled: open,
  });

  const autocloseMinutes: number = (settings as any)?.customerDelayAutocloseMinutes ?? 480;

  const [reasonCode, setReasonCode] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [search, setSearch] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const allReasons = reasons?.reasons ?? [];
  const filteredReasons = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allReasons
      .filter((r: any) => (r.side ?? "customer") === "customer")
      .filter(
        (r: any) =>
          !s ||
          r.label.toLowerCase().includes(s) ||
          (r.description ?? "").toLowerCase().includes(s) ||
          r.code.toLowerCase().includes(s),
      )
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [allReasons, search]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setInternalNote("");
      setCustomerNote("");
      setReasonCode("");
      setShowNotes(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && filteredReasons.length && !filteredReasons.find((r: any) => r.code === reasonCode)) {
      setReasonCode(filteredReasons[0].code);
    }
  }, [open, reasons]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = filteredReasons.find((r: any) => r.code === reasonCode) ?? null;
  const selectedVisuals = selected ? getReasonVisuals(selected) : null;
  const selectedBadge = selected ? getBadgeText(selected) : "";

  const mut = useMutation({
    mutationFn: async () => {
      const reason = allReasons.find((r) => r.code === reasonCode);
      if (!reason) throw new Error("Please pick a reason");
      const expectedIso = new Date(Date.now() + autocloseMinutes * 60_000).toISOString().slice(0, 10);
      await fnSubmit({
        data: {
          applicationId,
          reasonCode,
          reasonLabel: reason.label,
          internalNote: internalNote || undefined,
          customerNote: customerNote || undefined,
          expectedReviewAt: expectedIso,
          priority: "normal",
          kind: "external_dependency",
        },
      });
    },
    onSuccess: () => {
      toast.success(`Customer notified — auto-closes in ${fmtDuration(autocloseMinutes)} if no reply.`);
      qc.invalidateQueries({ queryKey: ["workflow-events", applicationId] });
      qc.invalidateQueries({ queryKey: ["workflow-reminders", applicationId] });
      qc.invalidateQueries({ queryKey: ["order-detail-v2", applicationId] });
      qc.invalidateQueries({ queryKey: ["order-workflow-state", applicationId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to mark delay"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] md:w-full max-h-[92vh] flex flex-col p-0 overflow-hidden gap-0 rounded-2xl bg-white shadow-2xl border border-slate-200">
        {/* Header matching design */}
        <DialogHeader className="shrink-0 px-6 py-5 border-b border-slate-100 flex-row items-center gap-3.5 space-y-0 text-left">
          <div className="size-12 rounded-2xl bg-blue-50 border border-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
            <User2 className="size-6 stroke-[2.2]" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold text-slate-900 tracking-tight">
              Customer-side delay
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 font-normal mt-0.5">
              Select the reason for the delay
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Search Row */}
        <div className="shrink-0 px-6 pt-5 pb-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer reasons..."
              className="pl-10 h-10 text-sm rounded-xl border-slate-200 bg-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 shadow-none"
            />
          </div>
          <div className="h-10 px-4 rounded-xl bg-slate-100/90 border border-slate-200/60 text-slate-600 font-medium text-xs flex items-center justify-center shrink-0">
            {filteredReasons.length} reason{filteredReasons.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Reasons Grid (Scrollable) */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-2">
          {reasonsLoading ? (
            <div className="grid place-items-center h-48 text-sm text-slate-500">
              <Loader2 className="size-6 animate-spin text-blue-600" />
            </div>
          ) : filteredReasons.length === 0 ? (
            <div className="text-sm text-slate-500 py-16 text-center">
              No matching customer reasons found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pb-2">
              {filteredReasons.map((r: any) => {
                const isSelected = r.code === reasonCode;
                const visuals = getReasonVisuals(r);
                const badgeText = getBadgeText(r);

                return (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setReasonCode(r.code)}
                    className={cn(
                      "group w-full text-left rounded-2xl p-3.5 transition-all flex items-start gap-3 relative",
                      isSelected
                        ? "border-2 border-blue-500 bg-blue-50/25 ring-4 ring-blue-500/10 shadow-sm"
                        : "border border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/50",
                    )}
                  >
                    {/* Radio Button */}
                    <div
                      className={cn(
                        "size-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        isSelected ? "border-blue-600" : "border-slate-300 group-hover:border-slate-400",
                      )}
                    >
                      {isSelected && <div className="size-2.5 rounded-full bg-blue-600" />}
                    </div>

                    {/* Colorful Icon Box */}
                    <div
                      className={cn(
                        "size-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                        visuals.iconBg,
                      )}
                    >
                      <visuals.Icon className="size-5" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold text-slate-900 leading-snug">
                        {r.label}
                      </div>
                      {r.description && (
                        <p className="text-[11.5px] text-slate-500 leading-relaxed mt-1 line-clamp-2">
                          {r.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="inline-flex items-center text-[10px] font-mono font-semibold text-slate-600 bg-slate-100/90 border border-slate-200/70 px-2 py-0.5 rounded-md tracking-wide">
                          {badgeText}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Collapsible Optional Notes & Auto-Close Info */}
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/40">
          <div className="px-6 py-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs font-medium text-slate-600 hover:text-blue-600 flex items-center gap-1.5 transition py-0.5"
            >
              <FileText className="size-3.5 text-slate-400" />
              <span>{showNotes ? "Hide notes & auto-close info" : "+ Add internal or email note (optional)"}</span>
              {showNotes ? <ChevronUp className="size-3.5 text-slate-400" /> : <ChevronDown className="size-3.5 text-slate-400" />}
              {(internalNote || customerNote) && (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-full ml-1">
                  Note added
                </span>
              )}
            </button>
            <div className="text-[11px] text-slate-400 hidden sm:block">
              Auto-closes in <span className="font-semibold text-slate-600">{fmtDuration(autocloseMinutes)}</span> if no reply
            </div>
          </div>

          {showNotes && (
            <div className="px-6 pb-4 pt-1 space-y-3 bg-slate-50/80 border-t border-slate-100 animate-in fade-in-50 duration-150">
              <div className="flex items-start gap-2.5 text-xs text-amber-900 bg-amber-50/90 border border-amber-200/80 rounded-xl p-3">
                <Info className="size-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="leading-snug text-[11.5px]">
                  Customer receives <b>{selectedBadge || "E003"}</b> intimation now. Order auto-closes after{" "}
                  <b>{fmtDuration(autocloseMinutes)}</b> of no reply. You can <b>Resume</b> anytime before that.
                </div>
              </div>

              <div>
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                  Internal note (visible to the team only)
                </Label>
                <Textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                  className="mt-1 text-xs bg-white border-slate-200 rounded-lg"
                  placeholder={
                    selected?.description
                      ? `e.g. ${selected.description.slice(0, 80)}…`
                      : "Add context for the team"
                  }
                />
              </div>

              <div>
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1.5">
                  <MessageCircle className="size-3 text-slate-400" />
                  Customer-visible note (optional — appended to the email)
                </Label>
                <Textarea
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  rows={2}
                  className="mt-1 text-xs bg-white border-slate-200 rounded-lg"
                  placeholder="Will be included at the bottom of the delay email"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer matching design */}
        <div className="shrink-0 px-6 py-3.5 border-t border-slate-200/80 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Selected Reason Preview */}
          <div className="w-full sm:w-auto min-w-0 flex items-center gap-2.5">
            {selected && selectedVisuals ? (
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="size-4 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="size-2 rounded-full bg-blue-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-400">Selected Reason:</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div
                      className={cn(
                        "size-7 rounded-lg flex items-center justify-center shrink-0",
                        selectedVisuals.iconBg,
                      )}
                    >
                      <selectedVisuals.Icon className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate max-w-[280px] md:max-w-[380px]">
                        {selected.label}
                      </div>
                      {selected.description && (
                        <div className="text-[11px] text-slate-500 truncate max-w-[280px] md:max-w-[380px]">
                          {selected.description}
                        </div>
                      )}
                      <div className="mt-0.5">
                        <span className="inline-flex items-center text-[9px] font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-200/60 px-1.5 py-0.2 rounded">
                          {selectedBadge}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-400">Pick a reason to continue</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0 ml-auto w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-10 px-5 text-sm font-medium text-slate-700 rounded-xl border-slate-200 hover:bg-slate-100"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !reasonCode}
              className="h-10 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition gap-2"
            >
              {mut.isPending && <Loader2 className="size-4 animate-spin" />}
              Mark Customer Delay
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

