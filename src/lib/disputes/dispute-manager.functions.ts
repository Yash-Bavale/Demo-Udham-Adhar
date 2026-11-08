import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

const COMPANY_EMAIL = "help@businesshelpservices.com";
const AUTHORIZED_ROLES = ["admin", "super_admin", "operations", "finance", "accounts", "manager", "executive"] as const;

export interface DisputeOrderSummary {
  applicationId: string;
  applicationCode: string;
  leadId: string;
  customerId: string | null;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  customerState: string | null;
  serviceName: string;
  orderDate: string;
  orderStatus: string;
  fulfillmentStatus: string;
  workflowStatus: string;
  totalAmount: number;
  assignedStaff: {
    id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
  payment: {
    id: string;
    status: string;
    amount: number;
    baseAmount: number;
    gstAmount: number;
    gatewayName: string;
    transactionId: string | null;
    paymentDate: string | null;
    createdAt: string;
  } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    status: string;
    pdfPath: string | null;
    createdAt: string;
  } | null;
  certificate: {
    id: string;
    certificateNumber: string | null;
    fileName: string | null;
    filePath: string | null;
    mimeType: string | null;
    issuedAt: string | null;
    deliveredAt: string | null;
  } | null;
  sentEmails: Array<{
    id: string;
    subject: string;
    from_email: string;
    to_email: string;
    sent_at: string | null;
    status: string;
    template_code: string | null;
    body_html: string | null;
    body_text: string | null;
    message_id: string | null;
    attempt?: number;
    error_message?: string | null;
    smtp_response?: string | null;
    attachment_names?: string[];
  }>;
  orderTimeline: Array<{
    id: string;
    eventType: string;
    label: string;
    note: string | null;
    createdAt: string;
    staffName: string | null;
  }>;
  evidenceHistory: Array<{
    id: string;
    generatedAt: string;
    generatedByName: string | null;
    fileName: string;
    filePath: string;
    itemCount: number;
    invoiceIncluded: boolean;
    certificateIncluded: boolean;
    selectedEmailCount: number;
  }>;
}

/**
 * 1. Search Order by Order Number / Application Code
 */
