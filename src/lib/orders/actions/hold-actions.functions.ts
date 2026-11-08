// Phase 2 — Hold / Form / Await-Govt actions per order-lifecycle-spec v2.
// One createServerFn per spec button. Handlers only; helpers are inside handler
// bodies or imported from *.server.ts modules (server-fn split rules).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── shared validators ───────────────────────────────────────────────
const OrderId = z.string().uuid();
const ReminderMinutes = z.number().int().min(15).max(60 * 24 * 30); // 15min…30d

// ── Mark Form Pending (send E003 + arm 4h nudge + 8h auto-close) ────
export const markFormPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ orderId: OrderId, transitionOnly: z.boolean().default(false) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: "FORM_PENDING",
    });
    if (error) throw new Error(error.message);

    const { armTimer } = await import("./timers.server");
    await armTimer({ applicationId: data.orderId, kind: "form_pending_nudge_4h", firesInMinutes: 4 * 60 });
    await armTimer({ applicationId: data.orderId, kind: "form_pending_autoclose_8h", firesInMinutes: 8 * 60 });

    return { ok: true, order: updated };
  });

// ── Mark Form Received (cancels form timers) ────────────────────────
export const markFormReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ orderId: OrderId }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: "FORM_RECEIVED",
    });
    if (error) throw new Error(error.message);

    const { cancelTimers } = await import("./timers.server");
    await cancelTimers(data.orderId, ["form_pending_nudge_4h", "form_pending_autoclose_8h"]);

    return { ok: true, order: updated };
  });

// ── Start Technical Hold (external → E005 customer email; internal → silent)
export const startTechnicalHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        orderId: OrderId,
        kind: z.enum(["external", "internal"]),
        reasonId: z.string().uuid(),
        reminderMinutes: ReminderMinutes,
        remarks: z.string().max(2000).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const targetStatus = data.kind === "external" ? "TECHNICAL_HOLD_EXTERNAL" : "TECHNICAL_HOLD_INTERNAL";

    const { data: updated, error } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: targetStatus,
      _reason_id: data.reasonId,
      _remarks: data.remarks ?? undefined,
    });
    if (error) throw new Error(error.message);

    // Stamp hold metadata + S05 Technical Delay fulfillment stage.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("applications")
      .update({
        technical_hold_started_at: new Date().toISOString(),
        technical_hold_kind: data.kind,
        active_reason_id: data.reasonId,
        fulfillment_status: "technical_delay",
      } as never)
      .eq("id", data.orderId);

    // Arm the recurring reminder timer.
    const { armTimer } = await import("./timers.server");
    await armTimer({
      applicationId: data.orderId,
      kind: "technical_hold_reminder",
      firesInMinutes: data.reminderMinutes,
      recurring: true,
      intervalMinutes: data.reminderMinutes,
      payload: { kind: data.kind, reasonId: data.reasonId },
    });

    // External-only: notify the customer via E005-style template.
    if (data.kind === "external") {
      const [{ enqueueFromTemplateInternal }, { BHS_EMAILS }] = await Promise.all([
        import("@/lib/emails/emails.server"),
        import("@/lib/emails/bhs-templates"),
      ]);
      const { data: cust } = await supabaseAdmin
        .from("applications")
        .select("customers(primary_email, name), leads:lead_id(email, name), application_code, lead_id")
        .eq("id", data.orderId)
        .maybeSingle();
      const custRow = cust as any;
      const email =
        (custRow?.customers?.primary_email as string | undefined) ||
        (custRow?.leads?.email as string | undefined);
      const custName =
        (custRow?.customers?.name as string | undefined) ||
        (custRow?.leads?.name as string | undefined) ||
        "Customer";
      if (email) {
        try {
          await enqueueFromTemplateInternal(
            BHS_EMAILS.E005_OUR_SIDE_DELAY,
            email,
            {
              customerName: custName,
              orderNumber: (custRow?.application_code as string) || data.orderId.slice(0, 8),
              fromName: process.env.ZOHO_FROM_NAME || "Udyam Support",
            },
            { applicationId: data.orderId, leadId: (custRow?.lead_id as string) ?? undefined, trigger: "manual" },
          );
        } catch (e) {
          console.error("[startTechnicalHold] E005 enqueue failed", e);
        }
      }
    }

    return { ok: true, order: updated };
  });

