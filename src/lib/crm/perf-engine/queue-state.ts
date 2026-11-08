// Current-queue classification for one order, using the SAME rules the Orders page
// uses (computeOrderStage + isNeedsActionOrder / delay / callback predicates).
// This is current state only — it never contributes to historical attribution.
import { computeOrderStage } from "@/lib/crm/computeOrderStage";
import {
  isNeedsActionOrder,
  isCustomerDelayOrder,
  isTechnicalDelayOrder,
  isCallbackScheduledOrder,
} from "@/lib/crm/orders-v2.functions";

export type QueueBucket =
  | "terminal"
  | "hot"
  | "actionable_backlog"
  | "customer_hold"
  | "technical_hold"
  | "callback_scheduled"
  | "other_open";

const CLOSED_FS = new Set(["application_rejected", "certificate_rejected", "order_closed", "cancelled"]);
const COMPLETED_FS = new Set([
  "consultation_completed", "order_completed", "completed", "certificate_ready", "certificate_delivered",
  "certificate_uploaded", "service_completed", "application_approved", "approved",
]);

/** Mirrors the row shape listOrdersV2 builds before bucketing. */
export function buildQueueRow(a: any, lead: any, paidAt: string | null, cb: any, now: number) {
  const stage = computeOrderStage(
    { lead_status_v2: lead?.lead_status_v2, status: lead?.status, payment_successful_at: paidAt },
    {
      form_submitted_at: a.form_submitted_at,
      certificate_uploaded_at: a.certificate_uploaded_at,
      fulfillment_status: a.fulfillment_status,
      application_status: a.application_status,
      workflow_status: a.workflow_status,
      closure_stage: a.closure_stage,
      refund_approved_at: a.refund_approved_at,
      refund_processed_at: a.refund_processed_at,
      order_status: a.order_status,
      technical_hold_started_at: a.technical_hold_started_at,
    } as any,
  );
  let remarks: any = null;
  if (cb?.remarks) {
    try { remarks = typeof cb.remarks === "string" ? JSON.parse(cb.remarks) : cb.remarks; }
    catch { remarks = { reason: "custom", reasonLabel: cb.remarks }; }
  }
  const firesAt = cb?.fires_at ? new Date(cb.fires_at).getTime() : 0;
  const is_due = firesAt > 0 && firesAt <= now;
  const is_reopened =
    stage === "order_reopened" || a.fulfillment_status === "order_reopened" ||
    a.application_status === "order_reopened" || a.order_status === "REOPENED" || a.workflow_status === "order_reopened";
  const fs = String(a.fulfillment_status ?? "").toLowerCase();
  const term = (v: any) => ["completed", "closed", "cancelled"].includes(String(v ?? "").toLowerCase());
  const is_terminal = !is_reopened && (
    stage === "completed" || stage === "closed" || CLOSED_FS.has(fs) || COMPLETED_FS.has(fs) ||
    term(a.application_status) || term(a.order_status) || term(a.workflow_status) ||
    (Boolean(a.closure_stage) && a.closure_stage !== "none")
  );
  const has_future_callback = !is_terminal && Boolean(cb && firesAt > now);
  const is_hot = !is_terminal && (is_due || (is_reopened && !has_future_callback));
  return {
    ...a,
    stage,
    is_terminal,
    is_hot,
    is_callback_scheduled: has_future_callback,
    callback_reminder: !is_terminal && cb
      ? { id: cb.id, fires_at: cb.fires_at, is_due, remarks, scheduler_type: cb.scheduler_type, created_at: cb.created_at }
      : null,
  };
}

export function classifyQueue(a: any, lead: any, paidAt: string | null, cb: any, now: number): QueueBucket {
  const row = buildQueueRow(a, lead, paidAt, cb, now);
  if (row.is_terminal) return "terminal";
  if (row.is_hot) return "hot";
  if (isCustomerDelayOrder(row)) return "customer_hold";
  if (isTechnicalDelayOrder(row)) return "technical_hold";
  if (isCallbackScheduledOrder(row)) return "callback_scheduled";
  if (isNeedsActionOrder(row)) return "actionable_backlog";
  return "other_open";
}
