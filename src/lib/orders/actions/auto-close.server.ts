// Single source of truth for system auto-closures (form-pending 8h and
// customer-side-delay 8h). Server-only; used by the timer tick and by the
// one-off backfill so live behaviour and backfill can never drift.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AutoCloseStage = "form_pending" | "customer_delay";

/** Reason A2 in `order_close_reasons` — both stages are non-response closures. */
export const AUTO_CLOSE_REASON_LABEL = "Customer unresponsive after multiple attempts";

export const STAGE_REMARKS: Record<AutoCloseStage, string> = {
  form_pending: "Incomplete/Incorrect information",
  customer_delay: "No response from customer within 8 hours of request",
};

let cachedReasonId: string | null = null;

export async function getAutoCloseReasonId(): Promise<string | null> {
  if (cachedReasonId) return cachedReasonId;
  const { data } = await supabaseAdmin
    .from("order_close_reasons")
    .select("id")
    .eq("label", AUTO_CLOSE_REASON_LABEL)
    .eq("is_active", true)
    .maybeSingle();
  cachedReasonId = ((data as any)?.id as string) ?? null;
  return cachedReasonId;
}

const CLOSED_OR_DONE_FULFILLMENT = [
  "completed",
  "order_completed",
  "order_closed",
  "cancelled",
];

/** True when the order already moved past the stage (so it must not be closed). */
function isResolved(stage: AutoCloseStage, row: any): boolean {
  const fulfillment = String(row?.fulfillment_status ?? "");
  const orderStatus = String(row?.order_status ?? "");
  if (CLOSED_OR_DONE_FULFILLMENT.includes(fulfillment)) return true;
  if (["CLOSED", "COMPLETED", "REFUND_PROCESSED", "REFUND_APPROVED"].includes(orderStatus)) return true;

  if (stage === "form_pending") {
    if (String(row?.form_status ?? "").toLowerCase() === "submitted") return true;
    return [
      "form_submitted",
      "documents_received",
      "under_processing",
      "verification_pending",
    ].includes(fulfillment) ||
      ["FORM_RECEIVED", "INFO_RECEIVED", "IN_PROCESSING"].includes(orderStatus);
  }

  // customer_delay: resolved once the hold has been lifted.
  return !row?.customer_hold_started_at && fulfillment !== "customer_delay";
}

export type AutoCloseResult =
  | { ok: true; emailQueued: boolean }
  | { ok: false; skipped: "not_found" | "resolved" | "no_reason" | "update_failed" | "email_failed"; message?: string };

/**
 * Close one overdue order with the stage-specific reason + remark and queue the
 * E010 closure email (the email layer reads closure_reason_id/closure_remarks,
 * so both the reason label and the remark render in the message).
 */
