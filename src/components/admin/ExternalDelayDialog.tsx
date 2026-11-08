import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, AlertTriangle, CalendarClock, MessageCircle, User2, Server,
  CheckCircle2, Info, Search,
} from "lucide-react";
import { setExternalDelay, listDelayReasons } from "@/lib/crm/workflow.functions";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Side = "customer" | "internal";
type Priority = "low" | "normal" | "high" | "urgent";

interface Props {
  applicationId: string;
  open: boolean;
  onClose: () => void;
  initialSide?: Side;
}

const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  low:    { label: "Low",    className: "border-slate-300 data-[on=true]:bg-slate-100 data-[on=true]:text-slate-900" },
  normal: { label: "Normal", className: "border-sky-300 data-[on=true]:bg-sky-50 data-[on=true]:text-sky-900" },
  high:   { label: "High",   className: "border-amber-300 data-[on=true]:bg-amber-50 data-[on=true]:text-amber-900" },
  urgent: { label: "Urgent", className: "border-rose-300 data-[on=true]:bg-rose-50 data-[on=true]:text-rose-900" },
};

const EXPECTED_PRESETS: { label: string; days: number }[] = [
  { label: "+1 day",  days: 1 },
  { label: "+3 days", days: 3 },
  { label: "+7 days", days: 7 },
  { label: "+14 days", days: 14 },
];

