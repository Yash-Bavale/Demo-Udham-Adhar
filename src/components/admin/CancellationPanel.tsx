import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Ban, Clock, RotateCcw, MessageSquareReply,
  ShieldCheck, MailCheck, CheckCircle2,
} from "lucide-react";

import {
  requestCancellation,
  sendConcernReply,
  sendRefundDecision,
  acknowledgePostClosure,
  cancelClosureWorkflow,
} from "@/lib/crm/cancellation.functions";
import { listDelayReasons } from "@/lib/crm/workflow.functions";
import { formatIST, relativeIST } from "@/lib/datetime";

type Stage =
  | "none"
  | "request_received"
  | "closed"
  | "concern_reply_sent"
  | "final_ticket_closed"
  | "refund_reviewed"
  | "acknowledged"
  // legacy stages we may still see in old rows
  | "closure_pending"
  | "notice_sent";

const STAGE_LABEL: Record<string, string> = {
  none: "Active — no cancellation",
  request_received: "Step 1 — Request received",
  closed: "Step 2 — Order closed",
  concern_reply_sent: "Step 3 — Concern reply sent",
  final_ticket_closed: "Step 4 — Ticket closed",
  refund_reviewed: "Step 5 — Refund reviewed",
  acknowledged: "Step 7 — Acknowledged",
  closure_pending: "Closure pending (legacy)",
  notice_sent: "Notice sent (legacy)",
};

const STAGE_COLOR: Record<string, string> = {
  none: "bg-emerald-100 text-emerald-700 border-emerald-200",
  request_received: "bg-amber-100 text-amber-800 border-amber-200",
  closed: "bg-rose-100 text-rose-700 border-rose-200",
  concern_reply_sent: "bg-indigo-100 text-indigo-700 border-indigo-200",
  final_ticket_closed: "bg-slate-100 text-slate-700 border-slate-200",
  refund_reviewed: "bg-orange-100 text-orange-800 border-orange-200",
  acknowledged: "bg-emerald-100 text-emerald-700 border-emerald-200",
  closure_pending: "bg-slate-100 text-slate-700 border-slate-200",
  notice_sent: "bg-slate-100 text-slate-700 border-slate-200",
};

const STAGES_FOR_STEPPER: Stage[] = [
  "request_received",
  "closed",
  "concern_reply_sent",
  "final_ticket_closed",
  "refund_reviewed",
  "acknowledged",
];

