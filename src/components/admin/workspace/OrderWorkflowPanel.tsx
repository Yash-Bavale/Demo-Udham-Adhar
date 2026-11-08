// Employee Workflow tab body: engine-driven live status + controls + notes/history.
// - Live status: engine chips, active-ticket, pause reason.
// - Payment mini-card (mirrors Customer Journey so it's visible here too).
// - Live timers list with Pause / Resume / Cancel.
// - Live automations list with Pause / Resume / Stop.
// - Existing internal-notes + reminders + activity history retained below.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell, Clock, X, Plus, History, ChevronDown, ChevronRight,
  Cog, AlarmClock, PlayCircle, PauseCircle, StopCircle, CheckCircle2, Ticket, CreditCard,
} from "lucide-react";

import {
  listWorkflowEvents, listWorkflowReminders,
  appendWorkflowEvent, cancelWorkflowReminder,
} from "@/lib/crm/workflow.functions";
import { controlTimer, controlAutomation } from "@/lib/workflow/engine.functions";
import { useOrderWorkflow } from "@/hooks/useOrderWorkflow";
import { STAGE_LABEL, TIMER_LABEL, AUTO_LABEL } from "@/lib/workflow/engine-view";
import { formatIST, relativeIST } from "@/lib/datetime";
import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";
import type { FulfillmentStatus } from "@/lib/crm/fulfillment-transitions";

export function OrderWorkflowPanel(_props: {
  applicationId: string;
  payments?: any[];
  hideAmount?: boolean;
  current?: FulfillmentStatus;
  workflowStatus?: string | null;
  closureStage?: string | null;
  closureNextAt?: string | null;
  cancellationRequestedAt?: string | null;
  reasonCode?: string | null;
  reasonText?: string | null;
}) {
  return null;
}

