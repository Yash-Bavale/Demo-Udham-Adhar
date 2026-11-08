// Admin functions for Pipeline Health, Email Processing Errors, and Audit Search.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function requireAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const rows = (roles ?? []) as Array<{ role: string }>;
  const isAdmin = rows.some((r) => r.role === "admin" || r.role === "super_admin");
  if (!isAdmin) throw new Error("Forbidden: admin role required");
}

/**
 * Get comprehensive Pipeline Health statistics.
 */
export const getPipelineHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    const { getAllCheckpoints } = await import("@/lib/mail/checkpoint.server");

    const mailbox = (process.env.ZOHO_FROM_EMAIL || "help@businesshelpservices.com").trim().toLowerCase();
    const checkpoints = await getAllCheckpoints(mailbox);

    // Count statistics from audit logs for today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    const [
      discoveredToday,
      completedToday,
      errorsToday,
      newTicketsToday,
      openErrors,
      unlinkedTickets,
      recentAuditLogs,
      recentErrors,
    ] = await Promise.all([
      (admin.from("email_ingestion_audit_logs" as any) as any)
        .select("*", { count: "exact", head: true })
        .eq("stage", "DISCOVERED")
        .gte("created_at", todayIso),
      (admin.from("email_ingestion_audit_logs" as any) as any)
        .select("*", { count: "exact", head: true })
        .eq("stage", "COMPLETED")
        .gte("created_at", todayIso),
      (admin.from("email_processing_errors" as any) as any)
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayIso),
      admin
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .eq("source", "email_inbound")
        .gte("created_at", todayIso),
      (admin.from("email_processing_errors" as any) as any)
        .select("*", { count: "exact", head: true })
        .in("status", ["new", "retrying"]),
      admin
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .or("is_unlinked.eq.true,order_link_status.eq.needs_review"),
      (admin.from("email_ingestion_audit_logs" as any) as any)
        .select("id, zoho_mail_uid, zoho_folder_name, stage, sender_normalized, subject, matched_ticket_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      (admin.from("email_processing_errors" as any) as any)
        .select("id, zoho_mail_uid, zoho_folder_name, from_email, subject, error_stage, error_message, status, created_at")
        .in("status", ["new", "retrying"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // Check last successful sync across checkpoints
    let latestSyncAt: string | null = null;
    let isHealthy = true;
    for (const cp of checkpoints) {
      if (!latestSyncAt || cp.last_sync_at > latestSyncAt) {
        latestSyncAt = cp.last_sync_at;
      }
      if (cp.status === "error" && cp.consecutive_failures >= 3) {
        isHealthy = false;
      }
    }

    return {
      mailbox,
      isHealthy,
      lastSyncAt: latestSyncAt,
      checkpoints,
      today: {
        discovered: discoveredToday.count ?? 0,
        completed: completedToday.count ?? 0,
        errors: errorsToday.count ?? 0,
        newTickets: newTicketsToday.count ?? 0,
      },
      openErrorsCount: openErrors.count ?? 0,
      unlinkedTicketsCount: unlinkedTickets.count ?? 0,
      recentAuditLogs: recentAuditLogs.data ?? [],
      recentErrors: recentErrors.data ?? [],
    };
  });

/**
 * List Email Processing Errors with pagination and status filtering.
 */
export const getProcessingErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      status: z.enum(["new", "retrying", "resolved", "failed", "dismissed", "all"]).default("new"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(30),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;

    let q = (admin.from("email_processing_errors" as any) as any)
      .select("*", { count: "exact" });

    if (data.status !== "all") {
      q = q.eq("status", data.status);
    }

    const { data: rows, count, error } = await q
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    return {
      errors: (rows ?? []) as any[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.limit,
      totalPages: Math.ceil((count ?? 0) / data.limit),
    };
  });

/**
 * Retry processing a single error record.
 */
export const retryProcessingError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    const { data: row } = await (admin.from("email_processing_errors" as any) as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (!row) throw new Error("Processing error record not found");
    const r = row as any;

    await (admin.from("email_processing_errors" as any) as any)
      .update({
        status: "retrying",
        retry_count: (r.retry_count || 0) + 1,
        last_retried_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);

    try {
      const { pollZohoInbox } = await import("@/lib/mail/inbox-matcher.server");
      const result = await pollZohoInbox({
        folderIds: r.zoho_folder_id ? [r.zoho_folder_id] : undefined,
        limit: 50,
      });

      await (admin.from("email_processing_errors" as any) as any)
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: context.userId,
          resolution_action: "retry_success",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", data.id);

      return { ok: true, message: `Retried successfully. Ingestion counters: ${result.matched} matched, ${result.new} new.` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await (admin.from("email_processing_errors" as any) as any)
        .update({
          status: "failed",
          error_message: msg,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", data.id);

      throw new Error(`Retry failed: ${msg}`);
    }
  });

/**
 * Manually create a support ticket directly from a processing error.
 */
export const createTicketFromProcessingError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      customerId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    const { data: row } = await (admin.from("email_processing_errors" as any) as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (!row) throw new Error("Processing error not found");
    const r = row as any;

    const subject = (r.subject || "(no subject)").slice(0, 240);
    const bodyText = r.body_snippet || "Manual ticket created from processing error";
    const now = new Date().toISOString();

    const { data: created, error: tErr } = await admin
      .from("support_tickets")
      .insert({
        subject,
        description: bodyText.slice(0, 4000),
        source: "email_inbound",
        status: "open",
        customer_id: data.customerId ?? null,
        application_id: data.applicationId ?? null,
        ticket_email: r.from_email,
        is_unlinked: !data.customerId || !data.applicationId,
        order_link_status: data.applicationId ? "linked" : "unlinked",
        last_customer_message_at: now,
        created_at: now,
        updated_at: now,
      } as never)
      .select("id, ticket_number")
      .single();

    if (tErr) throw new Error(`Ticket creation failed: ${tErr.message}`);
    const t = created as { id: string; ticket_number: string };

    await admin.from("ticket_replies").insert({
      ticket_id: t.id,
      reply_text: bodyText,
      is_internal: false,
      direction: "inbound",
      email_message_id: r.message_id,
      created_at: now,
    } as never);

    await (admin.from("email_processing_errors" as any) as any)
      .update({
        status: "resolved",
        resolved_at: now,
        resolved_by: context.userId,
        resolution_action: `created_ticket_${t.ticket_number}`,
        matched_ticket_id: t.id,
        updated_at: now,
      } as never)
      .eq("id", data.id);

    return { ok: true, ticketId: t.id, ticketNumber: t.ticket_number };
  });

/**
 * Global Admin Email Search: Answer "What happened to email X?" with complete audit lifecycle.
 */
export const searchEmailAuditTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      query: z.string().trim().min(1).max(200),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    const term = data.query.toLowerCase();

    // Query audit logs across email, subject, messageId, UID
    const { data: auditRows } = await (admin.from("email_ingestion_audit_logs" as any) as any)
      .select(
        "id, zoho_mail_uid, zoho_folder_name, message_id, sender_normalized, reply_to_email, to_email, subject, stage, matched_ticket_id, matched_application_id, matched_customer_id, is_duplicate, metadata, error_details, created_at"
      )
      .or(
        `sender_normalized.ilike.%${term}%,subject.ilike.%${term}%,message_id.ilike.%${term}%,zoho_mail_uid.ilike.%${term}%`
      )
      .order("created_at", { ascending: false })
      .limit(50);

    // Also search support tickets
    const { data: ticketRows } = await admin
      .from("support_tickets")
      .select("id, ticket_number, subject, status, ticket_email, application_id, customer_id, created_at")
      .or(`ticket_number.ilike.%${term}%,subject.ilike.%${term}%,ticket_email.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    // Also search processing errors
    const { data: errorRows } = await (admin.from("email_processing_errors" as any) as any)
      .select("id, zoho_mail_uid, from_email, subject, error_stage, error_message, status, created_at")
      .or(`from_email.ilike.%${term}%,subject.ilike.%${term}%,zoho_mail_uid.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      auditEvents: (auditRows ?? []) as any[],
      tickets: (ticketRows ?? []) as any[],
      processingErrors: (errorRows ?? []) as any[],
    };
  });

/**
 * Manually trigger email polling across all discovered Zoho folders.
 */
export const pollInboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i ?? {})
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);

    const { pollZohoInbox } = await import("@/lib/mail/inbox-matcher.server");
    const result = await pollZohoInbox({ limit: data.limit });

    return {
      ok: true,
      fetched: result.fetched,
      new: result.new,
      matched: result.matched,
      unmatched: result.unmatched,
      duplicates: result.duplicates,
      errors: result.errors,
      foldersScanned: result.foldersScanned,
      timestamp: new Date().toISOString(),
      message: `Scanned ${result.foldersScanned.length} folders: fetched ${result.fetched}, ${result.new} new, ${result.matched} matched, ${result.unmatched} unlinked, ${result.duplicates} duplicates, ${result.errors} errors.`,
    };
  });