export const searchDisputeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderQuery: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }): Promise<DisputeOrderSummary | null> => {
    await assertRole(context.supabase, AUTHORIZED_ROLES as any);
    const admin = await getAdmin();
    const query = data.orderQuery.trim();

    // 1. Find application
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

    let app: any = null;
    if (isUuid) {
      const { data: res } = await admin
        .from("applications")
        .select("*")
        .eq("id", query)
        .maybeSingle();
      app = res;
    }

    if (!app) {
      // Try exact application_code match
      const { data: res } = await admin
        .from("applications")
        .select("*")
        .ilike("application_code", query)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      app = res;
    }

    if (!app) {
      // Try lookup through leads.lead_code
      const { data: leadMatch } = await admin
        .from("leads")
        .select("id")
        .ilike("lead_code", query)
        .limit(1)
        .maybeSingle();

      if (leadMatch) {
        const { data: res } = await admin
          .from("applications")
          .select("*")
          .eq("lead_id", leadMatch.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        app = res;
      }
    }

    if (!app) {
      return null;
    }

    const applicationId = app.id;
    const leadId = app.lead_id;

    // 2. Fetch Lead record separately for clean typing
    const { data: leadRow } = leadId
      ? await admin.from("leads").select("*").eq("id", leadId).maybeSingle()
      : { data: null };
    const lead: any = leadRow || {};

    // 3. Concurrently fetch all evidence & related data
    const [
      paymentsRes,
      invoicesRes,
      certificatesRes,
      emailLogsRes,
      emailQueueRes,
      eventsRes,
      profileRes,
      historyRes,
    ] = await Promise.all([
      admin
        .from("payments")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false }),
      admin
        .from("invoices")
        .select("*")
        .or(`application_id.eq.${applicationId},lead_id.eq.${leadId}`)
        .order("created_at", { ascending: false }),
      admin
        .from("certificates")
        .select("*")
        .or(`application_id.eq.${applicationId},lead_id.eq.${leadId}`)
        .order("created_at", { ascending: false }),
      admin
        .from("email_logs")
        .select("*")
        .or(`application_id.eq.${applicationId},lead_id.eq.${leadId}`)
        .order("sent_at", { ascending: false }),
      admin
        .from("email_queue")
        .select("*")
        .or(`application_id.eq.${applicationId},lead_id.eq.${leadId}`)
        .order("created_at", { ascending: false }),
      admin
        .from("application_events")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false }),
      app.assigned_to
        ? admin.from("profiles").select("id, display_name, email").eq("id", app.assigned_to).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("dispute_evidence_records" as any)
        .select("*")
        .eq("order_id", applicationId)
        .order("generated_at", { ascending: false }),
    ]);

    // 4. Process Payments
    const payments = paymentsRes.data ?? [];
    const successfulPayment = payments.find((p: any) =>
      ["paid", "success", "successful", "completed"].includes(String(p.status || "").toLowerCase())
    ) || payments[0] || null;

    // 5. Process Invoice
    const invoices = invoicesRes.data ?? [];
    const latestInvoice = invoices[0] || null;

    // 6. Process Certificate
    const certificates = certificatesRes.data ?? [];
    const latestCert = certificates[0] || null;

    // 7. Process Sent Emails (dedupe by queue_id or message_id and filter ONLY sent/attempted emails)
    const queueById = new Map<string, any>();
    for (const q of (emailQueueRes.data ?? [])) {
      queueById.set(q.id, q);
    }

    const attachmentNames = (row: any): string[] => {
      const raw = row?.variables?.__attachments;
      if (!Array.isArray(raw)) return [];
      return raw
        .map((attachment: any) => typeof attachment?.filename === "string" ? attachment.filename : "")
        .filter(Boolean);
    };

    const dedupMap = new Map<string, any>();
    for (const l of (emailLogsRes.data ?? [])) {
      const key = l.queue_id ? `q:${l.queue_id}` : l.message_id ? `m:${l.message_id}` : `l:${l.id}`;
      const q = l.queue_id ? queueById.get(l.queue_id) : null;
      const merged = {
        id: l.id,
        subject: l.subject || q?.subject || "Email Notification",
        from_email: l.from_email || COMPANY_EMAIL,
        to_email: l.to_email || lead.email || "customer@email.com",
        sent_at: l.sent_at || q?.sent_at || l.created_at,
        status: l.status || q?.status || "sent",
        template_code: l.template_code || q?.template_code || null,
        body_html: l.body_html || q?.body_html || null,
        body_text: l.body_text || q?.body_text || null,
        message_id: l.message_id || null,
        attempt: l.attempt ?? 1,
        error_message: l.error_message || null,
        smtp_response: l.smtp_response || null,
        attachment_names: attachmentNames(q),
      };

      // Filter: only include emails that were actually sent or attempted
      const st = String(merged.status).toLowerCase();
      const isSentOrAttempted = merged.sent_at != null || ["sent", "delivered", "attempted", "failed", "bounced"].includes(st);
      if (isSentOrAttempted) {
        dedupMap.set(key, merged);
      }
    }

    // Also include queue entries that succeeded if not captured in logs
    for (const q of (emailQueueRes.data ?? [])) {
      const key = `q:${q.id}`;
      if (!dedupMap.has(key)) {
        const st = String(q.status || "").toLowerCase();
        if (["sent", "delivered"].includes(st)) {
          dedupMap.set(key, {
            id: q.id,
            subject: q.subject || "Email Notification",
            from_email: COMPANY_EMAIL,
            to_email: q.to_email || lead.email || "customer@email.com",
            sent_at: q.sent_at || q.created_at,
            status: q.status || "sent",
            template_code: q.template_code || null,
            body_html: q.body_html || null,
            body_text: q.body_text || null,
            message_id: null,
            attempt: q.attempts ?? 1,
            error_message: q.last_error || null,
            smtp_response: null,
            attachment_names: attachmentNames(q),
          });
        }
      }
    }

    const sentEmailsList = Array.from(dedupMap.values()).sort(
      (a, b) => new Date(a.sent_at || 0).getTime() - new Date(b.sent_at || 0).getTime()
    );

    // 8. Process Order Timeline Events (filter customer / operational state changes)
    const rawEvents = eventsRes.data ?? [];
    const timelineEvents = rawEvents
      .filter((ev: any) => {
        const note = String(ev.note || "").toLowerCase();
        if (note.includes("internal comment only")) return false;
        return true;
      })
      .map((ev: any) => {
        let label = ev.event_type;
        const et = String(ev.event_type || "").toLowerCase();
        if (et.includes("order_received") || et.includes("order_created")) label = "Incomplete Form";
        else if (et.includes("form_submitted") || et.includes("form_link_sent")) label = "Form Submission Action";
        else if (et.includes("submitted_to_govt") || et.includes("application_submitted")) label = "Application Submitted to Authority";
        else if (et.includes("completed") || et.includes("certificate_uploaded")) label = "Order Completed / Certificate Issued";
        else if (et.includes("closed") || et.includes("rejected")) label = "Order Closed";
        else if (et.includes("customer_delay")) label = "Customer Delay Hold";
        else if (et.includes("technical_delay")) label = "Technical Delay Hold";
        else if (et.includes("call_completed")) label = "Customer Contact Completed";

        return {
          id: ev.id,
          eventType: ev.event_type,
          label,
          note: ev.note || null,
          createdAt: ev.created_at,
          staffName: ev.staff_name || null,
        };
      });

    // 9. Process Evidence History
    const evidenceHistory = ((historyRes?.data as any[]) ?? []).map((h: any) => ({
      id: h.id,
      generatedAt: h.generated_at || h.created_at,
      generatedByName: h.generated_by_name || "Authorized Staff",
      fileName: h.file_name,
      filePath: h.file_path,
      itemCount: h.item_count ?? 0,
      invoiceIncluded: Boolean(h.invoice_included),
      certificateIncluded: Boolean(h.certificate_included),
      selectedEmailCount: Array.isArray(h.selected_email_ids) ? h.selected_email_ids.length : 0,
    }));

    const assignedStaffProfile = profileRes?.data as any;

    return {
      applicationId: app.id,
      applicationCode: app.application_code || app.id.slice(0, 8),
      leadId: app.lead_id,
      customerId: app.customer_id ?? null,
      customerName: lead.name || "Valued Customer",
      customerMobile: lead.mobile || "—",
      customerEmail: lead.email || "—",
      customerState: lead.state || null,
      serviceName: lead.service || "Udyam Registration & Compliance Support",
      orderDate: app.created_at,
      orderStatus: app.order_status || "PENDING",
      fulfillmentStatus: app.fulfillment_status || "in_processing",
      workflowStatus: app.workflow_status || "active",
      totalAmount: Number(lead.total_amount || successfulPayment?.amount || 0),
      assignedStaff: assignedStaffProfile
        ? {
            id: assignedStaffProfile.id,
            name: assignedStaffProfile.display_name || assignedStaffProfile.email || "Staff",
            email: assignedStaffProfile.email || "",
          }
        : null,
      payment: successfulPayment
        ? {
            id: successfulPayment.id,
            status: successfulPayment.status || "PAID",
            amount: Number(successfulPayment.amount || 0),
            baseAmount: Number(successfulPayment.base_amount || 0),
            gstAmount: Number(successfulPayment.gst_amount || 0),
            gatewayName: successfulPayment.gateway_name || "Razorpay",
            transactionId: successfulPayment.transaction_id || null,
            paymentDate: successfulPayment.payment_date || successfulPayment.created_at,
            createdAt: successfulPayment.created_at,
          }
        : null,
      invoice: latestInvoice
        ? {
            id: latestInvoice.id,
            invoiceNumber: latestInvoice.invoice_number || "INV-ISSUED",
            totalAmount: Number(latestInvoice.total_amount || 0),
            status: "ISSUED",
            pdfPath: latestInvoice.pdf_path || null,
            createdAt: latestInvoice.created_at,
          }
        : null,
      certificate: latestCert
        ? {
            id: latestCert.id,
            certificateNumber: latestCert.certificate_number || null,
            fileName: latestCert.file_name || null,
            filePath: latestCert.file_path || null,
            mimeType: latestCert.mime_type || null,
            issuedAt: latestCert.issued_at || latestCert.created_at,
            deliveredAt: latestCert.delivered_at || null,
          }
        : null,
      sentEmails: sentEmailsList,
      orderTimeline: timelineEvents,
      evidenceHistory,
    };
  });

