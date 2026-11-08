// Service Workflow Engine — server functions
// Drives the chronological timeline, External Delay popup, Resume, and reminder lifecycle.
// All actions write to workflow_events (timeline) + audit_logs, and may schedule
// workflow_reminders that the cron route (/api/public/cron/workflow-reminders) fires.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

const STAFF = [
  "super_admin", "admin", "manager", "operations", "executive", "support", "finance", "accounts",
] as const;

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function actorName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name || data?.email || "Staff";
}

// ───────────────────────── Reads ─────────────────────────

export const listWorkflowEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("workflow_events")
      .select("*")
      .eq("application_id", data.applicationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });

export const listWorkflowReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("workflow_reminders")
      .select("*")
      .eq("application_id", data.applicationId)
      .order("due_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return { reminders: rows ?? [] };
  });

export const listDelayReasons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("workflow_delay_reasons")
      .select("code,label,description,side,email_template_code")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { reasons: (data ?? []) as Array<{ code: string; label: string; description: string | null; side: "customer" | "internal"; email_template_code: string | null }> };
  });

export const listClosureReasons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("workflow_closure_reasons")
      .select("code,label,description")
      .eq("is_active", true)
    const DEFAULT_REASONS = [
      { code: "E010", label: "Customer Non-Responsive (Auto/Force Close)", description: "Customer did not respond within expected SLA timeframe" },
      { code: "FORCE_CLOSE", label: "Force Close (Admin Override)", description: "Administrative force closure" },
      { code: "GOVT_REJECTED", label: "Government Portal Rejection", description: "Application rejected by government portal" },
      { code: "CUSTOMER_CANCELLED", label: "Customer Requested Cancellation", description: "Customer requested order cancellation" },
      { code: "DUPLICATE_ORDER", label: "Duplicate / Invalid Order", description: "Duplicate or invalid application submission" },
    ];
    const reasons = (data && data.length > 0) ? data : DEFAULT_REASONS;
    return { reasons };
  });

// ───────────────────────── Writes ─────────────────────────