// ── Engine controls ─────────────────────────────────────────────────────────
function EngineControls({
  applicationId, payments, hideAmount, onRefresh,
}: { applicationId: string; payments: any[]; hideAmount: boolean; onRefresh: () => void }) {
  const { view, isLoading } = useOrderWorkflow(applicationId);
  const fnTimer = useServerFn(controlTimer);
  const fnAuto = useServerFn(controlAutomation);

  const timerMut = useMutation({
    mutationFn: (v: { timerId: string; action: "pause" | "resume" | "cancel" }) => fnTimer({ data: v }),
    onSuccess: (_r, v) => { toast.success(`Timer ${v.action}d`); onRefresh(); },
    onError: (e) => toast.error(String(e)),
  });
  const autoMut = useMutation({
    mutationFn: (v: { automationId: string; action: "pause" | "resume" | "stop" }) => fnAuto({ data: v }),
    onSuccess: (_r, v) => { toast.success(`Automation ${v.action}d`); onRefresh(); },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-slate-600">
          <Cog className="size-3.5" /> Workflow engine
        </div>
        <OverallChip view={view} />
      </div>

      <div className="px-5 py-4 space-y-4">
        {isLoading ? (
          <div className="text-xs text-slate-500">Loading engine state…</div>
        ) : !view.hasEngine ? (
          <div className="text-xs text-slate-500">
            No workflow row yet. The engine initialises this order automatically on the next event.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Kv label="Stage" value={STAGE_LABEL[view.stage ?? ""] ?? String(view.stage)} />
              <Kv label="Status" value={String(view.status ?? "—").replaceAll("_", " ")} />
              {view.subStatus && <Kv label="Sub-status" value={String(view.subStatus).replaceAll("_", " ")} />}
              {view.pauseReason && <Kv label="Pause reason" value={String(view.pauseReason).replaceAll("_", " ")} />}
            </div>

            {view.activeTicketId && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 inline-flex items-center gap-1">
                <Ticket className="size-3" /> Active support ticket — engine paused pending resolution.
              </div>
            )}

            <PaymentInline payments={payments} hideAmount={hideAmount} />

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <AlarmClock className="size-3" /> Live timers ({view.timers.length})
              </div>
              {view.timers.length === 0 ? (
                <div className="text-xs text-slate-500">No active timers.</div>
              ) : (
                <ul className="space-y-1">
                  {view.timers.map((t) => (
                    <li key={t.id} className="flex items-center justify-between rounded-md border bg-white px-2 py-1 text-xs gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{TIMER_LABEL[t.kind] ?? t.kind}</span>
                          <StatusChip status={t.status} />
                        </div>
                        {t.fires_at && (
                          <div className="text-[11px] text-slate-500" title={formatIST(t.fires_at)}>
                            {t.status === "paused" ? "paused" : `fires ${relativeIST(t.fires_at)}`}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {t.status === "running" && (
                          <IconBtn onClick={() => timerMut.mutate({ timerId: t.id, action: "pause" })} label="Pause">
                            <PauseCircle className="size-3.5" />
                          </IconBtn>
                        )}
                        {t.status === "paused" && (
                          <IconBtn onClick={() => timerMut.mutate({ timerId: t.id, action: "resume" })} label="Resume">
                            <PlayCircle className="size-3.5" />
                          </IconBtn>
                        )}
                        <IconBtn onClick={() => timerMut.mutate({ timerId: t.id, action: "cancel" })} label="Cancel" tone="rose">
                          <X className="size-3.5" />
                        </IconBtn>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Cog className="size-3" /> Automations ({view.automations.length})
              </div>
              {view.automations.length === 0 ? (
                <div className="text-xs text-slate-500">No active automations.</div>
              ) : (
                <ul className="space-y-1">
                  {view.automations.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-md border bg-white px-2 py-1 text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{AUTO_LABEL[a.code] ?? a.code}</span>
                        <StatusChip status={a.status} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {a.status === "running" && (
                          <IconBtn onClick={() => autoMut.mutate({ automationId: a.id, action: "pause" })} label="Pause">
                            <PauseCircle className="size-3.5" />
                          </IconBtn>
                        )}
                        {a.status === "paused" && (
                          <IconBtn onClick={() => autoMut.mutate({ automationId: a.id, action: "resume" })} label="Resume">
                            <PlayCircle className="size-3.5" />
                          </IconBtn>
                        )}
                        <IconBtn onClick={() => autoMut.mutate({ automationId: a.id, action: "stop" })} label="Stop" tone="rose">
                          <StopCircle className="size-3.5" />
                        </IconBtn>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OverallChip({ view }: { view: ReturnType<typeof useOrderWorkflow>["view"] }) {
  const Icon =
    view.overallTone === "running" ? PlayCircle
    : view.overallTone === "paused" ? PauseCircle
    : view.overallTone === "completed" ? CheckCircle2
    : StopCircle;
  const cls =
    view.overallTone === "running" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : view.overallTone === "paused" ? "bg-amber-50 text-amber-800 border-amber-200"
    : view.overallTone === "completed" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
    : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="size-3" /> {view.overallLabel}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "running" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "paused" ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>
      {status}
    </span>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-slate-800 font-medium mt-0.5 capitalize">{value}</div>
    </div>
  );
}

function IconBtn({ onClick, label, tone, children }: { onClick: () => void; label: string; tone?: "rose"; children: React.ReactNode }) {
  const cls = tone === "rose"
    ? "text-rose-600 hover:bg-rose-50 border-rose-200"
    : "text-slate-600 hover:bg-slate-100 border-slate-200";
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`inline-flex items-center justify-center rounded-md border bg-white size-6 ${cls}`}>
      {children}
    </button>
  );
}

function PaymentInline({ payments, hideAmount }: { payments: any[]; hideAmount: boolean }) {
  const { formatINR } = useFinancialVisibility();
  const paid = payments.filter((p) => (p.status === "success" || p.status === "captured" || p.status === "completed") && Number(p.amount ?? 0) > 0);
  const total = paid.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const latest = paid[0] ?? payments[0] ?? null;
  const fmt = (n: number) => (hideAmount ? "₹••••••" : formatINR(n));

  if (payments.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 inline-flex items-center gap-2">
        <CreditCard className="size-3.5 text-amber-700" />
        <span className="font-semibold">Payment</span>
        <span>· Awaiting payment</span>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-900">
          <CreditCard className="size-3.5 text-emerald-700" /> Payment
        </span>
        <span className="text-emerald-800">{fmt(total)} received</span>
        {latest?.gateway_name && <span className="text-slate-600">via <b>{latest.gateway_name}</b></span>}
        {(latest?.txn_id ?? latest?.gateway_txn_id) && (
          <span className="text-slate-600">Txn <b className="font-mono">{latest.txn_id ?? latest.gateway_txn_id}</b></span>
        )}
        {(latest?.payment_date ?? latest?.created_at) && (
          <span className="text-slate-500">{formatIST(latest.payment_date ?? latest.created_at)}</span>
        )}
      </div>
    </div>
  );
}

// ── Existing history section (internal notes + reminders + activity) ────────
function HistorySection({ applicationId, onRefresh }: { applicationId: string; onRefresh: () => void }) {
  const fnEvents = useServerFn(listWorkflowEvents);
  const fnReminders = useServerFn(listWorkflowReminders);
  const fnAppend = useServerFn(appendWorkflowEvent);
  const fnCancel = useServerFn(cancelWorkflowReminder);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const events = useQuery({ queryKey: ["workflow-events", applicationId], queryFn: () => fnEvents({ data: { applicationId } }) });
  const reminders = useQuery({ queryKey: ["workflow-reminders", applicationId], queryFn: () => fnReminders({ data: { applicationId } }) });

  const noteMut = useMutation({
    mutationFn: async () => fnAppend({ data: { applicationId, eventType: "internal_note", title: "Internal note", description: noteText } }),
    onSuccess: () => { toast.success("Note saved"); setNoteOpen(false); setNoteText(""); onRefresh(); },
  });
  const cancelMut = useMutation({
    mutationFn: async (id: string) => fnCancel({ data: { id } }),
    onSuccess: () => { toast.success("Reminder cancelled"); onRefresh(); },
  });

  const pending = (reminders.data?.reminders ?? []).filter((r: any) => r.status === "pending");

  return (
    <div className="border-t border-slate-100 px-5 py-4 space-y-4 bg-slate-50/30">
      <div className="flex justify-end">
        <button onClick={() => setNoteOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Plus className="size-3" /> Add internal note
        </button>
      </div>

      {pending.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
            <Bell className="size-3" /> Scheduled reminders ({pending.length})
          </div>
          <div className="space-y-1">
            {pending.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border bg-white px-2 py-1 text-xs">
                <div>
                  <span className="font-medium">{r.kind}</span>
                  {r.template_code && <span className="text-slate-500"> · {r.template_code}</span>}
                  <span className="ml-2 text-slate-500">Due {formatIST(r.due_at)}</span>
                </div>
                <button onClick={() => cancelMut.mutate(r.id)} className="text-slate-400 hover:text-slate-700"><X className="size-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Activity</div>
        {events.isLoading ? (
          <div className="py-6 text-center text-sm text-slate-500">Loading…</div>
        ) : (events.data?.events ?? []).length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">No workflow events yet.</div>
        ) : (
          <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 max-h-[400px] overflow-y-auto">
            {(events.data?.events ?? []).map((e: any) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1 size-3 rounded-full border-2 border-white bg-indigo-500" />
                <div className="text-sm font-medium">{e.title}</div>
                {e.description && <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{e.description}</div>}
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                  <Clock className="size-3" /> {formatIST(e.created_at)} · {e.is_system ? "System" : e.actor_name ?? "Staff"}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {noteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl">
            <div className="font-semibold mb-2">Add internal note</div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4}
              className="w-full rounded-md border bg-white px-2 py-1.5 text-sm" />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setNoteOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={() => noteMut.mutate()} disabled={!noteText.trim() || noteMut.isPending}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