function daysFromNow(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function ExternalDelayDialog({ applicationId, open, onClose, initialSide = "customer" }: Props) {
  const qc = useQueryClient();
  const fnReasons = useServerFn(listDelayReasons);
  const fnSubmit = useServerFn(setExternalDelay);

  const { data: reasons, isLoading: reasonsLoading } = useQuery({
    queryKey: ["workflow-delay-reasons"],
    queryFn: () => fnReasons({ data: {} as never }),
    enabled: open,
  });

  const [side, setSide] = useState<Side>(initialSide);
  const [reasonCode, setReasonCode] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [expected, setExpected] = useState(() => daysFromNow(3));
  const [priority, setPriority] = useState<Priority>("normal");
  const [search, setSearch] = useState("");

  const allReasons = reasons?.reasons ?? [];
  const filteredReasons = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allReasons
      .filter((r: any) => (r.side ?? "customer") === side)
      .filter((r: any) =>
        !s || r.label.toLowerCase().includes(s) || (r.description ?? "").toLowerCase().includes(s),
      )
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [allReasons, side, search]);

  useEffect(() => {
    if (open) {
      setSide(initialSide);
      setSearch("");
      setInternalNote("");
      setCustomerNote("");
      setExpected(daysFromNow(3));
      setPriority("normal");
    }
  }, [open, initialSide]);

  useEffect(() => {
    if (open && filteredReasons.length && !filteredReasons.find((r: any) => r.code === reasonCode)) {
      setReasonCode(filteredReasons[0].code);
    }
     
  }, [open, side, reasons]);

  const selected = filteredReasons.find((r: any) => r.code === reasonCode) ?? null;

  const mut = useMutation({
    mutationFn: async () => {
      const reason = allReasons.find((r) => r.code === reasonCode);
      if (!reason) throw new Error("Please pick a reason");
      await fnSubmit({
        data: {
          applicationId,
          reasonCode,
          reasonLabel: reason.label,
          internalNote: internalNote || undefined,
          customerNote: customerNote || undefined,
          expectedReviewAt: expected,
          priority,
          kind: side === "internal" ? "government_portal_pending" : "external_dependency",
        },
      });
    },
    onSuccess: () => {
      toast.success(
        side === "customer"
          ? "Customer notified — 8-business-hour auto-closure scheduled."
          : "Technical delay marked — order placed on hold.",
      );

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
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 py-4 border-b bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center size-9 rounded-full bg-amber-100 text-amber-700">
              <AlertTriangle className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Pause order — mark delay</DialogTitle>
              <DialogDescription className="text-xs">
                Choose the correct reason. The workflow, email template, and auto-closure timer are set from it.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Side selector */}
        <div className="px-5 pt-4 pb-3 border-b bg-slate-50/50">
          <div className="grid grid-cols-2 gap-2">
            <SideCard
              active={side === "customer"}
              onClick={() => setSide("customer")}
              icon={<User2 className="size-4" />}
              title="Customer-side delay"
              subtitle="Sends E003 to the customer. Auto-closes in 8 hours if no reply."
              accent="amber"
            />
            <SideCard
              active={side === "internal"}
              onClick={() => setSide("internal")}
              icon={<Server className="size-4" />}
              title="Our-side (technical) delay"
              subtitle="Sends E003 to the customer AND creates an internal reminder for the assignee to follow up."

              accent="sky"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]">
          {/* LEFT: Reason list */}
          <div className="border-r">
            <div className="px-4 pt-3 pb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="size-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${side === "customer" ? "customer" : "internal"} reasons…`}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {filteredReasons.length} reason{filteredReasons.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <ScrollArea className="h-[340px] px-4 pb-4">
              {reasonsLoading ? (
                <div className="grid place-items-center h-40 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : filteredReasons.length === 0 ? (
                <div className="text-sm text-slate-500 py-10 text-center">
                  No reasons configured for this side.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredReasons.map((r: any) => {
                    const on = r.code === reasonCode;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setReasonCode(r.code)}
                        className={cn(
                          "w-full text-left rounded-lg border p-2.5 transition group",
                          on
                            ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              "mt-0.5 size-4 rounded-full border grid place-items-center shrink-0",
                              on ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300 bg-white",
                            )}
                          >
                            {on && <CheckCircle2 className="size-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium text-slate-900 leading-snug">
                              {r.label}
                            </div>
                            {r.description && (
                              <div className="text-[11.5px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
                                {r.description}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[9.5px] font-mono uppercase text-slate-400 tracking-wider">
                                {r.code}
                              </span>
                              {r.email_template_code && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                  {r.email_template_code.toUpperCase().replace("BHS_", "")}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* RIGHT: Delay configuration */}
          <div className="p-4 space-y-4 bg-slate-50/30">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <CalendarClock className="size-3" /> Expected review date
              </Label>
              <Input
                type="date"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="mt-1 h-9"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {EXPECTED_PRESETS.map((p) => {
                  const val = daysFromNow(p.days);
                  const on = val === expected;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setExpected(val)}
                      className={cn(
                        "text-[10.5px] font-medium rounded border px-1.5 py-0.5 transition",
                        on
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">Priority</Label>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
                  const meta = PRIORITY_META[p];
                  const on = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      data-on={on}
                      onClick={() => setPriority(p)}
                      className={cn(
                        "text-[11px] font-semibold rounded-md border px-1.5 py-1.5 transition bg-white text-slate-600",
                        meta.className,
                      )}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {side === "customer" && (
              <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-[11.5px] text-amber-900 flex gap-2">
                <Info className="size-3.5 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  Customer will receive the delay notice email now. Order auto-closes after
                  <b> 8 hours</b> if there's no reply. You can <b>Resume</b> anytime before that.
                </div>
              </div>
            )}
            {side === "internal" && (
              <div className="rounded-md border border-sky-200 bg-sky-50/70 p-2.5 text-[11.5px] text-sky-900 flex gap-2">
                <Info className="size-3.5 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  No email is sent to the customer. Assignee is notified now and reminded again on the
                  expected review date. Order stays paused until you <b>Resume</b> it.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="px-5 py-4 border-t space-y-3 bg-white">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-500">
              Internal note (visible to the team only)
            </Label>
            <Textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={2}
              className="mt-1 text-sm"
              placeholder={selected?.description ? `e.g. ${selected.description.slice(0, 80)}…` : "Add context for the team"}
            />
          </div>
          {side === "customer" && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <MessageCircle className="size-3" /> Customer-visible note (optional — appended to the email)
              </Label>
              <Textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                rows={2}
                className="mt-1 text-sm"
                placeholder="Will be included at the bottom of the delay email"
              />
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-slate-50 gap-2">
          <div className="mr-auto text-[11px] text-slate-500 flex items-center gap-1.5">
            {selected ? (
              <>
                <CheckCircle2 className="size-3 text-emerald-600" />
                <span>
                  Selected: <b className="text-slate-700">{selected.label}</b>
                </span>
              </>
            ) : (
              <span>Pick a reason to continue</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !reasonCode}
            className="gap-1.5"
          >
            {mut.isPending && <Loader2 className="size-3 animate-spin" />}
            {side === "customer" ? "Save & notify customer" : "Save & notify assignee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SideCard({
  active, onClick, icon, title, subtitle, accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: "amber" | "sky";
}) {
  const accentCls =
    accent === "amber"
      ? "border-amber-400 bg-amber-50/60 ring-amber-200"
      : "border-sky-400 bg-sky-50/60 ring-sky-200";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-2.5 text-left transition flex gap-2.5 items-start bg-white",
        active ? `${accentCls} ring-1` : "border-slate-200 hover:border-slate-300",
      )}
    >
      <div
        className={cn(
          "grid place-items-center size-8 rounded-md shrink-0",
          accent === "amber" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-900">{title}</div>
        <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{subtitle}</div>
      </div>
    </button>
  );
}