export const appendWorkflowEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      eventType: z.string().min(1).max(64),
      title: z.string().min(1).max(200),
      description: z.string().max(4000).optional(),
      customerVisible: z.boolean().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const { data: app } = await admin.from("applications").select("lead_id").eq("id", data.applicationId).maybeSingle();
    const name = await actorName(context.supabase, context.userId);
    const { error } = await admin.from("workflow_events").insert({
      application_id: data.applicationId,
      lead_id: app?.lead_id ?? null,
      event_type: data.eventType,
      title: data.title,
      description: data.description ?? null,
      customer_visible: data.customerVisible ?? false,
      actor_id: context.userId,
      actor_name: name,
      is_system: false,
      metadata: data.metadata ?? {},
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PRIORITY = z.enum(["low", "normal", "high", "urgent"]);

export const setExternalDelay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      reasonCode: z.string().min(1).max(64),
      reasonLabel: z.string().min(1).max(160),
      internalNote: z.string().max(4000).optional(),
      customerNote: z.string().max(4000).optional(),
      expectedReviewAt: z.string().min(1),
      priority: PRIORITY.default("normal"),
      kind: z.enum(["external_dependency", "government_portal_pending"]).default("external_dependency"),
      evidence: z
        .object({
          fileName: z.string().trim().min(1).max(255),
          mimeType: z.string().trim().min(1).max(100),
          base64Data: z.string().min(1),
        })
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const name = await actorName(context.supabase, context.userId);

    const { data: app } = await admin
      .from("applications")
      .select("id, lead_id, application_code, workflow_status, order_status")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");

    const { data: lead } = await admin
      .from("leads")
      .select("name, email, mobile, service, lead_code, assigned_to, created_at")
      .eq("id", app.lead_id!)
      .maybeSingle();

    const { data: latestInvoice } = await admin
      .from("invoices")
      .select("invoice_number, issued_at")
      .eq("lead_id", app.lead_id!)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fmtIST = (d: Date) =>
      d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) + " IST";
    const holdNowIst = fmtIST(new Date());
    const expectedIst = data.expectedReviewAt ? fmtIST(new Date(data.expectedReviewAt)) : "";
    const orderCreatedIst = (lead as any)?.created_at ? fmtIST(new Date((lead as any).created_at)) : "";

    // Load the full reason row (side + optional template override).
    const { data: reasonRow } = await admin
      .from("workflow_delay_reasons")
      .select("code,label,description,side,email_template_code")
      .eq("code", data.reasonCode)
      .maybeSingle();
    const side: "customer" | "internal" = ((reasonRow as { side?: string } | null)?.side === "internal") ? "internal" : "customer";
    const reasonBlock = ((reasonRow as { description?: string } | null)?.description) || data.reasonLabel;
    const defaultTplForSide = side === "internal" ? "bhs_e004_our_side_delay" : "bhs_e003_customer_delay";
    const customerTplCode = ((reasonRow as { email_template_code?: string } | null)?.email_template_code) || defaultTplForSide;
    const holdStatusLabel = ((reasonRow as { label?: string } | null)?.label) || data.reasonLabel;

    const expectedReviewIso = new Date(data.expectedReviewAt).toISOString();

    // Derive workflow_status from the reason side; the client-provided `kind` is ignored
    // to guarantee UI and backend stay in sync with the reason's classification.
    const workflowStatus = side === "internal" ? "government_portal_pending" : "waiting_for_customer";

    // ── Process optional screenshot evidence for internal technical delay ──
    let evidenceDocId: string | null = null;
    let evidenceStoragePath: string | null = null;
    let evidenceSizeBytes: number | null = null;
    let emailAttachments: Array<{ filename: string; content_base64: string; content_type: string }> | undefined = undefined;

    if (data.evidence && side === "internal") {
      const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      const reqMime = data.evidence.mimeType.toLowerCase();
      if (!allowedMimes.includes(reqMime)) {
        throw new Error("Unsupported screenshot format. Please upload PNG, JPG, or WEBP.");
      }

      const match = data.evidence.base64Data.match(/^data:([^;]+);base64,(.+)$/);
      const rawBase64 = match ? match[2] : data.evidence.base64Data;
      const buffer = Buffer.from(rawBase64, "base64");

      if (buffer.length > 5 * 1024 * 1024) {
        throw new Error("Evidence screenshot exceeds 5 MB size limit.");
      }
      if (buffer.length < 10) {
        throw new Error("Invalid or empty screenshot file.");
      }

      evidenceSizeBytes = buffer.length;
      const extMatch = data.evidence.fileName.match(/\.(png|jpg|jpeg|webp)$/i);
      const ext = extMatch
        ? extMatch[1].toLowerCase()
        : reqMime.includes("png")
          ? "png"
          : reqMime.includes("webp")
            ? "webp"
            : "jpg";
      const safeName = `portal-error-${Date.now()}.${ext}`;
      evidenceStoragePath = `orders/${app.id}/technical-delay/${safeName}`;

      const { error: uploadErr } = await admin.storage
        .from("documents")
        .upload(evidenceStoragePath, buffer, {
          contentType: reqMime,
          upsert: true,
        });

      if (uploadErr) {
        console.error("[setExternalDelay] storage upload error:", uploadErr);
        throw new Error(`Failed to upload evidence screenshot: ${uploadErr.message}`);
      }

      const { data: docRow, error: docErr } = await admin
        .from("documents")
        .insert({
          application_id: app.id,
          lead_id: app.lead_id ?? null,
          doc_type: "portal_error_screenshot",
          file_path: evidenceStoragePath,
          file_name: data.evidence.fileName,
          mime_type: reqMime,
          size_bytes: buffer.length,
          status: "uploaded",
          uploaded_at: new Date().toISOString(),
        } as never)
        .select("id")
        .maybeSingle();

      if (docErr) {
        console.warn("[setExternalDelay] documents table insert warning:", docErr);
      }
      evidenceDocId = docRow?.id ?? null;

      emailAttachments = [
        {
          filename: data.evidence.fileName,
          content_base64: rawBase64,
          content_type: reqMime,
        },
      ];
    }

    const holdStartedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("applications")
      .update({
        workflow_status: workflowStatus,
        workflow_delay_reason: data.reasonCode,
        workflow_expected_review_at: expectedReviewIso,
        workflow_priority: data.priority,
        ...(side === "customer"
          ? {
              order_status: "CUSTOMER_HOLD",
              fulfillment_status: "customer_delay",
              customer_hold_started_at: holdStartedAt,
            }
          : {
              order_status: "TECHNICAL_HOLD_EXTERNAL",
              fulfillment_status: "technical_delay",
              technical_hold_started_at: holdStartedAt,
              technical_hold_kind: "external",
            }),
      } as never)
      .eq("id", app.id);
    if (updErr) throw new Error(updErr.message);

    // Timeline events (internal always; customer-visible only for customer-side w/ note).
    const events: any[] = [{
      application_id: app.id,
      lead_id: app.lead_id,
      event_type: side === "internal" ? "internal_delay" : "external_delay",
      title: `${side === "internal" ? "Internal / our-side delay" : "Customer-side delay"} — ${data.reasonLabel}`,
      description: data.internalNote ?? null,
      customer_visible: false,
      actor_id: context.userId,
      actor_name: name,
      is_system: false,
      metadata: {
        reason_code: data.reasonCode,
        side,
        priority: data.priority,
        expected_review_at: expectedReviewIso,
        ...(data.evidence && side === "internal"
          ? {
              evidence_attached: true,
              evidence_filename: data.evidence.fileName,
              evidence_mime_type: data.evidence.mimeType,
              evidence_size_bytes: evidenceSizeBytes,
              evidence_storage_path: evidenceStoragePath,
              evidence_document_id: evidenceDocId,
            }
          : {
              evidence_attached: false,
            }),
      },
    }];
    if (side === "customer" && data.customerNote && data.customerNote.trim()) {
      events.push({
        application_id: app.id,
        lead_id: app.lead_id,
        event_type: "customer_communication",
        title: "Customer-visible delay note",
        description: data.customerNote.trim(),
        customer_visible: true,
        actor_id: context.userId,
        actor_name: name,
        is_system: false,
        metadata: { reason_code: data.reasonCode },
      });
    }
    await admin.from("workflow_events").insert(events as never);

    if (side === "customer") {
      // One authoritative wall-clock timer. The shared timer handler closes the
      // order first, applies A2, and only then queues E010.
      const { data: setting } = await admin
        .from("app_settings")
        .select("customer_delay_autoclose_minutes")
        .eq("id", 1)
        .maybeSingle();
      const closeMinutes = Math.max(1, Number(setting?.customer_delay_autoclose_minutes ?? 480));
      const { armTimer } = await import("@/lib/orders/actions/timers.server");
      await armTimer({
        applicationId: app.id,
        kind: "customer_hold_reminder",
        firesInMinutes: closeMinutes,
        payload: { reasonCode: data.reasonCode },
      });

      // Stop legacy reminders/schedulers so this action cannot create two
      // independent closure attempts.
      await admin
        .from("workflow_reminders")
        .update({ status: "cancelled" } as never)
        .eq("application_id", app.id)
        .eq("kind", "pending_closure_followup")
        .eq("status", "pending");
      const { cancelAllForOrder } = await import("@/lib/scheduling/schedulers.server");
      await cancelAllForOrder(app.id, "replaced_by_customer_hold_timer");

      if (lead?.email) {
        try {
          const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
          const { SUPPORT_EMAIL, COMPANY_NAME } = await import("@/lib/brand");
          await enqueueFromTemplateInternal(
            customerTplCode || "bhs_e003_customer_delay",
            lead.email,
            {
              customer_name: lead.name ?? "Customer",
              customer_email: lead.email ?? "",
              customer_mobile: (lead as any).mobile ?? "",
              order_id: app.application_code ?? "",
              order_number: app.application_code ?? "",
              service_name: lead.service ?? "",
              invoice_number: latestInvoice?.invoice_number ?? "—",
              order_created_at: orderCreatedIst,
              hold_status_label: holdStatusLabel,
              followup_date: holdNowIst,
              expected_update_date: expectedIst,
              employee_remarks: (data.customerNote && data.customerNote.trim()) || (data.internalNote && data.internalNote.trim()) || reasonBlock || "—",
              additional_remarks: (data.customerNote && data.customerNote.trim()) || (data.internalNote && data.internalNote.trim()) || reasonBlock || "—",
              remarks: (data.customerNote && data.customerNote.trim()) || (data.internalNote && data.internalNote.trim()) || reasonBlock || "—",
              reason: data.reasonLabel,
              reason_block: reasonBlock,
              date: new Date().toLocaleDateString("en-IN"),
              company_name: COMPANY_NAME,
              support_email: SUPPORT_EMAIL,
              customer_note: (data.customerNote && data.customerNote.trim()) || reasonBlock || "",
            },
            {
              toName: lead.name ?? undefined,
              leadId: app.lead_id ?? undefined,
              applicationId: app.id,
              trigger: "manual",
              allowDuplicate: true,
            },
          );
        } catch (e) {
          console.error("[workflow] customer-side delay email failed:", e);
        }
      }

      // Canonical employee action for performance credit (mirrors technical_delay_marked).
      try {
        await admin.from("application_events").insert({
          created_by: context.userId,
          application_id: app.id,
          lead_id: app.lead_id,
          event_type: "customer_delay_marked",
          note: `Customer delay marked: ${data.reasonLabel}${data.internalNote ? ` (${data.internalNote})` : ""}`,
          staff_name: name,
          staff_role: "staff",
        } as never);
      } catch (evtErr) {
        console.warn("[setExternalDelay] customer_delay_marked event warning:", evtErr);
      }

      // Internal notifications for customer-side hold (assignee + Super Admin).
      {
        const { emitToUsers, emitToRole } = await import("@/lib/notifications/emit.server");
        const notifBase = {
          kind: "customer_hold_started" as const,
          title: `Customer-Side Delay — ${data.reasonLabel}`,
          body: `Order ${app.application_code ?? ""} paused. Auto-closes in 8 hours if no response.`,
          href: `/admin/orders/${app.id}`,
          entityKind: "application",
          entityId: app.id,
        };
        if (lead?.assigned_to) await emitToUsers([lead.assigned_to], notifBase);
        await emitToRole("super_admin", notifBase);
      }
    } else {
      // ── Internal / our-side: notify customer with hold intimation ──
      // Internal notifications: assignee (if any) + Super Admin/Admin/Ops so someone always sees it.
      const { emitToUsers, emitToRole } = await import("@/lib/notifications/emit.server");
      const notifBase = {
        kind: "our_side_delay_start" as const,
        title: `Our-Side Delay — ${data.reasonLabel}`,
        body: `Order ${app.application_code ?? ""} paused (internal delay).`,
        href: `/admin/orders/${app.id}`,
        entityKind: "application",
        entityId: app.id,
      };
      if (lead?.assigned_to) {
        await emitToUsers([lead.assigned_to], notifBase);
      }
      await emitToRole("super_admin", notifBase);
      await emitToRole("admin", notifBase);

      try {
        await admin.from("application_events").insert({
          created_by: context.userId,
          application_id: app.id,
          event_type: "technical_delay_marked",
          note: `Technical delay marked: ${data.reasonLabel}${data.evidence ? ` · Evidence: ${data.evidence.fileName}` : ""}${data.internalNote ? ` (${data.internalNote})` : ""}`,
          staff_name: name,
          staff_role: "staff",
        } as never);
      } catch (evtErr) {
        console.warn("[setExternalDelay] application_events warning:", evtErr);
      }

      try {
        const { logEmployeeOrderAction } = await import("@/lib/orders/order-action-logger.server");
        await logEmployeeOrderAction({
          orderId: app.id,
          employeeId: context.userId,
          employeeName: name,
          actionType: "TECHNICAL_DELAY_ADDED",
          notes: `Technical delay marked: ${data.reasonLabel}.${data.evidence ? ` Evidence attached: ${data.evidence.fileName}.` : ""}${data.internalNote ? ` Note: ${data.internalNote}` : ""}`,
          source: "employee",
          supabase: admin,
        });
      } catch (auditErr) {
        console.warn("[setExternalDelay] order_action_logs warning:", auditErr);
      }

      // Send our-side delay hold intimation email to customer (E005/E004).
      if (lead?.email) {
        try {
          const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
          const { SUPPORT_EMAIL, COMPANY_NAME } = await import("@/lib/brand");
          await enqueueFromTemplateInternal(
            customerTplCode,
            lead.email,
            {
              customer_name: lead.name ?? "Customer",
              customer_email: lead.email ?? "",
              customer_mobile: (lead as any).mobile ?? "",
              order_id: app.application_code ?? "",
              order_number: app.application_code ?? "",
              service_name: lead.service ?? "",
              invoice_number: latestInvoice?.invoice_number ?? "—",
              order_created_at: orderCreatedIst,
              hold_status_label: holdStatusLabel,
              followup_date: holdNowIst,
              expected_update_date: expectedIst,
              employee_remarks: (data.internalNote && data.internalNote.trim()) || reasonBlock || "—",
              additional_remarks: (data.internalNote && data.internalNote.trim()) || reasonBlock || "—",
              remarks: (data.internalNote && data.internalNote.trim()) || reasonBlock || "—",
              reason: data.reasonLabel,
              reason_block: reasonBlock,
              date: new Date().toLocaleDateString("en-IN"),
              company_name: COMPANY_NAME,
              support_email: SUPPORT_EMAIL,
            },
            {
              toName: lead.name ?? undefined,
              leadId: app.lead_id ?? undefined,
              applicationId: app.id,
              trigger: "manual",
              allowDuplicate: true,
              attachments: emailAttachments,
            },
          );
        } catch (e) {
          console.error("[workflow] our-side delay email failed", e);
        }
      }
    }

    await writeAudit({
      supabase: context.supabase,
      entityType: "application",
      entityId: app.id,
      action: side === "internal" ? "workflow_internal_delay" : "workflow_external_delay",
      oldValue: { workflow_status: app.workflow_status },
      newValue: { workflow_status: workflowStatus, reason: data.reasonCode, side },
      actorId: context.userId,
    });

    // Automatically complete any active callback / Hot Order on this qualifying action
    try {
      const { completeHotOrderOnQualifyingAction } = await import("@/lib/orders/actions/callback-reminder.functions");
      await completeHotOrderOnQualifyingAction({
        orderId: app.id,
        actorId: context.userId,
        actorName: name,
        actionName: side === "internal" ? "Technical Delay" : "Customer Delay",
        actionReason: `${side === "internal" ? "Technical Delay" : "Customer Delay"} action performed: ${data.reasonLabel}`,
        supabase: admin,
      });
    } catch (hotErr) {
      console.warn("[setExternalDelay] completeHotOrderOnQualifyingAction warning:", hotErr);
    }

    return { ok: true, side };
  });