// ── Mark Awaiting Govt Approval (internal-only reminders, no customer email)
export const markAwaitingGovt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ orderId: OrderId, reminderMinutes: ReminderMinutes }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: "AWAITING_GOVT_APPROVAL",
    });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("applications")
      .update({ awaiting_govt_started_at: new Date().toISOString(), fulfillment_status: "government_processing" } as never)
      .eq("id", data.orderId);

    const { armTimer } = await import("./timers.server");
    await armTimer({
      applicationId: data.orderId,
      kind: "awaiting_govt_internal_reminder",
      firesInMinutes: data.reminderMinutes,
      recurring: true,
      intervalMinutes: data.reminderMinutes,
      payload: { internal_only: true },
    });

    return { ok: true, order: updated };
  });

// ── Resume from any hold (cancels reminders, moves back to IN_PROCESSING) ──
export const resumeFromHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ orderId: OrderId, target: z.enum(["IN_PROCESSING", "FORM_RECEIVED", "INFO_RECEIVED"]).default("IN_PROCESSING") }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Snapshot pre-resume state so we know whether the customer was notified
    // of a technical hold (external) and therefore needs the E011 resume email.
    // Pull the lead email too — leads are the source of truth for the specific
    // order's recipient (customers.primary_email can be stale across orders).
    const { data: preRow, error: preRowError } = await supabaseAdmin
      .from("applications")
      .select("technical_hold_kind, workflow_status, fulfillment_status, lead_id, customer_id, application_code, form_submitted_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (preRowError) throw new Error(`Unable to read the technical-delay state: ${preRowError.message}`);
    if (!preRow) throw new Error("Order not found.");

    const [{ data: lead, error: leadError }, { data: customer, error: customerError }] = await Promise.all([
      preRow.lead_id
        ? supabaseAdmin.from("leads").select("email, name, mobile, service, assigned_to").eq("id", preRow.lead_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      preRow.customer_id
        ? supabaseAdmin.from("customers").select("primary_email, primary_mobile, name").eq("id", preRow.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (leadError) throw new Error(`Unable to read the order recipient: ${leadError.message}`);
    if (customerError) throw new Error(`Unable to read the customer recipient: ${customerError.message}`);
    // Send E011 whenever we're resuming from a technical/our-side hold. The new
    // TechnicalDelayDialog routes through setExternalDelay which sets
    // workflow_status='government_portal_pending' (not technical_hold_kind),
    // so check both to cover legacy and current flows.
    const wasExternalTechHold =
      preRow.technical_hold_kind === "external" ||
      preRow.workflow_status === "government_portal_pending" ||
      preRow.fulfillment_status === "technical_delay";

    if (!wasExternalTechHold) {
      throw new Error("This order is not currently in Technical Delay, so E011 was not sent.");
    }

    const { data: updated, error } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: data.target,
    });
    if (error) throw new Error(error.message);

    const { cancelTimers } = await import("./timers.server");
    await cancelTimers(data.orderId, [
      "customer_hold_reminder",
      "technical_hold_reminder",
      "awaiting_govt_internal_reminder",
    ]);

    await supabaseAdmin
      .from("order_schedulers")
      .update({
        status: "stopped",
        stopped_at: new Date().toISOString(),
        stop_reason: "technical_delay_resolved",
        stop_triggered_by: context.userId,
      } as never)
      .eq("application_id", data.orderId)
      .in("status", ["active", "paused"]);

    await supabaseAdmin
      .from("order_reminders")
      .update({ is_active: false, stopped_at: new Date().toISOString(), stop_reason: "technical_delay_resolved" } as never)
      .eq("application_id", data.orderId);

    await supabaseAdmin
      .from("workflow_reminders")
      .update({ status: "cancelled" } as never)
      .eq("application_id", data.orderId)
      .eq("status", "pending");

    await supabaseAdmin
      .from("applications")
      .update({
        technical_hold_started_at: null,
        technical_hold_kind: null,
        customer_hold_started_at: null,
        awaiting_govt_started_at: null,
        active_reason_id: null,
        active_reason_text: null,
        workflow_status: "processing",
        workflow_delay_reason: null,
        workflow_expected_review_at: null,
        // Delay resolved → Form Submitted only if the customer really submitted the form
        ...(((preRow as any).form_submitted_at)
          ? { fulfillment_status: "form_submitted" }
          : { fulfillment_status: "form_not_submitted", order_status: "FORM_PENDING" }),
      } as never)
      .eq("id", data.orderId);

    // E011 — Technical Delay Resolved: notify the customer that we've resumed.
    // Prefer the lead's email because it belongs to this specific order.
    const email = lead?.email || customer?.primary_email;
    const recipientName = lead?.name || customer?.name || "Customer";
    if (!email) throw new Error("This order has no recipient email, so E011 could not be sent.");

    // Resolve executive name
    let executiveName = "Customer Care Team";
    const staffId = (preRow as any).assigned_to || lead?.assigned_to || context.userId;
    if (staffId) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("display_name, full_name, email")
        .eq("id", staffId)
        .maybeSingle();
      const p = prof as { display_name?: string | null; full_name?: string | null; email?: string | null } | null;
      if (p?.display_name || p?.full_name || p?.email) {
        executiveName = p.display_name || p.full_name || p.email || "Customer Care Team";
      }
    }

    try {
      const [{ enqueueFromTemplateInternal }, { BHS_EMAILS }] = await Promise.all([
        import("@/lib/emails/emails.server"),
        import("@/lib/emails/bhs-templates"),
      ]);
      const resolvedAt = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });

      const sendResult = await enqueueFromTemplateInternal(
        BHS_EMAILS.E011_TECHNICAL_DELAY_RESOLVED,
        email,
        {
          order_number: preRow.application_code || data.orderId.slice(0, 8),
          orderNumber: preRow.application_code || data.orderId.slice(0, 8),
          customer_name: recipientName,
          customerName: recipientName,
          service_name: lead?.service || "Business Registration & Filing",
          serviceName: lead?.service || "Business Registration & Filing",
          resolved_at: resolvedAt,
          resolvedAt: resolvedAt,
          customer_email: email,
          customerEmail: email,
          customer_mobile: lead?.mobile || customer?.primary_mobile || "—",
          customerMobile: lead?.mobile || customer?.primary_mobile || "—",
          executive_name: executiveName,
          executiveName: executiveName,
          fromName: process.env.ZOHO_FROM_NAME || "Care | Business Help Services",
        },
        {
          applicationId: data.orderId,
          leadId: preRow.lead_id ?? undefined,
          trigger: "manual",
          requireImmediateSuccess: true,
        },
      );
      if (!sendResult?.sent) throw new Error("E011 was not accepted by the email service.");
    } catch (e) {
      console.error("[resumeFromHold] E011 enqueue failed", e);
      throw e instanceof Error ? e : new Error(String(e));
    }

    // Automatically complete any active callback / Hot Order on technical delay resolved
    try {
      const { completeHotOrderOnQualifyingAction } = await import("@/lib/orders/actions/callback-reminder.functions");
      await completeHotOrderOnQualifyingAction({
        orderId: data.orderId,
        actorId: context.userId,
        actorName: executiveName,
        actionName: "Technical Delay Resolved",
        actionReason: "Technical issue resolved (E011 sent) & order resumed",
        supabase: supabaseAdmin,
      });
    } catch (hotErr) {
      console.warn("[resumeFromHold] completeHotOrderOnQualifyingAction warning:", hotErr);
    }

    return { ok: true, order: updated, emailSent: true };
  });