export const prepareDisputeEvidencePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    orderId: z.string().uuid(),
    includeInvoice: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, AUTHORIZED_ROLES as any);
    if (!data.includeInvoice) return { invoiceUrl: null };
    const admin = await getAdmin();
    const { data: invoice } = await admin
      .from("invoices")
      .select("pdf_path")
      .eq("application_id", data.orderId)
      .not("pdf_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!invoice?.pdf_path) throw new Error("The saved invoice PDF is not ready");
    const { data: signed, error } = await admin.storage.from("invoices").createSignedUrl(invoice.pdf_path, 60 * 10);
    if (error || !signed?.signedUrl) throw new Error("Could not open the saved invoice PDF");
    return { invoiceUrl: signed.signedUrl };
  });

export const saveBrowserDisputeEvidencePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    orderId: z.string().uuid(),
    disputeId: z.string().max(200).optional().nullable(),
    selectedEmailIds: z.array(z.string().uuid()).max(50),
    invoiceIncluded: z.boolean(),
    pdfBase64: z.string().min(100).max(28_000_000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, AUTHORIZED_ROLES as any);
    const admin = await getAdmin();
    const { data: app } = await admin.from("applications").select("id, application_code").eq("id", data.orderId).maybeSingle();
    if (!app) throw new Error("Application record not found");
    const pdfBytes = Uint8Array.from(atob(data.pdfBase64), (char) => char.charCodeAt(0));
    if (pdfBytes.length < 5 || new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") throw new Error("The generated file is not a valid PDF");
    const { data: profile } = await admin.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle();
    const now = new Date();
    const packageId = crypto.randomUUID();
    const cleanOrderCode = String(app.application_code || app.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateStamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const fileName = `dispute-evidence-${cleanOrderCode}-${dateStamp}.pdf`;
    const storagePath = `dispute-evidence/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${cleanOrderCode}/${fileName}`;
    const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(`Failed to save dispute PDF: ${uploadError.message}`);
    const itemCount = data.selectedEmailIds.length + (data.invoiceIncluded ? 1 : 0);
    const { error: recordError } = await (admin.from("dispute_evidence_records" as any) as any).insert({
      id: packageId,
      order_id: app.id,
      application_code: app.application_code,
      generated_by: user.id,
      generated_by_name: profile?.display_name || profile?.email || "Admin",
      generated_at: now.toISOString(),
      file_path: storagePath,
      file_name: fileName,
      selected_email_ids: data.selectedEmailIds,
      invoice_included: data.invoiceIncluded,
      certificate_included: false,
      item_count: itemCount,
      metadata: { disputeId: data.disputeId?.trim() || null, totalPdfBytes: pdfBytes.length, renderer: "crm-browser" },
    });
    if (recordError) {
      await admin.storage.from("documents").remove([storagePath]);
      throw new Error(`Failed to record dispute PDF: ${recordError.message}`);
    }
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(storagePath, 60 * 60);
    return { success: true, recordId: packageId, signedUrl: signed?.signedUrl || null, fileName, filePath: storagePath, itemCount };
  });

