import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Clock, AlertTriangle, RotateCcw, MessageSquare, X, Plus, Bell } from "lucide-react";
import {
  listWorkflowEvents,
  listWorkflowReminders,
  resumeOrder,
  markCustomerReplied,
  appendWorkflowEvent,
  cancelWorkflowReminder,
} from "@/lib/crm/workflow.functions";
import { ExternalDelayDialog } from "./ExternalDelayDialog";
import { CloseOrderDialog } from "./CloseOrderDialog";
import { RefundRequestDialog } from "./RefundRequestDialog";
import { toast } from "sonner";

const ISTfmt = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), "dd MMM yyyy, hh:mm a 'IST'") : "—";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  documents_pending: "Documents Pending",
  processing: "Processing",
  government_portal_pending: "Government Portal Pending",
  verification_pending: "Verification Pending",
  external_dependency: "External Dependency",
  waiting_for_customer: "Waiting For Customer",
  waiting_for_documents: "Waiting For Documents",
  customer_non_responsive: "Customer Non Responsive",
  processing_resumed: "Processing Resumed",
  completed: "Completed",
  pending_closure: "Pending Closure",
  closed: "Closed",
  refund_review: "Refund Review",
  refund_closed: "Refund Closed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  external_dependency: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  government_portal_pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  waiting_for_customer: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  customer_non_responsive: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  processing_resumed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  completed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  closed: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  refund_review: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

export function WorkflowTimelinePanel({
  applicationId,
  workflowStatus,
}: {
  applicationId: string;
  workflowStatus?: string | null;
}) {
  const qc = useQueryClient();
  const fnEvents = useServerFn(listWorkflowEvents);
  const fnReminders = useServerFn(listWorkflowReminders);
  const fnResume = useServerFn(resumeOrder);
  const fnReplied = useServerFn(markCustomerReplied);
  const fnAppend = useServerFn(appendWorkflowEvent);
  const fnCancel = useServerFn(cancelWorkflowReminder);

  const [delayOpen, setDelayOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const events = useQuery({
    queryKey: ["workflow-events", applicationId],
    queryFn: () => fnEvents({ data: { applicationId } }),
  });
  const reminders = useQuery({
    queryKey: ["workflow-reminders", applicationId],
    queryFn: () => fnReminders({ data: { applicationId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workflow-events", applicationId] });
    qc.invalidateQueries({ queryKey: ["workflow-reminders", applicationId] });
    qc.invalidateQueries({ queryKey: ["order-detail-v2", applicationId] });
  };

  const resumeMut = useMutation({
    mutationFn: async () => fnResume({ data: { applicationId } }),
    onSuccess: () => { toast.success("Order resumed; pending reminders cancelled."); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const repliedMut = useMutation({
    mutationFn: async () => fnReplied({ data: { applicationId } }),
    onSuccess: () => { toast.success("Customer reply logged."); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const noteMut = useMutation({
    mutationFn: async () => fnAppend({ data: { applicationId, eventType: "internal_note", title: "Internal note", description: noteText } }),
    onSuccess: () => { toast.success("Note saved"); setNoteOpen(false); setNoteText(""); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const cancelReminderMut = useMutation({
    mutationFn: async (id: string) => fnCancel({ data: { id } }),
    onSuccess: () => { toast.success("Reminder cancelled"); refresh(); },
  });

  const pendingReminders = (reminders.data?.reminders ?? []).filter((r: any) => r.status === "pending");
  const inDelay = workflowStatus && ["external_dependency","government_portal_pending","waiting_for_customer","waiting_for_documents","customer_non_responsive"].includes(workflowStatus);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="font-semibold">Workflow Timeline</div>
          {workflowStatus && (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[workflowStatus] ?? "bg-muted text-muted-foreground border-border"}`}>
              {STATUS_LABEL[workflowStatus] ?? workflowStatus}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setNoteOpen(true)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs">
            <Plus className="size-3" /> Note
          </button>
          <button onClick={() => setDelayOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs text-amber-600">
            <AlertTriangle className="size-3" /> External Delay
          </button>
          {inDelay && (
            <>
              <button onClick={() => repliedMut.mutate()} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs">
                <MessageSquare className="size-3" /> Customer Replied
              </button>
              <button onClick={() => resumeMut.mutate()} className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-600">
                <RotateCcw className="size-3" /> Resume Order
              </button>
            </>
          )}
          <button onClick={() => setRefundOpen(true)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs">
            Refund Request
          </button>
          <button onClick={() => setCloseOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-2.5 py-1 text-xs text-rose-600">
            Close Order
          </button>
        </div>
      </div>

      {pendingReminders.length > 0 && (
        <div className="border-b bg-muted/40 px-4 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <Bell className="size-3" /> Scheduled reminders ({pendingReminders.length})
          </div>
          <div className="space-y-1">
            {pendingReminders.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border bg-background px-2 py-1 text-xs">
                <div>
                  <span className="font-medium">{r.kind}</span>
                  {r.template_code && <span className="text-muted-foreground"> · {r.template_code}</span>}
                  <span className="ml-2 text-muted-foreground">Due {ISTfmt(r.due_at)}</span>
                </div>
                <button onClick={() => cancelReminderMut.mutate(r.id)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[520px] overflow-y-auto px-4 py-3">
        {events.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (events.data?.events ?? []).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No workflow events yet.</div>
        ) : (
          <ol className="relative space-y-3 border-l-2 border-border pl-4">
            {(events.data?.events ?? []).map((e: any) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1 size-3 rounded-full border-2 border-background bg-primary" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{e.title}</div>
                    {e.description && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{e.description}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                      <Clock className="size-3" /> {ISTfmt(e.created_at)} · {e.is_system ? "System" : e.actor_name ?? "Staff"}
                      {e.customer_visible && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600">Customer-visible</span>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ExternalDelayDialog applicationId={applicationId} open={delayOpen} onClose={() => setDelayOpen(false)} />
      <CloseOrderDialog applicationId={applicationId} open={closeOpen} onClose={() => setCloseOpen(false)} />
      <RefundRequestDialog applicationId={applicationId} open={refundOpen} onClose={() => setRefundOpen(false)} />

      {noteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl">
            <div className="font-semibold mb-2">Add internal note</div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setNoteOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={() => noteMut.mutate()} disabled={!noteText.trim() || noteMut.isPending} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