// ── Resume from Customer Side Delay (S06 → S04 Form Submitted, no email) ──
export const resumeFromCustomerDelay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ orderId: OrderId }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: preRow, error: preErr } = await supabaseAdmin
      .from("applications")
      .select("order_status, fulfillment_status, form_submitted_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (preErr) throw new Error(preErr.message);
    if (!preRow) throw new Error("Order not found.");
    // Only advance to Form Submitted when the customer actually submitted the form.
    const formSubmitted = Boolean((preRow as any).form_submitted_at);
    const resumeStage = formSubmitted ? "form_submitted" : "form_not_submitted";

    // Best-effort status transition; the fulfillment stage below is the
    // authoritative S04 marker for the journey map.
    const { error: rpcError } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: formSubmitted ? "FORM_RECEIVED" : "FORM_PENDING",
    });
    if (rpcError) console.warn("[resumeFromCustomerDelay] transition skipped:", rpcError.message);

    const { cancelTimers } = await import("./timers.server");
    await cancelTimers(data.orderId, ["customer_hold_reminder"]);
    await supabaseAdmin
      .from("workflow_reminders")
      .update({ status: "cancelled" } as never)
      .eq("application_id", data.orderId)
      .eq("kind", "pending_closure_followup")
      .in("status", ["pending", "failed"]);
    const { cancelAllForOrder } = await import("@/lib/scheduling/schedulers.server");
    await cancelAllForOrder(data.orderId, "customer_delay_resumed");

    const { error } = await supabaseAdmin
      .from("applications")
      .update({
        fulfillment_status: resumeStage,
        ...(formSubmitted ? {} : { order_status: "FORM_PENDING" }),
        customer_hold_started_at: null,
        active_reason_id: null,
        active_reason_text: null,
        workflow_status: "processing",
        workflow_delay_reason: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("application_events").insert({
      application_id: data.orderId,
      event_type: "fulfillment_status_change",
      old_value: String(preRow.fulfillment_status ?? ""),
      new_value: resumeStage,
      note: "Customer side delay resolved — order resumed",
      staff_name: "Admin",
      staff_role: "admin",
    } as never);

    // Automatically complete any active callback / Hot Order on customer delay resolved
    try {
      const { completeHotOrderOnQualifyingAction } = await import("@/lib/orders/actions/callback-reminder.functions");
      await completeHotOrderOnQualifyingAction({
        orderId: data.orderId,
        actorId: context.userId,
        actionName: "Customer Delay Resumed",
        actionReason: "Customer side delay resolved — order resumed to Form Submitted",
        supabase: supabaseAdmin,
      });
    } catch (hotErr) {
      console.warn("[resumeFromCustomerDelay] completeHotOrderOnQualifyingAction warning:", hotErr);
    }

    return { ok: true };
  });