export function CancellationPanel({
  applicationId,
  closureStage,
  closureNextAt,
  cancellationRequestedAt,
  reasonCode,
  reasonText,
}: {
  applicationId: string;
  closureStage?: string | null;
  closureNextAt?: string | null;
  cancellationRequestedAt?: string | null;
  reasonCode?: string | null;
  reasonText?: string | null;
}) {
  const stage = (closureStage ?? "none") as Stage;
  const qc = useQueryClient();
  const reasonsFn = useServerFn(listDelayReasons);
  const { data: reasonsData } = useQuery({
    queryKey: ["workflow.delayReasons"],
    queryFn: () => reasonsFn(),
    staleTime: 5 * 60_000,
  });
  const reasons = (reasonsData as any)?.reasons ?? [];
  const selectedReason = reasons.find((r: any) => r.code === reasonCode);

  const [showForm, setShowForm] = useState(false);
  const [pickedReason, setPickedReason] = useState<string>("");
  const [note, setNote] = useState("");

  const requestFn = useServerFn(requestCancellation);
  const concernFn = useServerFn(sendConcernReply);
  const refundFn = useServerFn(sendRefundDecision);
  const ackFn = useServerFn(acknowledgePostClosure);
  const revertFn = useServerFn(cancelClosureWorkflow);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin.order", applicationId] });

  const requestMut = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          applicationId,
          reasonCode: pickedReason,
          reasonText: note || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Step 1 email sent. Order will auto-close in 24h.");
      setShowForm(false); setPickedReason(""); setNote("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const stepMut = (label: string, fn: () => Promise<any>) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => { toast.success(label); invalidate(); },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    });

  const concernMut = stepMut("Step 3 sent — auto Step 4 in 24h",
    () => concernFn({ data: { applicationId } }));
  const refundMut = stepMut("Step 5 sent — auto Step 6 in 24h",
    () => refundFn({ data: { applicationId } }));
  const ackMut = stepMut("Step 7 acknowledgement sent",
    () => ackFn({ data: { applicationId } }));
  const revertMut = stepMut("Workflow reverted",
    () => revertFn({ data: { applicationId } }));

  const showStartButton = stage === "none";
  const showConcernAction = stage === "closed";
  const showRefundAction = stage === "final_ticket_closed";
  const showAckAction =
    stage === "refund_reviewed" ||
    stage === "acknowledged" ||
    stage === "closed" ||
    stage === "final_ticket_closed";

  const stageIdx = STAGES_FOR_STEPPER.indexOf(stage);

  return (
    <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50/60 via-white to-amber-50/40 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 grid place-items-center text-white shadow">
            <Ban className="size-3.5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-rose-600">
              Cancellation &amp; Refund Workflow
            </div>
            <div className="text-[11px] text-slate-500">
              7-step process — emails go out automatically with 24h gaps
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${STAGE_COLOR[stage]}`}
        >
          {STAGE_LABEL[stage] ?? stage}
        </span>
      </div>

      {/* Stage stepper */}
      {stage !== "none" && (
        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
          {STAGES_FOR_STEPPER.map((s, i) => {
            const active = i <= stageIdx;
            return (
              <div key={s} className="flex items-center gap-1 flex-shrink-0">
                <div
                  className={`size-5 rounded-full grid place-items-center text-[10px] font-bold ${
                    active ? "bg-rose-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {i + 1}
                </div>
                {i < STAGES_FOR_STEPPER.length - 1 && (
                  <div className={`h-px w-4 ${i < stageIdx ? "bg-rose-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Context block */}
      {stage !== "none" && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-[12px] space-y-1">
          {cancellationRequestedAt && (
            <div className="text-slate-600">
              <span className="font-semibold">Requested:</span> {formatIST(cancellationRequestedAt)} ({relativeIST(cancellationRequestedAt)})
            </div>
          )}
          {closureNextAt && (
            <div className="flex items-center gap-1 text-slate-700 font-medium">
              <Clock className="size-3 text-amber-600" />
              Next auto-step at <span className="font-mono">{formatIST(closureNextAt)}</span>
            </div>
          )}
          {(selectedReason || reasonText) && (
            <div className="text-slate-700">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-1">
                Reason
              </div>
              <div className="font-semibold">{selectedReason?.label ?? reasonCode}</div>
              {reasonText && <div className="text-slate-500 text-[11px] mt-0.5">Note: {reasonText}</div>}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {showStartButton && (
        <>
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-red-600 text-white text-[12px] font-bold px-3 py-2 shadow hover:opacity-90"
            >
              <Ban className="size-3.5" /> Start cancellation workflow
            </button>
          ) : (
            <div className="mt-3 space-y-2 rounded-lg border border-rose-200 bg-white p-3">
              <label className="text-[10px] uppercase tracking-wider font-bold text-rose-700">
                Reason
              </label>
              <select
                value={pickedReason}
                onChange={(e) => setPickedReason(e.target.value)}
                className="w-full rounded-md border px-2 py-1.5 text-[12px] bg-white"
              >
                <option value="">Select a reason…</option>
                {reasons.map((r: any) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
              <label className="text-[10px] uppercase tracking-wider font-bold text-rose-700">
                Internal note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Free-text notes for the activity log…"
                className="w-full rounded-md border px-2 py-1.5 text-[12px] bg-white"
              />
              <div className="flex items-start gap-1.5 text-[10.5px] text-amber-900 bg-amber-50 rounded p-2 border border-amber-200">
                <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                <span>
                  Step 1 email sends immediately. Step 2 (order closed) auto-fires in 24h
                  unless the customer responds or you revert the workflow.
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  disabled={!pickedReason || requestMut.isPending}
                  onClick={() => requestMut.mutate()}
                  className="flex-1 rounded-md bg-rose-600 text-white text-[12px] font-bold px-2 py-1.5 disabled:opacity-50"
                >
                  {requestMut.isPending ? "Sending…" : "Confirm & send Step 1"}
                </button>
                <button
                  onClick={() => { setShowForm(false); setPickedReason(""); setNote(""); }}
                  className="rounded-md border text-[12px] px-2 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showConcernAction && (
        <ActionRow
          icon={MessageSquareReply}
          label="Send Step 3 — Concern reply"
          hint="Use this if the customer replied arguing for refund/cancel after Step 2. Step 4 (ticket closed) auto-fires 24h later."
          color="indigo"
          loading={concernMut.isPending}
          onClick={() => concernMut.mutate()}
        />
      )}
      {showRefundAction && (
        <ActionRow
          icon={ShieldCheck}
          label="Send Step 5 — Refund decision"
          hint="Use this if the customer replied again insisting on refund after Step 4. Step 6 (final ticket closed) auto-fires 24h later."
          color="orange"
          loading={refundMut.isPending}
          onClick={() => refundMut.mutate()}
        />
      )}
      {showAckAction && (
        <ActionRow
          icon={MailCheck}
          label="Send Step 7 — Post-closure acknowledgement"
          hint="Use this whenever the customer replies again after the matter is closed. Records the message and reaffirms the previous response."
          color="emerald"
          loading={ackMut.isPending}
          onClick={() => ackMut.mutate()}
        />
      )}

      {stage !== "none" && stage !== "acknowledged" && (
        <button
          onClick={() => revertMut.mutate()}
          disabled={revertMut.isPending}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-600 px-2 py-1.5 hover:bg-slate-50"
        >
          <RotateCcw className="size-3" />
          {revertMut.isPending ? "Reverting…" : "Revert workflow (admin override)"}
        </button>
      )}

      {stage === "acknowledged" && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="size-3.5" />
          Workflow fully concluded.
        </div>
      )}
    </div>
  );
}

function ActionRow({
  icon: Icon, label, hint, color, loading, onClick,
}: {
  icon: any; label: string; hint: string;
  color: "indigo" | "orange" | "emerald";
  loading: boolean; onClick: () => void;
}) {
  const c =
    color === "indigo" ? "from-indigo-500 to-blue-600" :
    color === "orange" ? "from-orange-500 to-rose-500" :
    "from-emerald-500 to-teal-600";
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="text-[10.5px] text-slate-600 leading-snug">{hint}</div>
      <button
        disabled={loading}
        onClick={onClick}
        className={`w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-gradient-to-r ${c} text-white text-[12px] font-bold px-2 py-1.5 shadow disabled:opacity-60`}
      >
        <Icon className="size-3.5" />
        {loading ? "Sending…" : label}
      </button>
    </div>
  );
}
