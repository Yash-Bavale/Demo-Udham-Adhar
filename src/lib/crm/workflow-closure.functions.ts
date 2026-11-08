// Closure & Refund server functions for the Service Workflow Engine.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

const STAFF = [
  "super_admin", "admin", "manager", "operations", "executive", "support", "finance", "accounts",
] as const;
const ADMIN_ONLY = ["super_admin", "admin"] as const;
const REFUND_ROLES = ["super_admin", "admin", "finance", "accounts"] as const;

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}
async function actorName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle();
  return data?.display_name || data?.email || "Staff";
}

// ───────── Close order helper ─────────

async function executeOrderClosure({
  supabase,
  userId,
  data,
}: {
  supabase: any;
  userId: string;
  data: {
    applicationId: string;
    reasonCode: string;
    reasonLabel: string;
    notes?: string;
    silent?: boolean;
  };
}) {
  await assertRole(supabase, [...STAFF]);
  const admin = await getAdmin();
  const name = await actorName(supabase, userId);
  const isSilent = Boolean(data.silent);

  const { data: app } = await admin
    .from("applications")
    .select("id, lead_id, customer_id, application_code, workflow_status, fulfillment_status, order_status, created_at")
    .eq("id", data.applicationId)
    .maybeSingle();
  if (!app) throw new Error("Application not found");

  // Cancel reminders & stop all schedulers so hot orders stop
  await admin
    .from("workflow_reminders")
    .update({ status: "cancelled" } as never)
    .eq("application_id", app.id)
    .in("status", ["pending", "failed"]);

  await admin
    .from("order_reminders")
    .update({ is_active: false, stopped_at: new Date().toISOString(), stop_reason: isSilent ? "silent_order_closed" : "order_closed" } as never)
    .eq("application_id", app.id);

  try {
    const { cancelAllForOrder } = await import("@/lib/scheduling/schedulers.server");
    await cancelAllForOrder(app.id, isSilent ? "silent_order_closed" : "order_closed");
  } catch (schedErr) {
    console.warn("[closeOrder] scheduler cancel warning:", schedErr);
  }

  try {
    const { cancelTimers } = await import("@/lib/orders/actions/timers.server");
    await cancelTimers(app.id);
  } catch (timerErr) {
    console.warn("[closeOrder] timer cancel warning:", timerErr);
  }

  const closedAt = new Date().toISOString();
  const { error: appUpErr } = await admin
    .from("applications")
    .update({
      workflow_status: "closed",
      fulfillment_status: "order_closed",
      order_status: "CLOSED",
      closure_stage: "closed",
      closure_reason_code: data.reasonCode,
      closure_remarks: data.notes ?? data.reasonLabel,
      customer_hold_started_at: null,
      technical_hold_started_at: null,
      technical_hold_kind: null,
      awaiting_govt_started_at: null,
      active_reason_id: null,
      active_reason_text: null,
      workflow_delay_reason: null,
      workflow_expected_review_at: null,
      updated_at: closedAt,
    } as never)
    .eq("id", app.id);

  if (appUpErr) {
    console.error("[executeOrderClosure] update error:", appUpErr);
    throw new Error(`Failed to close order: ${appUpErr.message}`);
  }

  try {
    await admin.from("workflow_events").insert({
      application_id: app.id,
      lead_id: app.lead_id,
      event_type: isSilent ? "silent_order_closed" : "order_closed",
      title: isSilent
        ? `Order closed silently — ${data.reasonLabel}`
        : `Order closed — ${data.reasonLabel}`,
      description: data.notes ?? null,
      customer_visible: !isSilent,
      actor_id: userId,
      actor_name: name,
      is_system: false,
      metadata: {
        reason_code: data.reasonCode,
        reason_label: data.reasonLabel,
        notes: data.notes ?? null,
        silent: isSilent,
        previous_stage: app.fulfillment_status || app.workflow_status || "in_progress",
        email_sent: !isSilent,
      },
    } as never);
  } catch (wfEvtErr) {
    console.warn("[closeOrder] workflow_events insert warning:", wfEvtErr);
  }

  try {
    await admin.from("application_events").insert({
      application_id: app.id,
      lead_id: app.lead_id,
      customer_id: app.customer_id,
      event_type: "order_status_change",
      old_value: String(app.order_status ?? "ACTIVE"),
      new_value: "CLOSED",
      note: isSilent
        ? `Order silently closed (${data.reasonLabel}) — no customer email`
        : `Order closed (${data.reasonLabel})`,
      created_by: userId,
      staff_name: name,
      staff_role: "staff",
    } as never);
  } catch (appEvtErr) {
    console.warn("[closeOrder] application_events insert warning:", appEvtErr);
  }

  // Record in immutable employee action audit log
  try {
    const { logEmployeeOrderAction } = await import("@/lib/orders/order-action-logger.server");
    await logEmployeeOrderAction({
      orderId: app.id,
      leadId: app.lead_id,
      customerId: app.customer_id,
      employeeId: userId,
      employeeName: name,
      actionType: "ORDER_CLOSED",
      previousStatus: app.workflow_status || app.order_status || "active",
      newStatus: "CLOSED",
      previousStage: app.fulfillment_status,
      newStage: "Order Closed",
      notes: `Order closed${isSilent ? " silently" : ""}: ${data.reasonLabel}${data.notes ? ` - ${data.notes}` : ""}`,
      source: isSilent ? "admin" : "employee",
      customMetadata: {
        silent: isSilent,
        reasonCode: data.reasonCode,
        reasonLabel: data.reasonLabel,
        emailSent: !isSilent,
      },
      supabase: admin,
    });
  } catch (auditErr) {
    console.warn("[closeOrder] audit log error:", auditErr);
  }

  // Send closure confirmation email ONLY if not in silent mode
  if (!isSilent) {
    try {
      const { data: lead } = await admin
        .from("leads")
        .select("name, email, mobile, service")
        .eq("id", app.lead_id!)
        .maybeSingle();
      const { data: latestInvoice } = await admin
        .from("invoices")
        .select("invoice_number")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lead?.email) {
        const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
        const { SUPPORT_EMAIL, COMPANY_NAME } = await import("@/lib/brand");
        const istFmt = (iso: string) =>
          new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

        // Load standard reply / description for closure reason
        const { data: closureReasonRow } = await admin
          .from("workflow_closure_reasons")
          .select("description, label")
          .eq("code", data.reasonCode)
          .maybeSingle();
        let defaultClosureReply = closureReasonRow?.description;
        if (!defaultClosureReply) {
          const { STANDARD_CLOSE_REASONS } = await import("@/lib/orders/actions/reasons.functions");
          const std = STANDARD_CLOSE_REASONS.find(
            (r) => r.id === data.reasonCode || `R${r.number}` === data.reasonCode || r.label.toLowerCase() === data.reasonLabel.toLowerCase()
          );
          defaultClosureReply = std?.standard_reply || null;
        }
        const closeRemarks = (data.notes && data.notes.trim()) ? data.notes.trim() : (defaultClosureReply || data.reasonLabel || "—");

        await enqueueFromTemplateInternal(
          "order_closure_confirmation",
          lead.email,
          {
            customer_name: lead.name ?? "Customer",
            customer_email: lead.email ?? "",
            customer_mobile: (lead as any).mobile ?? "—",
            order_id: app.application_code ?? "",
            order_number: app.application_code ?? "",
            service_name: lead.service ?? "—",
            invoice_number: latestInvoice?.invoice_number ?? "—",
            order_created_at: app.created_at ? istFmt(app.created_at as string) : "—",
            closure_date: istFmt(closedAt),
            closure_reason: data.reasonLabel,
            reason: data.reasonLabel,
            reason_block: defaultClosureReply || data.reasonLabel,
            employee_remarks: closeRemarks,
            additional_remarks: closeRemarks,
            remarks: closeRemarks,
            date: new Date().toLocaleDateString("en-IN"),
            company_name: COMPANY_NAME,
            support_email: SUPPORT_EMAIL,
          },
          { toName: lead.name ?? undefined, leadId: app.lead_id ?? undefined, applicationId: app.id, trigger: "manual" },
        );
      }
    } catch (e) {
      console.error("[closeOrder] closure email failed", e);
    }
  }

  try {
    await writeAudit({
      supabase,
      entityType: "application",
      entityId: app.id,
      action: isSilent ? "workflow_silent_close_order" : "workflow_close_order",
      oldValue: { workflow_status: app.workflow_status },
      newValue: { workflow_status: "closed", reason: data.reasonCode, notes: data.notes ?? null, silent: isSilent },
      actorId: userId,
    });
  } catch (auditErr) {
    console.warn("[closeOrder] writeAudit warning:", auditErr);
  }

  // Automatically complete any active callback / Hot Order on order close
  try {
    const { completeHotOrderOnQualifyingAction } = await import("@/lib/orders/actions/callback-reminder.functions");
    await completeHotOrderOnQualifyingAction({
      orderId: app.id,
      actorId: userId,
      actorName: name,
      actionName: isSilent ? "Silent Close" : "Order Force Closed",
      actionReason: `Order closed (${data.reasonLabel})`,
      supabase: admin,
    });
  } catch (hotErr) {
    console.warn("[closeOrder] completeHotOrderOnQualifyingAction warning:", hotErr);
  }

  return { ok: true, silent: isSilent };
}