/**
 * Get recent email logs with correct timestamp ordering.
 */
export const getRecentInboxEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(100).default(50),
      page: z.number().int().min(1).default(1),
      direction: z.enum(["incoming", "outgoing"]).default("incoming"),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;

    const { data: rows, count, error } = await admin
      .from("email_logs")
      .select(
        "id, from_email, to_email, subject, status, direction, sent_at, created_at, template_code, application_id, customer_id, lead_id, zoho_mail_uid",
        { count: "exact" }
      )
      .eq("direction", data.direction)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    return {
      emails: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.limit,
      totalPages: Math.ceil((count ?? 0) / data.limit),
    };
  });

/**
 * Get all support tickets with filters.
 */
export const getAllTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(100).default(50),
      page: z.number().int().min(1).default(1),
      status: z.enum(["open", "in_progress", "waiting_customer", "resolved", "closed"]).optional(),
      unlinkedOnly: z.boolean().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;

    let q = admin
      .from("support_tickets")
      .select(
        "id, ticket_number, subject, status, priority, is_unlinked, order_link_status, alternate_sender_email, created_at, updated_at, first_response_at, resolved_at, closed_at, application_id, customer_id, ticket_email, assigned_to",
        { count: "exact" }
      );

    if (data.status) q = q.eq("status", data.status);
    if (data.unlinkedOnly) q = q.or("is_unlinked.eq.true,order_link_status.eq.needs_review");

    const { data: rows, count, error } = await q
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    return {
      tickets: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.limit,
      totalPages: Math.ceil((count ?? 0) / data.limit),
    };
  });