export async function autoCloseOverdueOrder(
  appId: string,
  stage: AutoCloseStage,
  opts?: { sendEmail?: boolean; staffName?: string; remarkPrefix?: string },
): Promise<AutoCloseResult> {
  const sendEmail = opts?.sendEmail ?? true;

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("order_status, fulfillment_status, form_status, customer_hold_started_at, closure_remarks, workflow_delay_reason, active_reason_text")
    .eq("id", appId)
    .maybeSingle();
  const row = app as any;
  const { cancelTimers } = await import("./timers.server");
  if (!row) return { ok: false, skipped: "not_found" };
  const alreadyAutoClosed =
    String(row?.order_status ?? "") === "CLOSED" &&
    (String(row?.closure_remarks ?? "").includes(STAGE_REMARKS[stage]) ||
     String(row?.closure_remarks ?? "").includes("Form not received within 8 hours of payment"));
  if (!alreadyAutoClosed && isResolved(stage, row)) {
    await cancelTimers(appId, ["form_pending_nudge_4h", "form_pending_autoclose_8h", "customer_hold_reminder"]);
    return { ok: false, skipped: "resolved" };
  }

  const reasonId = await getAutoCloseReasonId();
  if (!reasonId) {
    console.error("[auto-close] reason A2 not found in order_close_reasons");
    return { ok: false, skipped: "no_reason" };
  }

  // Resolve specific closure reason label and delay description (from Reason Library if set)
  let closureReasonText = STAGE_REMARKS[stage];
  let delayDescriptionText = STAGE_REMARKS[stage];

  if (stage === "form_pending") {
    closureReasonText = "Incomplete/Incorrect information";
    delayDescriptionText = "Incomplete/Incorrect information";
  } else if (stage === "customer_delay") {
    const delayReasonCode = row?.workflow_delay_reason as string | null | undefined;
    if (delayReasonCode) {
      const { data: reasonRow } = await supabaseAdmin
        .from("workflow_delay_reasons")
        .select("label, description")
        .eq("code", delayReasonCode)
        .maybeSingle();
      if (reasonRow) {
        closureReasonText = (reasonRow as any).label || STAGE_REMARKS.customer_delay;
        delayDescriptionText = (reasonRow as any).description || (reasonRow as any).label || STAGE_REMARKS.customer_delay;
      } else if (row?.active_reason_text) {
        closureReasonText = row.active_reason_text;
        delayDescriptionText = row.active_reason_text;
      }
    } else if (row?.active_reason_text) {
      closureReasonText = row.active_reason_text;
      delayDescriptionText = row.active_reason_text;
    }
  }

  const remarks = `${opts?.remarkPrefix ?? ""}${delayDescriptionText}`;
  if (!alreadyAutoClosed) {
    const { error } = await supabaseAdmin
      .from("applications")
      .update({
        order_status: "CLOSED",
        fulfillment_status: "order_closed",
        application_status: "cancelled",
        closure_reason_id: reasonId,
        closure_remarks: remarks,
        customer_hold_started_at: null,
        workflow_status: "closed",
        active_reason_id: null,
        active_reason_text: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", appId);
    if (error) {
      console.error("[auto-close] update failed", error.message);
      return { ok: false, skipped: "update_failed", message: error.message };
    }

    await supabaseAdmin.from("application_events").insert({
      application_id: appId,
      event_type: "order_status_change",
      old_value: String(row.order_status ?? ""),
      new_value: "CLOSED",
      note: closureReasonText === remarks ? closureReasonText : `${closureReasonText} — ${remarks}`,
      staff_name: opts?.staffName ?? "System",
      staff_role: "system",
    } as never);
  }

  await cancelTimers(appId, [
    "form_pending_nudge_4h",
    "form_pending_autoclose_8h",
    "customer_hold_reminder",
  ]);

  if (!sendEmail) return { ok: true, emailQueued: false };

  const { data: priorEmail } = await supabaseAdmin
    .from("email_logs")
    .select("id")
    .eq("application_id", appId)
    .eq("template_code", "E010")
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();
  if (priorEmail) return { ok: true, emailQueued: true };

  const { data: ctx } = await supabaseAdmin
    .from("applications")
    .select("application_code, lead_id, customer_id")
    .eq("id", appId)
    .maybeSingle();
  const c = ctx as any;

  let email: string | null = null;
  let name: string | null = null;
  if (c?.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("email, name")
      .eq("id", c.lead_id)
      .maybeSingle();
    email = ((lead as any)?.email as string) ?? null;
    name = ((lead as any)?.name as string) ?? null;
  }
  if (!email && c?.customer_id) {
    const { data: cust } = await supabaseAdmin
      .from("customers")
      .select("primary_email, name")
      .eq("id", c.customer_id)
      .maybeSingle();
    email = ((cust as any)?.primary_email as string) ?? null;
    name = name ?? ((cust as any)?.name as string) ?? null;
  }
  if (!email) return { ok: true, emailQueued: false };

  try {
    const [{ enqueueFromTemplateInternal }, { BHS_EMAILS }] = await Promise.all([
      import("@/lib/emails/emails.server"),
      import("@/lib/emails/bhs-templates"),
    ]);
    const fullReasonString = closureReasonText === remarks ? closureReasonText : `${closureReasonText} — ${remarks}`;
    await enqueueFromTemplateInternal(
      BHS_EMAILS.E010_ORDER_CLOSED,
      email,
      {
        customerName: name || "Customer",
        orderNumber: (c?.application_code as string) || appId.slice(0, 8),
        closure_reason: closureReasonText,
        employee_remarks: remarks,
        reason: fullReasonString,
        fromName: process.env.ZOHO_FROM_NAME || "Udyam Support",
      },
      { applicationId: appId, leadId: (c?.lead_id as string) ?? undefined, trigger: "auto" },
    );
    return { ok: true, emailQueued: true };
  } catch (e) {
    console.error("[auto-close] E010 enqueue failed", e);
    return {
      ok: false,
      skipped: "email_failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