// ───────── Close order ─────────

export const closeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      reasonCode: z.string().min(1).max(64),
      reasonLabel: z.string().min(1).max(160),
      notes: z.string().max(4000).optional(),
      silent: z.boolean().optional().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    return executeOrderClosure({
      supabase: context.supabase,
      userId: context.userId,
      data,
    });
  });

// ───────── Silent Close Order (Admin Override Only) ─────────

export const silentCloseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      reasonCode: z.string().optional().default("ADMIN_SILENT_CLOSE"),
      reasonLabel: z.string().optional().default("Silent Close (Admin Override)"),
      notes: z.string().max(4000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    return executeOrderClosure({
      supabase: context.supabase,
      userId: context.userId,
      data: {
        applicationId: data.applicationId,
        reasonCode: data.reasonCode,
        reasonLabel: data.reasonLabel,
        notes: data.notes,
        silent: true,
      },
    });
  });

// ───────── Refund Requests ─────────

export const createRefundRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      paymentId: z.string().uuid().optional(),
      reason: z.string().max(2000).optional(),
      reasonCode: z.string().max(64).optional(),
      customerNotes: z.string().max(2000).optional(),
      refundAmount: z.number().nonnegative().optional(),
      refundMode: z.enum(["full", "partial"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const name = await actorName(context.supabase, context.userId);

    const { data: app } = await admin
      .from("applications")
      .select("id, lead_id, application_code")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");

    const { data: row, error } = await admin
      .from("refund_requests")
      .insert({
        application_id: app.id,
        lead_id: app.lead_id,
        payment_id: data.paymentId ?? null,
        reason: data.reason ?? null,
        reason_code: data.reasonCode ?? null,
        customer_notes: data.customerNotes ?? null,
        refund_amount: data.refundAmount ?? null,
        refund_mode: data.refundMode ?? "full",
        status: "pending",
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await admin
      .from("applications")
      .update({ workflow_status: "refund_review" } as never)
      .eq("id", app.id);

    await admin.from("workflow_events").insert({
      application_id: app.id,
      lead_id: app.lead_id,
      event_type: "refund_requested",
      title: "Refund requested",
      description: data.reason ?? null,
      customer_visible: false,
      actor_id: context.userId,
      actor_name: name,
      is_system: false,
      metadata: { refund_request_id: row.id, amount: data.refundAmount ?? null },
    } as never);

    return { ok: true, id: row.id };
  });

export const listRefundRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["pending","approved","rejected","info_needed","escalated"]).optional(),
      applicationId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    let q = admin
      .from("refund_requests")
      .select("*, application:applications(application_code, lead_id), lead:leads(name,email,lead_code,service)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (data.applicationId) q = q.eq("application_id", data.applicationId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const decideRefundRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["approved","rejected","info_needed","escalated"]),
      adminNotes: z.string().max(4000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...REFUND_ROLES]);
    const admin = await getAdmin();
    const name = await actorName(context.supabase, context.userId);

    const { data: row } = await admin
      .from("refund_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Refund request not found");

    const decided = ["approved","rejected"].includes(data.decision);
    await admin
      .from("refund_requests")
      .update({
        status: data.decision,
        admin_notes: data.adminNotes ?? row.admin_notes,
        reviewer_id: context.userId,
        decided_at: decided ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.id);

    if (data.decision === "approved") {
      const nowIso = new Date().toISOString();
      await admin
        .from("applications")
        .update({
          workflow_status: "refund_closed",
          closure_stage: "refund_approved",
          fulfillment_status: "order_closed",
          refund_approved_at: nowIso,
          refund_approved_by: context.userId,
        } as never)
        .eq("id", row.application_id);

      if (row.lead_id) {
        try {
          const { transitionLeadStatus } = await import("@/lib/crm/lead-status.functions");
          await transitionLeadStatus({ data: { leadId: row.lead_id, toStatus: "refund_approved" } });
        } catch (err) {
          console.warn("[decideRefundRequest] lead transition to refund_approved failed:", err);
        }
      }
    } else if (data.decision === "rejected") {
      await admin
        .from("applications")
        .update({
          workflow_status: "closed",
          closure_stage: "closed",
        } as never)
        .eq("id", row.application_id);
    }

    await admin.from("workflow_events").insert({
      application_id: row.application_id,
      lead_id: row.lead_id,
      event_type: `refund_${data.decision}`,
      title: `Refund ${data.decision.replace("_", " ")}`,
      description: data.adminNotes ?? null,
      customer_visible: ["approved","rejected"].includes(data.decision),
      actor_id: context.userId,
      actor_name: name,
      is_system: false,
      metadata: { refund_request_id: row.id },
    } as never);

    await writeAudit({
      supabase: context.supabase,
      entityType: "application",
      entityId: row.application_id,
      action: `refund_${data.decision}`,
      oldValue: { status: row.status },
      newValue: { status: data.decision },
      actorId: context.userId,
    });

    return { ok: true };
  });