/**
 * 3. Get fresh authenticated signed URL to download / view dispute evidence
 */
export const getDisputeEvidenceSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ recordId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, AUTHORIZED_ROLES as any);
    const admin = await getAdmin();

    const { data: row, error } = await (admin
      .from("dispute_evidence_records" as any) as any)
      .select("file_path, file_name")
      .eq("id", data.recordId)
      .single();

    if (error || !row?.file_path) {
      throw new Error("Dispute evidence package not found");
    }

    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(row.file_path, 60 * 60);

    if (!signed?.signedUrl) {
      throw new Error("Failed to generate download link");
    }

    return {
      signedUrl: signed.signedUrl,
      fileName: row.file_name,
    };
  });

/**
 * 4. Delete single dispute evidence package record and storage file
 */
export const deleteDisputeEvidenceRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ recordId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, AUTHORIZED_ROLES as any);
    const admin = await getAdmin();

    const { data: row } = await (admin
      .from("dispute_evidence_records" as any) as any)
      .select("file_path")
      .eq("id", data.recordId)
      .maybeSingle();

    if (row?.file_path) {
      await admin.storage.from("documents").remove([row.file_path]);
    }

    await (admin.from("dispute_evidence_records" as any) as any)
      .delete()
      .eq("id", data.recordId);

    return { success: true };
  });

/**
 * 5. Delete all old dispute evidence packages from Supabase
 */
export const deleteAllDisputeEvidenceRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, AUTHORIZED_ROLES as any);
    const admin = await getAdmin();

    let query = admin.from("dispute_evidence_records" as any).select("id, file_path");
    if (data.orderId) {
      query = query.eq("order_id", data.orderId);
    }

    const { data: rows } = await query;
    const paths = (rows ?? []).map((r: any) => r.file_path).filter(Boolean);

    if (paths.length > 0) {
      await admin.storage.from("documents").remove(paths);
    }

    let delQuery = admin.from("dispute_evidence_records" as any).delete();
    if (data.orderId) {
      delQuery = delQuery.eq("order_id", data.orderId);
    } else {
      delQuery = delQuery.neq("id", "00000000-0000-0000-0000-000000000000");
    }

    await delQuery;

    return { success: true, deletedCount: (rows ?? []).length };
  });
