import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X, ShieldAlert, Search, FileText, AlertTriangle, CheckCircle2, Mail, HelpCircle, VolumeX } from "lucide-react";
import { closeOrder } from "@/lib/crm/workflow-closure.functions";
import { listCloseReasons, type OrderCloseReason } from "@/lib/orders/actions/reasons.functions";
import { listClosureReasons } from "@/lib/crm/workflow.functions";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CloseOrderDialog({
  applicationId,
  open,
  adminOverride = false,
  onClose,
}: {
  applicationId: string;
  open: boolean;
  adminOverride?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const role = useRole();
  const isAdmin = role.hasAny(["super_admin", "admin"]);
  const [isSilent, setIsSilent] = useState<boolean>(false);
  const fnStandardReasons = useServerFn(listCloseReasons);
  const fnWfReasons = useServerFn(listClosureReasons);
  const fnClose = useServerFn(closeOrder);

  const { data: stdReasons = [], isLoading: loadingStd } = useQuery({
    queryKey: ["order-close-reasons-std"],
    queryFn: () => fnStandardReasons(),
    enabled: open,
  });

  const { data: wfData, isLoading: loadingWf } = useQuery({
    queryKey: ["workflow-closure-reasons"],
    queryFn: () => fnWfReasons({ data: {} as never }),
    enabled: open,
  });

  // Combine & deduplicate reasons from both sources
  const allReasons = useMemo(() => {
    const list: Array<{ id: string; code: string; label: string; category: string; standard_reply: string | null }> = [];
    const seenCodes = new Set<string>();

    for (const r of stdReasons) {
      const code = r.id || `R${r.number}`;
      if (!seenCodes.has(code.toLowerCase())) {
        seenCodes.add(code.toLowerCase());
        list.push({
          id: r.id,
          code,
          label: r.label,
          category: r.category === "A" ? "Customer-Side Delay" : r.category === "B" ? "Government Portal Delay" : r.category === "C" ? "Technical Interruption" : r.category || "Standard Reasons",
          standard_reply: r.standard_reply,
        });
      }
    }

    if (wfData?.reasons) {
      for (const r of wfData.reasons) {
        if (!seenCodes.has(r.code.toLowerCase())) {
          seenCodes.add(r.code.toLowerCase());
          list.push({
            id: r.code,
            code: r.code,
            label: r.label,
            category: "Workflow Reasons",
            standard_reply: r.description,
          });
        }
      }
    }

    return list;
  }, [stdReasons, wfData]);

  const [selectedCode, setSelectedCode] = useState<string>("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [notes, setNotes] = useState("");

  // Select first available reason when dialog opens
  useEffect(() => {
    if (open && allReasons.length > 0) {
      if (!selectedCode || !allReasons.some((r) => r.code === selectedCode)) {
        setSelectedCode(allReasons[0].code);
      }
    }
  }, [open, allReasons, selectedCode]);

  const filteredReasons = useMemo(() => {
    return allReasons.filter((r) => {
      const matchesSearch =
        !search.trim() ||
        r.label.toLowerCase().includes(search.toLowerCase()) ||
        r.code.toLowerCase().includes(search.toLowerCase()) ||
        (r.standard_reply && r.standard_reply.toLowerCase().includes(search.toLowerCase()));

      const matchesCat =
        activeCategory === "ALL" ||
        (activeCategory === "A" && (r.category.includes("Customer") || r.code.startsWith("A"))) ||
        (activeCategory === "BC" && (r.category.includes("Government") || r.category.includes("Technical") || r.code.startsWith("B") || r.code.startsWith("C")));

      return matchesSearch && matchesCat;
    });
  }, [allReasons, search, activeCategory]);

  const selectedReason = useMemo(() => {
    return allReasons.find((r) => r.code === selectedCode) ?? allReasons[0] ?? null;
  }, [allReasons, selectedCode]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!selectedReason) throw new Error("Please select a closure reason.");

      await fnClose({
        data: {
          applicationId,
          reasonCode: selectedReason.code,
          reasonLabel: selectedReason.label,
          notes: notes.trim() || undefined,
          silent: isSilent,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Order closed — closure reason: ${selectedReason?.label ?? "Force Closed"}`);
      qc.invalidateQueries({ queryKey: ["admin.order", applicationId] });
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["order-workflow-state", applicationId] });
      qc.invalidateQueries({ queryKey: ["workflow-events", applicationId] });
      qc.invalidateQueries({ queryKey: ["order-detail-v2", applicationId] });
      qc.invalidateQueries({ queryKey: ["workflow-timers", applicationId] });
      qc.invalidateQueries({ queryKey: ["order-tickets", applicationId] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to force close order"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-100 bg-gradient-to-r from-rose-50/80 via-slate-50 to-rose-50/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 font-bold shadow-xs">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Force Close Order (B10)</h2>
              <p className="text-xs text-slate-500">Select a reason to terminate the order, cancel timers, and send closure notice.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => setActiveCategory("ALL")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                activeCategory === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              All Reasons ({allReasons.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("A")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                activeCategory === "A"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100"
              )}
            >
              Category A (Customer)
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("BC")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                activeCategory === "BC"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-sky-50 text-sky-800 hover:bg-sky-100"
              )}
            >
              Category B/C (Govt/Tech)
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search close reason by name, code or keyword..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 transition"
            />
          </div>

          {/* Main Reason Select Box */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Select Closure Reason <span className="text-rose-500">*</span>
            </label>

            {loadingStd || loadingWf ? (
              <div className="flex items-center justify-center py-6 text-xs text-slate-500 gap-2">
                <Loader2 className="size-4 animate-spin text-rose-500" /> Loading reasons list...
              </div>
            ) : (
              <select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 shadow-xs focus:border-rose-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
              >
                {filteredReasons.length === 0 ? (
                  <option value="">No matching reasons found</option>
                ) : (
                  filteredReasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      [{r.code}] {r.label}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Selected Reason Preview Card */}
          {selectedReason && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-mono font-bold text-white shadow-xs">
                    {selectedReason.code}
                  </span>
                  <span className="text-xs font-bold text-indigo-950">
                    {selectedReason.label}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider bg-indigo-100/80 px-2 py-0.5 rounded-full">
                  {selectedReason.category}
                </span>
              </div>

              {selectedReason.standard_reply ? (
                <div className="text-[11px] text-slate-700 bg-white/80 rounded-lg p-2.5 border border-indigo-100 whitespace-pre-wrap leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900 mb-1 text-[11px]">
                    <Mail className="size-3 text-indigo-600" /> Standard Email Reply Preview (E010):
                  </div>
                  {selectedReason.standard_reply}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  No standard reply text attached. Standard closure email notice will be sent.
                </p>
              )}
            </div>
          )}

          {/* Optional Notes / Staff Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Internal Staff Remarks / Remarks for Customer <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add specific remarks or context for closing this order..."
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 transition"
            />
          </div>

          {/* Admin Override Silent Mode Option */}
          {isAdmin && adminOverride && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <VolumeX className="size-4 text-amber-700 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-amber-900">Silent Close Mode (No Email)</div>
                  <div className="text-[11px] text-amber-800">Do not send E010 closure confirmation email to customer.</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSilent}
                  onChange={(e) => setIsSilent(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>
          )}

          {/* Warning Banner */}
          {isSilent ? (
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-900 p-3 border border-slate-700 text-xs text-slate-200">
              <VolumeX className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white">Silent Closure Active:</p>
                <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                  This order will be closed silently on the system. <b>No email or notification</b> will be sent to the customer.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 border border-amber-200/80 text-xs text-amber-900">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Important Notice:</p>
                <p className="text-[11px] text-amber-800/90 leading-tight mt-0.5">
                  Force closing this order will set its status to <b>CLOSED</b>, immediately cancel all running timers, and queue the <b>E010 Closure Notice</b> email to the customer.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer transition select-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !selectedCode}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50 cursor-pointer transition select-none",
              isSilent ? "bg-amber-600 hover:bg-amber-700" : "bg-rose-600 hover:bg-rose-700"
            )}
          >
            {mut.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {mut.isPending
              ? "Closing…"
              : isSilent
                ? "Confirm Silent Close (No Email)"
                : "Confirm Force Close Order (B10)"}
          </button>
        </div>

      </div>
    </div>
  );
}