// ── Resume from Order Reopened (moves back to active processing stage) ──
export const resumeReopenedOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ orderId: OrderId, note: z.string().max(2000).optional() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: preRow, error: preErr } = await supabaseAdmin
      .from("applications")
      .select("id, lead_id, customer_id, order_status, fulfillment_status, form_submitted_at, application_code")
      .eq("id", data.orderId)
      .maybeSingle();
    if (preErr) throw new Error(preErr.message);
    if (!preRow) throw new Error("Order not found.");

    const now = new Date().toISOString();
    const nextFulfillmentStatus = preRow.form_submitted_at ? "form_submitted" : "form_not_submitted";
    const nextOrderStatus = "IN_PROCESSING";

    const { error: rpcError } = await context.supabase.rpc("transition_order_status", {
      _order_id: data.orderId,
      _new_status: preRow.form_submitted_at ? "FORM_RECEIVED" : "FORM_PENDING",
    });
    if (rpcError) console.warn("[resumeReopenedOrder] transition skipped:", rpcError.message);

    const { cancelAllForOrder } = await import("@/lib/scheduling/schedulers.server");
    await cancelAllForOrder(data.orderId, "order_reopened_resumed");

    await supabaseAdmin
      .from("order_schedulers")
      .update({
        status: "stopped",
        stopped_at: now,
        stop_reason: "order_reopened_resumed",
        stop_triggered_by: context.userId,
      } as never)
      .eq("application_id", data.orderId)
      .in("status", ["active", "paused"]);

    await supabaseAdmin
      .from("workflow_reminders")
      .update({ status: "cancelled" } as never)
      .eq("application_id", data.orderId)
      .in("status", ["pending", "failed"]);

    const { error } = await supabaseAdmin
      .from("applications")
      .update({
        order_status: nextOrderStatus,
        fulfillment_status: nextFulfillmentStatus,
        application_status: "under_process",
        workflow_status: "processing",
        workflow_delay_reason: null,
        updated_at: now,
      } as never)
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);

    const { data: staffProf } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const staffName = (staffProf as any)?.display_name || (staffProf as any)?.email || "Staff";

    await supabaseAdmin.from("application_events").insert({
      application_id: data.orderId,
      lead_id: preRow.lead_id,
      customer_id: preRow.customer_id,
      event_type: "fulfillment_status_change",
      old_value: "order_reopened",
      new_value: nextFulfillmentStatus,
      note: data.note || "Order resumed from reopened state",
      staff_name: staffName,
      staff_role: "staff",
      created_by: context.userId,
    } as never);

    await supabaseAdmin.from("workflow_events").insert({
      application_id: data.orderId,
      lead_id: preRow.lead_id,
      event_type: "order_resumed",
      title: "Order Resumed from Reopened State",
      description: data.note ?? "Order resumed into active processing",
      customer_visible: false,
      actor_id: context.userId,
      actor_name: staffName,
      is_system: false,
      metadata: {
        previousStage: "order_reopened",
        nextStage: nextFulfillmentStatus,
        notes: data.note ?? null,
      },
    } as never);

    try {
      const { logEmployeeOrderAction } = await import("@/lib/orders/order-action-logger.server");
      await logEmployeeOrderAction({
        orderId: data.orderId,
        leadId: preRow.lead_id,
        customerId: preRow.customer_id,
        employeeId: context.userId,
        employeeName: staffName,
        actionType: "PROCESSING_STARTED",
        previousStatus: "REOPENED",
        newStatus: nextOrderStatus,
        previousStage: "Order Reopened",
        newStage: nextFulfillmentStatus === "form_submitted" ? "Form Submitted" : "Form Not Submitted Delay",
        notes: data.note || "Order resumed from reopened state",
        source: "employee",
        supabase: supabaseAdmin,
      });
    } catch (auditErr) {
      console.warn("[resumeReopenedOrder] audit log error:", auditErr);
    }

    // Automatically complete any active callback / Hot Order on resumed reopened order
    try {
      const { completeHotOrderOnQualifyingAction } = await import("@/lib/orders/actions/callback-reminder.functions");
      await completeHotOrderOnQualifyingAction({
        orderId: data.orderId,
        actorId: context.userId,
        actorName: staffName,
        actionName: "Order Resumed",
        actionReason: data.note || `Order resumed from reopened state into ${nextFulfillmentStatus === "form_submitted" ? "Form Submitted" : "Form Not Submitted Delay"}`,
        supabase: supabaseAdmin,
      });
    } catch (hotErr) {
      console.warn("[resumeReopenedOrder] completeHotOrderOnQualifyingAction warning:", hotErr);
    }

    return { ok: true, nextStage: nextFulfillmentStatus };
  });