export const resumeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      note: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const name = await actorName(context.supabase, context.userId);

    const { data: app } = await admin
      .from("applications")
      .select("id, lead_id, workflow_status, application_code")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");

    const { data: lead } = await admin
      .from("leads")
      .select("name, email, service")
      .eq("id", app.lead_id!)
      .maybeSingle();

    // Cancel all pending reminders for this application
    await admin
      .from("workflow_reminders")
      .update({ status: "cancelled" } as never)
      .eq("application_id", app.id)
      .eq("status", "pending");

    // Stop active schedulers and order reminders for this order
    await admin
      .from("order_schedulers")
      .update({
        status: "stopped",
        stopped_at: new Date().toISOString(),
        stop_reason: "order_resumed",
        stop_triggered_by: context.userId,
      } as never)
      .eq("application_id", app.id)
      .in("status", ["active", "paused"]);

    await admin
      .from("order_reminders")
      .update({ is_active: false, stopped_at: new Date().toISOString(), stop_reason: "order_resumed" } as never)
      .eq("application_id", app.id);


    await admin
      .from("applications")
      .update({
        workflow_status: "processing_resumed",
        workflow_delay_reason: null,
        workflow_expected_review_at: null,
      } as never)
      .eq("id", app.id);

    await admin.from("workflow_events").insert({
      application_id: app.id,
      lead_id: app.lead_id,
      event_type: "resumed",
      title: "Order resumed",
      description: data.note ?? null,
      customer_visible: false,
      actor_id: context.userId,
      actor_name: name,
      is_system: false,
      metadata: {},
    } as never);

    // Notify customer via email that their order is back in processing.
    if (lead?.email) {
      try {
        const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
        const { SUPPORT_EMAIL, COMPANY_NAME } = await import("@/lib/brand");
        await enqueueFromTemplateInternal(
          "bhs_order_resumed",
          lead.email,
          {
            customer_name: lead.name ?? "Customer",
            order_id: app.application_code ?? "",
            order_number: app.application_code ?? "",
            service_name: lead.service ?? "",
            resume_note: data.note ?? "",
            company_name: COMPANY_NAME,
            support_email: SUPPORT_EMAIL,
          },
          { toName: lead.name ?? undefined, leadId: app.lead_id ?? undefined, applicationId: app.id, trigger: "manual" },
        );
      } catch (e) {
        console.error("[workflow] resume email failed", e);
      }
    }

    // Internal notifications: assignee + Super Admin that the order was resumed.
    {
      const { emitToUsers, emitToRole } = await import("@/lib/notifications/emit.server");
      const notifBase = {
        kind: "order_status_change" as const,
        title: `Order Resumed — ${app.application_code ?? ""}`,
        body: `${name} resumed processing.${data.note ? ` Note: ${data.note}` : ""}`,
        href: `/admin/orders/${app.id}`,
        entityKind: "application",
        entityId: app.id,
      };
      const { data: leadRow } = await admin
        .from("leads")
        .select("assigned_to")
        .eq("id", app.lead_id!)
        .maybeSingle();
      if (leadRow?.assigned_to && leadRow.assigned_to !== context.userId) {
        await emitToUsers([leadRow.assigned_to], notifBase);
      }
      await emitToRole("super_admin", notifBase);
    }

    await writeAudit({
      supabase: context.supabase,
      entityType: "application",
      entityId: app.id,
      action: "workflow_resume",
      oldValue: { workflow_status: app.workflow_status },
      newValue: { workflow_status: "processing_resumed" },
      actorId: context.userId,
    });

    return { ok: true };
  });

export const markCustomerReplied = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      summary: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const name = await actorName(context.supabase, context.userId);
    const { data: app } = await admin
      .from("applications")
      .select("id, lead_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");

    await admin.from("workflow_events").insert({
      application_id: app.id,
      lead_id: app.lead_id,
      event_type: "customer_replied",
      title: "Customer replied",
      description: data.summary ?? null,
      customer_visible: false,
      actor_id: context.userId,
      actor_name: name,
      is_system: false,
      metadata: {},
    } as never);

    // Notify assignee through existing notifications table.
    const { data: lead } = await admin.from("leads").select("assigned_to, name, lead_code").eq("id", app.lead_id!).maybeSingle();
    if (lead?.assigned_to) {
      await admin.from("notifications").insert({
        user_id: lead.assigned_to,
        title: "Customer replied",
        body: `${lead.name ?? "Customer"} replied on ${lead.lead_code ?? ""}`,
        kind: "customer_reply",
        link_to: `/admin/orders/${app.id}`,
      } as never);
    }
    return { ok: true };
  });

export const cancelWorkflowReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const { error } = await admin
      .from("workflow_reminders")
      .update({ status: "cancelled" } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
