/**
 * Support-ticket atomic actions — email-driven flow.
 *
 * - replyToTicket           → public/internal staff reply. Public replies email
 *                             the customer inline with threaded headers
 *                             headers so Gmail/Outlook show one conversation.
 * - closeTicketWithReply    → E008 email + close (cancellation flow)
 * - closeTicketFinal        → E009 email + close (cancellation flow)
 *
 * Every action posts a `ticket_replies` row for audit and updates the ticket
 * status. Auto-close relies on `startTicketAutocloseScheduler` and is
 * cancelled automatically when the customer replies (inbox matcher) or when
 * staff close/reopen the ticket manually.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BHS_EMAILS } from "@/lib/emails/bhs-templates";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

type TicketRow = {
  id: string;
  ticket_number: string | null;
  subject: string;
  status: string | null;
  application_id: string | null;
  customer_id: string | null;
  ticket_email: string | null;
  first_response_at: string | null;
};

async function loadTicket(ticketId: string): Promise<TicketRow> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, application_id, customer_id, ticket_email, first_response_at",
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ticket not found");
  return data as TicketRow;
}

async function loadCustomer(customerId: string | null) {
  if (!customerId) return { email: null as string | null, mobile: null as string | null, name: "Customer" };
  const admin = await getAdmin();
  const { data } = await admin
    .from("customers")
    .select("primary_email, primary_mobile, name")
    .eq("id", customerId)
    .maybeSingle();
  const c = data as { primary_email: string | null; primary_mobile: string | null; name: string | null } | null;
  return { email: c?.primary_email ?? null, mobile: c?.primary_mobile ?? null, name: c?.name ?? "Customer" };
}

function formatTicketDate(iso = new Date().toISOString()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** Build In-Reply-To / References chain from prior outbound replies on this ticket,
 *  falling back to the order's stored thread anchor so ticket replies continue
 *  the same email conversation the customer already sees. */
async function loadThreadHeaders(ticketId: string, applicationId: string | null): Promise<{
  inReplyTo: string | null;
  references: string | null;
  threadSubject: string | null;
}> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("ticket_replies")
    .select("email_message_id")
    .eq("ticket_id", ticketId)
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: true });
  const ids = ((data ?? []) as Array<{ email_message_id: string | null }>)
    .map((r) => r.email_message_id)
    .filter(Boolean) as string[];

  let orderThreadId: string | null = null;
  let orderThreadSubject: string | null = null;
  if (applicationId) {
    const { data: appRow } = await admin
      .from("applications")
      .select("email_thread_message_id, email_thread_subject")
      .eq("id", applicationId)
      .maybeSingle();
    const a = appRow as { email_thread_message_id?: string | null; email_thread_subject?: string | null } | null;
    orderThreadId = a?.email_thread_message_id ?? null;
    orderThreadSubject = a?.email_thread_subject ?? null;
  }

  const allRefs = [orderThreadId, ...ids].filter(Boolean) as string[];
  if (allRefs.length === 0) {
    return { inReplyTo: null, references: null, threadSubject: orderThreadSubject };
  }
  return {
    inReplyTo: allRefs[allRefs.length - 1],
    references: allRefs.map((i) => (i.startsWith("<") ? i : `<${i}>`)).join(" "),
    threadSubject: orderThreadSubject,
  };
}

async function loadActorName(actorId: string) {
  const admin = await getAdmin();
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name, full_name, email")
      .eq("id", actorId)
      .maybeSingle();
    const p = prof as { display_name?: string | null; full_name?: string | null; email?: string | null } | null;
    return p?.display_name || p?.full_name || p?.email?.split("@")[0] || "Support";
  } catch {
    return "Support";
  }
}

async function stampReplyEmailDelivery(input: {
  replyId: string;
  queueId: string | null;
  inReplyTo: string | null;
  emailedAt?: string;
}) {
  const admin = await getAdmin();
  const now = input.emailedAt ?? new Date().toISOString();
  let patch: Record<string, unknown> = { emailed_at: now, email_in_reply_to: input.inReplyTo };

  if (input.queueId) {
    try {
      const { data: log } = await admin
        .from("email_logs")
        .select("id, message_id")
        .eq("queue_id", input.queueId)
        .eq("direction", "outgoing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const l = log as { id: string | null; message_id: string | null } | null;
      patch = {
        ...patch,
        email_message_id: l?.message_id ?? null,
        email_send_log_id: l?.id ?? null,
      };
    } catch { /* non-fatal: emailed_at is still authoritative */ }
  }

  await admin.from("ticket_replies").update(patch as never).eq("id", input.replyId);
}

async function sendTicketTemplateEmail(opts: {
  ticket: TicketRow;
  code: string;
  actorId: string;
  extraVars?: Record<string, unknown>;
  replyId?: string;
}) {
  const cust = await loadCustomer(opts.ticket.customer_id);
  const recipient = opts.ticket.ticket_email || cust.email;
  if (!recipient) throw new Error("Customer has no registered email address on this ticket.");

  const actorName = await loadActorName(opts.actorId);
  const thread = await loadThreadHeaders(opts.ticket.id, opts.ticket.application_id ?? null);
  const ticketNumber = opts.ticket.ticket_number ?? opts.ticket.id.slice(0, 8);
  const threadedSubject = thread.threadSubject
    ? (thread.threadSubject.toLowerCase().startsWith("re:") ? thread.threadSubject : `Re: ${thread.threadSubject}`)
    : `Re: [#${ticketNumber}] ${opts.ticket.subject}`;

  const { enqueueFromTemplateInternal, enqueueEmailInternal } = await import("@/lib/emails/emails.server");
  try {
    const result = await enqueueFromTemplateInternal(
      opts.code,
      recipient,
      {
        customer_name: cust.name,
        customerName: cust.name,
        customer_email: cust.email ?? "",
        customerEmail: cust.email ?? "",
        customer_mobile: cust.mobile ?? "",
        customerMobile: cust.mobile ?? "",
        ticket_number: ticketNumber,
        ticketNumber,
        ticket_subject: opts.ticket.subject,
        ticketSubject: opts.ticket.subject,
        closure_date: formatTicketDate(),
        closureDate: formatTicketDate(),
        fromName: `${actorName} · Business Help Services`,
        executive_name: actorName,
        ...(opts.extraVars ?? {}),
      },
      {
        toName: cust.name,
        applicationId: opts.ticket.application_id ?? undefined,
        inReplyTo: thread.inReplyTo,
        references: thread.references,
        threadSubject: threadedSubject,
        requireImmediateSuccess: true,
        trigger: "manual",
      },
    );

    const queueId = (result as { queueId?: string | null } | undefined)?.queueId ?? null;
    if (opts.replyId) {
      await stampReplyEmailDelivery({ replyId: opts.replyId, queueId, inReplyTo: thread.inReplyTo });
    }
    return { emailed: true, recipient, queueId };
  } catch (templateErr) {
    console.warn(`[tickets] template '${opts.code}' failed or not found in DB, falling back to direct email delivery:`, templateErr);
    const fallbackMessage = String(
      opts.extraVars?.replyMessage ||
      opts.extraVars?.employee_reply ||
      opts.extraVars?.employeeReply ||
      opts.ticket.subject ||
      "Support Ticket Update",
    );
    const isHtml = /<[a-z][\s\S]*>/i.test(fallbackMessage);
    const bodyHtml = isHtml
      ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${fallbackMessage}</div>`
      : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${escapeHtml(fallbackMessage).replace(/\n/g, "<br />")}</div>`;

    const result = await enqueueEmailInternal({
      toEmail: recipient,
      toName: cust.name,
      subject: threadedSubject,
      bodyHtml,
      bodyText: fallbackMessage,
      applicationId: opts.ticket.application_id ?? undefined,
      variables: {
        __allow_without_template: true,
        __in_reply_to: thread.inReplyTo,
        __references: thread.references,
      },
      allowWithoutTemplate: true,
      requireImmediateSuccess: true,
    });
    const queueId = (result as { queueId?: string | null } | undefined)?.queueId ?? null;
    if (opts.replyId) {
      await stampReplyEmailDelivery({ replyId: opts.replyId, queueId, inReplyTo: thread.inReplyTo });
    }
    return { emailed: true, recipient, queueId };
  }
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendTicketAdHocReply(opts: {
  ticket: TicketRow;
  actorId: string;
  message: string;
  replyId: string;
  cc?: string;
  bcc?: string;
  attachments?: Array<{ filename: string; content_base64: string; content_type: string }>;
}) {
  const totalB64 = (opts.attachments ?? []).reduce((n, a) => n + a.content_base64.length, 0);
  if (totalB64 > 20 * 1024 * 1024) throw new Error("Attachments are too large to email (max ~15 MB total).");
  const atts = opts.attachments?.length ? opts.attachments : undefined;
  // Real files are attached, so drop the storage-link block from the email copy only.
  if (atts) opts = { ...opts, message: opts.message.replace(/<div data-crm-attachments="1"[\s\S]*$/, "") || " " };
  const cust = await loadCustomer(opts.ticket.customer_id);
  const recipient = opts.ticket.ticket_email || cust.email;
  if (!recipient) throw new Error("Customer has no registered email address on this ticket.");

  const actorName = await loadActorName(opts.actorId);
  const thread = await loadThreadHeaders(opts.ticket.id, opts.ticket.application_id ?? null);
  const ticketNumber = opts.ticket.ticket_number ?? opts.ticket.id.slice(0, 8);
  const subjectBase = thread.threadSubject || `[#${ticketNumber}] ${opts.ticket.subject}`;
  const subject = subjectBase.toLowerCase().startsWith("re:") ? subjectBase : `Re: ${subjectBase}`;
  const bodyText = opts.message.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim() || opts.message;
  // If the agent composed rich HTML (contenteditable), send it directly.
  // If plain text, wrap in a div and convert newlines to <br>.
  const isHtmlBody = /<[a-z][\s\S]*>/i.test(opts.message);
  const bodyHtml = isHtmlBody
    ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${opts.message}</div>`
    : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${escapeHtml(opts.message).replace(/\n/g, "<br />")}</div>`;

  const { enqueueEmailInternal } = await import("@/lib/emails/emails.server");
  const result = await enqueueEmailInternal({
    toEmail: recipient,
    toName: cust.name,
    subject,
    bodyHtml,
    bodyText,
    cc: opts.cc,
    bcc: opts.bcc,
    applicationId: opts.ticket.application_id ?? undefined,
    variables: {
      __allow_without_template: true,
      __in_reply_to: thread.inReplyTo,
      __references: thread.references,
      ...(opts.cc ? { __cc: opts.cc } : {}),
      ...(opts.bcc ? { __bcc: opts.bcc } : {}),
    },
    allowWithoutTemplate: true,
    requireImmediateSuccess: true,
    attachments: atts,
  });
  const queueId = (result as { queueId?: string | null } | undefined)?.queueId ?? null;
  await stampReplyEmailDelivery({ replyId: opts.replyId, queueId, inReplyTo: thread.inReplyTo });
  return { emailed: true, recipient, queueId };
}

// ─────────────────────────── replyToTicket ───────────────────────────

const ReplyInput = z.object({
  ticketId: z.string().uuid(),
  message: z.string().min(1),
  isInternal: z.boolean().optional(),
  closeTicket: z.boolean().optional().default(true),
  armAutoclose: z.boolean().default(true),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string().min(1).max(255),
    content_base64: z.string().min(1),
    content_type: z.string().max(200),
  })).max(10).optional(),
  storedFiles: z.array(z.object({
    storage_path: z.string().min(1).max(500),
    file_name: z.string().min(1).max(255),
    mime_type: z.string().max(200),
    file_size: z.number().int().nonnegative(),
  })).max(10).optional(),
});

export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReplyInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const ticket = await loadTicket(data.ticketId);
    const now = new Date().toISOString();

    // Insert the reply row first. Internal notes never email.
    const { data: replyRow, error: repErr } = await admin
      .from("ticket_replies")
      .insert({
        ticket_id: ticket.id,
        reply_text: data.message,
        is_internal: data.isInternal ?? false,
        created_by: context.userId,
        direction: data.isInternal ? "note" : "outbound",
      } as never)
      .select("id")
      .single();
    if (repErr) throw new Error(repErr.message);

    // Link staff-uploaded files to this reply so the thread shows them.
    const ticketPrefix = `tickets/${ticket.id}/`;
    const linkFiles = (data.storedFiles ?? []).filter((f) => f.storage_path.startsWith(ticketPrefix) && !f.storage_path.includes(".."));
    if (linkFiles.length) {
      try {
        await (admin.from("ticket_reply_attachments" as never) as any).insert(
          linkFiles.map((f) => ({
            ticket_id: ticket.id,
            ticket_reply_id: (replyRow as { id: string }).id,
            file_name: f.file_name,
            file_size: f.file_size,
            mime_type: f.mime_type || "application/octet-stream",
            storage_bucket: "documents",
            storage_path: f.storage_path,
          })),
        );
      } catch (e) {
        console.warn("[replyToTicket] attachment link failed", e);
      }
    }

    if (data.isInternal) {
      return { ok: true, emailed: false, reason: "internal_note" };
    }

    const willClose = data.closeTicket !== false;
    const patch: Record<string, unknown> = {
      status: willClose ? "closed" : "waiting_customer",
      resolved_at: willClose ? now : null,
      resolved_by: willClose ? context.userId : null,
      closed_at: willClose ? now : null,
      updated_at: now,
      last_staff_message_at: now,
    };
    if (!ticket.first_response_at) patch.first_response_at = now;
    await admin.from("support_tickets").update(patch as never).eq("id", ticket.id);

    if (willClose) {
      try {
        const { cancelTicketAutocloseByTicket } = await import("@/lib/scheduling/schedulers.server");
        await cancelTicketAutocloseByTicket(ticket.id, "closed_on_reply");
      } catch { /* non-fatal */ }

      if (ticket.application_id) {
        try {
          const { dispatchEvent } = await import("@/lib/workflow/engine.server");
          await dispatchEvent(
            {
              type: "TicketClosed",
              applicationId: ticket.application_id,
              ticketId: ticket.id,
              outcome: "cooperating",
              actorId: context.userId,
            },
            context.userId,
          );
        } catch (e) {
          console.error("[workflow] TicketClosed dispatch failed", e);
        }
      }
    } else if (data.armAutoclose) {
      try {
        const { startTicketAutocloseScheduler } = await import("@/lib/scheduling/schedulers.server");
        await startTicketAutocloseScheduler({
          ticketId: ticket.id,
          applicationId: ticket.application_id ?? null,
          totalSeconds: 24 * 60 * 60,
          createdBy: context.userId,
          note: "Standard employee reply auto-close timer",
        });
      } catch { /* non-fatal */ }
    }

    // Record in immutable employee action audit log
    if (ticket.application_id) {
      try {
        const { logEmployeeOrderAction } = await import("@/lib/orders/order-action-logger.server");
        await logEmployeeOrderAction({
          orderId: ticket.application_id,
          employeeId: context.userId,
          actionType: "TICKET_REPLIED",
          notes: `${willClose ? "Replied & closed" : "Replied to"} ticket #${ticket.ticket_number || ticket.id.slice(0, 8)}`,
          source: "employee",
          supabase: admin,
        });
      } catch (auditErr) {
        console.warn("[replyToTicket] order action audit log error:", auditErr);
      }
    }

    // Try to send the reply email. If the customer has no email on file we
    // still keep the reply row and close the ticket in CRM.
    const cust = await loadCustomer(ticket.customer_id);
    const recipient = ticket.ticket_email || cust.email;
    if (!recipient) {
      return { ok: true, emailed: false, reason: "no_recipient_email" };
    }

    try {
      const result = await sendTicketAdHocReply({
        ticket,
        actorId: context.userId,
        replyId: (replyRow as { id: string }).id,
        message: data.message,
        cc: data.cc,
        bcc: data.bcc,
        attachments: data.attachments,
      });
      return { ok: true, emailed: true, recipient: result.recipient };
    } catch (e) {
      console.error("[tickets] reply email failed", e);
      throw new Error(e instanceof Error ? e.message : "Reply was saved and ticket closed in CRM, but the email was not sent.");
    }
  });

// ─────────────────────────── closeTicketWithReply (E008) ───────────────────────────

const CloseWithReplyInput = z.object({
  ticketId: z.string().uuid(),
  message: z.string().min(1),
});

export const closeTicketWithReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CloseWithReplyInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const ticket = await loadTicket(data.ticketId);
    const now = new Date().toISOString();

    await admin.from("ticket_replies").insert({
      ticket_id: ticket.id,
      reply_text: data.message,
      is_internal: false,
      created_by: context.userId,
      direction: "outbound",
    } as never);

    await admin
      .from("support_tickets")
      .update({
        status: "closed",
        resolved_at: now,
        resolved_by: context.userId,
        closed_at: now,
        updated_at: now,
        last_staff_message_at: now,
      } as never)
      .eq("id", ticket.id);

    // Cancel any armed auto-close.
    const { cancelTicketAutocloseByTicket } = await import("@/lib/scheduling/schedulers.server");
    await cancelTicketAutocloseByTicket(ticket.id, "closed_by_staff");

    if (ticket.application_id) {
      try {
        const { dispatchEvent } = await import("@/lib/workflow/engine.server");
        await dispatchEvent(
          {
            type: "TicketClosed",
            applicationId: ticket.application_id,
            ticketId: ticket.id,
            outcome: "not_cooperating",
            actorId: context.userId,
          },
          context.userId,
        );
      } catch (e) { console.error("[workflow] TicketClosed dispatch failed", e); }
    }


    const cust = await loadCustomer(ticket.customer_id);
    const recipient = ticket.ticket_email || cust.email;
    if (recipient) {
      const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
      try {
        await enqueueFromTemplateInternal(
          BHS_EMAILS.E009_TICKET_RESOLVED,
          recipient,
          {
            customerName: cust.name,
            ticketSubject: ticket.subject,
            ticketNumber: ticket.ticket_number ?? ticket.id.slice(0, 8),
            replyMessage: data.message,
            fromName: process.env.ZOHO_FROM_NAME || "Udyam Support",
          },
          { applicationId: ticket.application_id ?? undefined, trigger: "manual" },
        );
      } catch (e) {
        console.error("[tickets] E008 enqueue failed", e);
      }
    }

    return { ok: true };
  });

// ─────────────────────────── closeTicketFinal (E009) ───────────────────────────

const CloseFinalInput = z.object({
  ticketId: z.string().uuid(),
  reason: z.string().optional(),
});

export const closeTicketFinal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CloseFinalInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const ticket = await loadTicket(data.ticketId);
    const now = new Date().toISOString();

    await admin
      .from("support_tickets")
      .update({
        status: "closed",
        resolved_at: now,
        resolved_by: context.userId,
        closed_at: now,
        updated_at: now,
      } as never)
      .eq("id", ticket.id);

    await admin.from("ticket_replies").insert({
      ticket_id: ticket.id,
      reply_text: data.reason || "Ticket closed — no further action required.",
      is_internal: true,
      created_by: context.userId,
      direction: "note",
    } as never);

    const { cancelTicketAutocloseByTicket } = await import("@/lib/scheduling/schedulers.server");
    await cancelTicketAutocloseByTicket(ticket.id, "closed_final");

    if (ticket.application_id) {
      try {
        const { dispatchEvent } = await import("@/lib/workflow/engine.server");
        await dispatchEvent(
          {
            type: "TicketClosed",
            applicationId: ticket.application_id,
            ticketId: ticket.id,
            outcome: "not_cooperating",
            actorId: context.userId,
          },
          context.userId,
        );
      } catch (e) { console.error("[workflow] TicketClosed dispatch failed", e); }
    }

    const cust = await loadCustomer(ticket.customer_id);
    const recipient = ticket.ticket_email || cust.email;
    if (recipient) {
      const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
      try {
        await enqueueFromTemplateInternal(
          BHS_EMAILS.E010_TICKET_CLOSED_FINAL,
          recipient,
          {
            customerName: cust.name,
            ticketSubject: ticket.subject,
            ticketNumber: ticket.ticket_number ?? ticket.id.slice(0, 8),
            fromName: process.env.ZOHO_FROM_NAME || "Udyam Support",
          },
          { applicationId: ticket.application_id ?? undefined, trigger: "manual" },
        );
      } catch (e) {
        console.error("[tickets] E009 enqueue failed", e);
      }
    }

    return { ok: true };
  });

// ─────────────────────────── getTicketOrderContext ───────────────────────────

export const getTicketOrderContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("applications")
      .select(
        "id, application_code, order_status, fulfillment_status, service_id, customer_id, services(service_name), customers(name, primary_email, primary_mobile)"
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!row) return null;
    const r = row as any;
    return {
      id: r.id,
      application_code: r.application_code as string | null,
      order_status: r.order_status as string | null,
      fulfillment_status: r.fulfillment_status as string | null,
      service_name: r.services?.service_name ?? null,
      customer_name: r.customers?.name ?? null,
      customer_email: r.customers?.primary_email ?? null,
      customer_mobile: r.customers?.primary_mobile ?? null,
    };
  });

// ─────────────────────────── resolveTicketAndResumeOrder ───────────────────────────

const ResumeInput = z.object({
  ticketId: z.string().uuid(),
  resumeTo: z.enum(["IN_PROCESSING", "SUBMITTED_TO_GOVT"]).default("IN_PROCESSING"),
  note: z.string().max(1000).optional(),
});

export const resolveTicketAndResumeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ResumeInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const ticket = await loadTicket(data.ticketId);
    if (!ticket.application_id) {
      throw new Error("This ticket is not linked to an order.");
    }
    const now = new Date().toISOString();

    // Transition the order back to the requested resume state (SQL enforces map).
    const { error: tErr } = await context.supabase.rpc("transition_order_status", {
      _order_id: ticket.application_id,
      _new_status: data.resumeTo,
      _remarks: `Resumed from ticket ${ticket.ticket_number ?? ticket.id.slice(0, 8)}${data.note ? " — " + data.note : ""}`,
    });
    if (tErr) throw new Error(tErr.message);

    // Mark ticket resolved.
    await admin
      .from("support_tickets")
      .update({
        status: "resolved",
        resolved_at: now,
        resolved_by: context.userId,
        closed_at: now,
        updated_at: now,
      } as never)
      .eq("id", ticket.id);

    // Cancel any autoclose scheduler.
    try {
      const { cancelTicketAutocloseByTicket } = await import("@/lib/scheduling/schedulers.server");
      await cancelTicketAutocloseByTicket(ticket.id, "resolved_and_resumed");
    } catch { /* non-fatal */ }

    // Audit event on the order.
    await admin.from("application_events").insert({
      application_id: ticket.application_id,
      customer_id: ticket.customer_id,
      event_type: "order_resumed_from_ticket",
      new_value: data.resumeTo,
      note: `Ticket ${ticket.ticket_number ?? ""} resolved · resumed → ${data.resumeTo}`,
      created_by: context.userId,
    } as never);

    // Workflow engine: cooperating close → resume paused timers/automations.
    try {
      const { dispatchEvent } = await import("@/lib/workflow/engine.server");
      await dispatchEvent(
        {
          type: "TicketClosed",
          applicationId: ticket.application_id,
          ticketId: ticket.id,
          outcome: "cooperating",
          actorId: context.userId,
        },
        context.userId,
      );
    } catch (e) { console.error("[workflow] TicketClosed dispatch failed", e); }

    return { ok: true, resumeTo: data.resumeTo };
  });

// ─────────────────────────── Support Ticket flowchart buttons ───────────────────────────
// 4 canonical support actions. Only Consultation sends T001. T002 sends the
// reason-reply template and arms the 8-business-hour auto-close.

async function resumePausedCustomerDelayForTicket(ticket: TicketRow) {
  if (!ticket.application_id) return;
  const admin = await getAdmin();
  try {
    const { data: rows } = await admin
      .from("order_schedulers")
      .select("id")
      .eq("application_id", ticket.application_id)
      .eq("status", "paused")
      .eq("paused_by_ticket_id", ticket.id)
      .in("scheduler_type", ["customer_closure_24h", "customer_side_delay"]);
    if (!rows?.length) return;
    const { resumeScheduler } = await import("@/lib/scheduling/schedulers.server");
    for (const row of rows as Array<{ id: string }>) await resumeScheduler(row.id);
  } catch (e) {
    console.error("[tickets] customer-delay resume failed", e);
  }
}

async function dispatchTicketClosedCooperating(ticket: TicketRow, actorId: string) {
  if (!ticket.application_id) return;
  try {
    const { dispatchEvent } = await import("@/lib/workflow/engine.server");
    await dispatchEvent({
      type: "TicketClosed",
      applicationId: ticket.application_id,
      ticketId: ticket.id,
      outcome: "cooperating",
      actorId,
    }, actorId);
  } catch (e) { console.error("[workflow] TicketClosed(cooperating) dispatch failed", e); }
  await resumePausedCustomerDelayForTicket(ticket);
}

async function markTicketClosed(ticketId: string, actorId: string, noteText: string, reason: string) {
  const admin = await getAdmin();
  const now = new Date().toISOString();
  await admin
    .from("support_tickets")
    .update({
      status: "closed",
      resolved_at: now,
      resolved_by: actorId,
      closed_at: now,
      updated_at: now,
      last_staff_message_at: now,
    } as never)
    .eq("id", ticketId);
  await admin.from("ticket_replies").insert({
    ticket_id: ticketId,
    reply_text: noteText,
    is_internal: true,
    created_by: actorId,
    direction: "note",
  } as never);
  try {
    const { cancelTicketAutocloseByTicket } = await import("@/lib/scheduling/schedulers.server");
    await cancelTicketAutocloseByTicket(ticketId, reason);
  } catch { /* non-fatal */ }
}

// T001 — Normal Close / No Action Required
export const closeTicketNormalT001 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ticket = await loadTicket(data.ticketId);
    await markTicketClosed(ticket.id, context.userId, "Closed: Normal / no action required.", "closed_normal_no_action");
    await dispatchTicketClosedCooperating(ticket, context.userId);
    return { ok: true };
  });

// Restart Order — the database atomically cancels the customer-delay timer,
// returns the linked order to Form Submitted, and closes the ticket.
export const closeTicketRestartT001 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    ticketId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ticket = await loadTicket(data.ticketId);
    if (!ticket.application_id) throw new Error("This ticket is not linked to an order.");
    const now = new Date().toISOString();

    try {
      await context.supabase.rpc("restart_order_from_ticket", {
        _ticket_id: ticket.id,
      });
    } catch (rpcErr) {
      console.warn("[closeTicketRestartT001] restart_order_from_ticket RPC notice:", rpcErr);
    }

    // Reset all workflow & closure fields so computeOrderStage & deriveJourneyLiveState recognise the order as active
    const { error: upErr } = await supabaseAdmin
      .from("applications")
      .update({
        order_status: "REOPENED",
        fulfillment_status: "form_submitted",
        workflow_status: "processing_resumed",
        closure_stage: "none",
        application_status: "form_submitted",
        closure_reason_id: null,
        closure_reason_code: null,
        closure_reason_text: null,
        closure_remarks: null,
        closure_next_at: null,
        cancellation_requested_at: null,
        customer_hold_started_at: null,
        technical_hold_started_at: null,
        technical_hold_kind: null,
        active_reason_id: null,
        active_reason_text: null,
        workflow_delay_reason: null,
        workflow_expected_review_at: null,
        reopened_at: now,
        reopened_by: context.userId,
        updated_at: now,
      } as never)
      .eq("id", ticket.application_id);

    if (upErr) throw new Error(`Failed to update application status: ${upErr.message}`);

    // Update ticket to closed
    await supabaseAdmin
      .from("support_tickets")
      .update({
        status: "closed",
        resolved_at: now,
        resolved_by: context.userId,
        closed_at: now,
        updated_at: now,
        last_staff_message_at: now,
      } as never)
      .eq("id", ticket.id);

    try {
      await supabaseAdmin.from("ticket_replies").insert({
        ticket_id: ticket.id,
        reply_text: "Closed: Restarted & reopened order to active workflow.",
        is_internal: true,
        created_by: context.userId,
        direction: "note",
      } as never);
    } catch (replyErr) {
      console.warn("[closeTicketRestartT001] ticket reply log warning:", replyErr);
    }

    // Log to application_events & activity_logs so the timeline reflects the reopening
    try {
      const { data: staffProf } = await supabaseAdmin
        .from("profiles")
        .select("display_name, email")
        .eq("id", context.userId)
        .maybeSingle();
      const staffName = (staffProf as any)?.display_name || (staffProf as any)?.email || "Staff";

      // Stop any prior open schedulers
      await supabaseAdmin
        .from("order_schedulers")
        .update({
          status: "stopped",
          stopped_at: now,
          stop_reason: "order_reopened_from_ticket",
          stop_triggered_by: context.userId,
          updated_at: now,
        })
        .eq("application_id", ticket.application_id)
        .in("status", ["active", "paused"]);

      // Insert immediate active hot scheduler
      await supabaseAdmin.from("order_schedulers").insert({
        application_id: ticket.application_id,
        scheduler_type: "our_side_reminder",
        status: "active",
        started_at: now,
        fires_at: now,
        remarks: JSON.stringify({
          reason: "order_reopened",
          reasonLabel: `Order Reopened from Ticket #${ticket.ticket_number ?? ""} - Urgent Action Required`,
          note: `Order reopened from ticket ${ticket.ticket_number ?? ""}`,
          durationMinutes: 0,
          channel: (ticket as any)?.channel === "call" ? "call" : "email",
          created_by_name: staffName,
          created_at: now,
        }),
        created_by: context.userId,
      });

      await supabaseAdmin.from("application_events").insert({
        application_id: ticket.application_id,
        event_type: "status_change",
        old_value: "closed",
        new_value: "order_reopened",
        note: `Order reopened from support ticket ${ticket.ticket_number ?? ""}`,
        staff_name: staffName,
        staff_role: "staff",
      } as never);

      if ((ticket as any).lead_id) {
        await supabaseAdmin.from("activity_logs").insert({
          lead_id: (ticket as any).lead_id,
          user_id: context.userId,
          activity_type: "order_reopened",
          activity_description: `Order reopened from ticket ${ticket.ticket_number ?? ""}`,
        } as never);
      }

      // If order was assigned to an inactive/exited employee, unassigned, or in pool with toggle OFF, assign to active operations staff
      const { ensureActiveAssigneeForReopenedOrder } = await import("@/lib/crm/assignment-engine.server");
      await ensureActiveAssigneeForReopenedOrder({
        orderId: ticket.application_id,
        actorId: context.userId,
        origin: "ticket_restart",
        ticketNumber: ticket.ticket_number ?? null,
      });
    } catch (evtErr) {
      console.warn("[restartOrderFromTicket] timeline/scheduler log warning:", evtErr);
    }

    return { ok: true, applicationId: ticket.application_id, ticketId: ticket.id };
  });

// T001 — Consultation / Support Completed
export const closeTicketConsultationT001 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ticket = await loadTicket(data.ticketId);
    await sendTicketTemplateEmail({
      ticket, code: BHS_EMAILS.T001_TICKET_COMPLETED, actorId: context.userId,
      extraVars: {
        ticket_close_variant: "consultation_done",
        employee_reply: "Your consultation / support request has been completed. Please reach out if you need anything further.",
        employeeReply: "Your consultation / support request has been completed. Please reach out if you need anything further.",
        replyMessage: "Your consultation / support request has been completed. Please reach out if you need anything further.",
      },
    });
    await markTicketClosed(ticket.id, context.userId, "T001 sent — Consultation / support completed.", "closed_t001_consultation");
    await dispatchTicketClosedCooperating(ticket, context.userId);
    return { ok: true };
  });

// T002 — Reply w/ reason (arms 8h auto-close → T003)
export const closeTicketReplyReasonT002 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    ticketId: z.string().uuid(),
    reasonId: z.string().uuid().nullable().optional(),
    reasonLabel: z.string().max(200).optional(),
    replyBody: z.string().min(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const ticket = await loadTicket(data.ticketId);
    const now = new Date().toISOString();

    const { data: replyRow, error: replyErr } = await admin.from("ticket_replies").insert({
      ticket_id: ticket.id,
      reply_text: data.replyBody,
      is_internal: false,
      created_by: context.userId,
      direction: "outbound",
    } as never).select("id").single();
    if (replyErr) throw new Error(replyErr.message);

    await sendTicketTemplateEmail({
      ticket, code: BHS_EMAILS.T002_TICKET_REPLY, actorId: context.userId,
      replyId: (replyRow as { id: string }).id,
      extraVars: {
        ticket_close_variant: "reply_with_reason",
        reason: data.reasonLabel ?? "",
        selected_reason: data.reasonLabel ?? "",
        reasonBlock: data.reasonLabel ?? "",
        reason_block: data.reasonLabel ?? "",
        employee_reply: data.replyBody,
        employee_remarks: data.replyBody,
        employeeRemarks: data.replyBody,
        replyMessage: data.replyBody,
        // T002 prints this as "Reply Date & Time" — use the actual reply timestamp.
        followup_date: formatTicketDate(now),
        followupDate: formatTicketDate(now),
      },
    });

    const patch: Record<string, unknown> = {
      status: "waiting_customer",
      updated_at: now,
      last_staff_message_at: now,
    };
    if (!ticket.first_response_at) patch.first_response_at = now;
    await admin.from("support_tickets").update(patch as never).eq("id", ticket.id);

    const { startTicketAutocloseScheduler } = await import("@/lib/scheduling/schedulers.server");
    await startTicketAutocloseScheduler({
      ticketId: ticket.id,
      applicationId: ticket.application_id ?? null,
      totalSeconds: 8 * 60 * 60,
      createdBy: context.userId,
      note: data.reasonLabel ?? null,
    });

    return { ok: true };
  });

// R002 — Refund Rejected / Closed
export const closeTicketRefundR002 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        replyBody: z.string().optional(),
        reasonLabel: z.string().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const ticket = await loadTicket(data.ticketId);
    const now = new Date().toISOString();

    const remarks = data.reasonLabel?.trim() || data.replyBody?.trim() || "Refund request reviewed & closed";
    const replyText =
      data.replyBody?.trim() ||
      "Dear Customer,\n\nWe have reviewed your refund request and regret to inform you that your refund request cannot be approved at this stage as per our service and refund policy.\n\nRegards,\nSupport Team";

    const { data: replyRow, error: replyErr } = await admin.from("ticket_replies").insert({
      ticket_id: ticket.id,
      reply_text: `R002 Refund Rejected: ${remarks}`,
      is_internal: false,
      created_by: context.userId,
      direction: "refund_rejected",
    } as never).select("id").single();
    if (replyErr) throw new Error(replyErr.message);

    // Send the official R002 Refund Rejected template email to customer
    await sendTicketTemplateEmail({
      ticket,
      code: "R002",
      actorId: context.userId,
      replyId: (replyRow as { id: string }).id,
      extraVars: {
        ticket_close_variant: "refund_rejected",
        employee_remarks: remarks,
        additional_remarks: remarks,
        remarks,
        reason: remarks,
        selected_reason: remarks,
        replyMessage: replyText,
      },
    });

    const patch: Record<string, unknown> = {
      status: "closed",
      resolved_at: now,
      resolved_by: context.userId,
      closed_at: now,
      updated_at: now,
      last_staff_message_at: now,
    };
    if (!ticket.first_response_at) patch.first_response_at = now;
    await admin.from("support_tickets").update(patch as never).eq("id", ticket.id);

    try {
      const { cancelTicketAutocloseByTicket } = await import("@/lib/scheduling/schedulers.server");
      await cancelTicketAutocloseByTicket(ticket.id, "closed_refund_r002");
    } catch {
      /* non-fatal */
    }

    if (ticket.application_id) {
      try {
        const { dispatchEvent } = await import("@/lib/workflow/engine.server");
        await dispatchEvent(
          {
            type: "TicketClosed",
            applicationId: ticket.application_id,
            ticketId: ticket.id,
            outcome: "not_cooperating",
            actorId: context.userId,
          },
          context.userId,
        );
      } catch (e) {
        console.error("[workflow] TicketClosed dispatch failed", e);
      }
    }

    return { ok: true };
  });

export const getTicketAttachmentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(120),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const ext = (data.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
    const safeName = data.fileName.replace(/[^a-z0-9._-]/gi, "_").slice(0, 50);
    const path = `tickets/${data.ticketId}/${Date.now()}_${safeName}`;
    const { data: signed, error } = await admin.storage.from("documents").createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Could not create attachment upload URL.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const confirmTicketAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        applicationId: z.string().uuid().nullable().optional(),
        filePath: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().min(1),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(data.filePath, 31536000);
    const signedUrl = signed?.signedUrl ?? null;

    if (data.applicationId) {
      try {
        await admin.from("documents").insert({
          application_id: data.applicationId,
          doc_type: "support_attachment",
          file_name: data.fileName,
          file_path: data.filePath,
          mime_type: data.mimeType,
          size_bytes: data.sizeBytes,
          status: "verified",
          uploaded_at: new Date().toISOString(),
          uploaded_by: context.userId,
          remarks: `Uploaded via ticket reply (Ticket ID: ${data.ticketId})`,
        } as any);
      } catch {
        /* ignore duplicate/constraint errors */
      }
    }
    return { filePath: data.filePath, fileName: data.fileName, url: signedUrl };
  });

// ─────────────────────── Make Order Hot Priority from Ticket ───────────────────────

export const makeOrderHotFromTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketId: z.string().uuid().optional(),
        orderId: z.string().uuid().optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    let targetOrderId = data.orderId;
    let ticketNumber = "";
    const now = new Date().toISOString();

    if (data.ticketId) {
      const ticket = await loadTicket(data.ticketId);
      if (!targetOrderId && ticket.application_id) {
        targetOrderId = ticket.application_id;
      }
      if (!targetOrderId && ticket.customer_id) {
        // Fallback: look up latest open/active application for this customer
        const { data: latestApp } = await admin
          .from("applications")
          .select("id, application_code")
          .eq("customer_id", ticket.customer_id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestApp?.id) {
          targetOrderId = latestApp.id;
          // Also link to ticket for future lookups
          await admin
            .from("support_tickets")
            .update({ application_id: targetOrderId, updated_at: now })
            .eq("id", data.ticketId);
        }
      }
      ticketNumber = ticket.ticket_number ?? "";
    }

    if (!targetOrderId) {
      throw new Error("No linked order found for this ticket.");
    }

    const { data: preApp } = await admin
      .from("applications")
      .select("id, lead_id, customer_id, application_code, order_status, fulfillment_status, workflow_status, application_status, form_submitted_at, assigned_to")
      .eq("id", targetOrderId)
      .maybeSingle();

    if (!preApp) {
      throw new Error("Linked order not found.");
    }

    const previousStage = preApp.fulfillment_status || preApp.workflow_status || preApp.order_status || "closed";
    const previousStatus = preApp.order_status || "CLOSED";

    const { data: staffProf } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const staffName = (staffProf as any)?.display_name || (staffProf as any)?.email || "Staff";

    // 1. Reopen the order into active working state (reopens no matter if order was completed or closed)
    const { error: upErr } = await admin
      .from("applications")
      .update({
        order_status: "REOPENED",
        fulfillment_status: "form_submitted",
        workflow_status: "processing_resumed",
        closure_stage: "none",
        application_status: "form_submitted",
        closure_reason_id: null,
        closure_reason_code: null,
        closure_reason_text: null,
        closure_remarks: null,
        closure_next_at: null,
        cancellation_requested_at: null,
        customer_hold_started_at: null,
        technical_hold_started_at: null,
        technical_hold_kind: null,
        active_reason_id: null,
        active_reason_text: null,
        workflow_delay_reason: null,
        workflow_expected_review_at: null,
        reopened_at: now,
        reopened_by: context.userId,
        updated_at: now,
      } as never)
      .eq("id", targetOrderId);

    if (upErr) {
      console.error("[makeOrderHotFromTicket] update error:", upErr);
      throw new Error(`Failed to reopen order status: ${upErr.message}`);
    }

    // 2. Stop any prior open schedulers to satisfy one_open_scheduler_per_order
    await admin
      .from("order_schedulers")
      .update({
        status: "stopped",
        stopped_at: now,
        stop_reason: "ticket_hot_priority_override",
        stop_triggered_by: context.userId,
        updated_at: now,
      })
      .eq("application_id", targetOrderId)
      .in("status", ["active", "paused"]);

    // 3. Insert immediate active hot scheduler (fires_at = now)
    const reasonLabel = ticketNumber
      ? `Hot Priority from Ticket #${ticketNumber}`
      : "Escalated to Hot Priority";

    const { data: created, error } = await admin
      .from("order_schedulers")
      .insert({
        application_id: targetOrderId,
        ticket_id: data.ticketId || null,
        scheduler_type: "our_side_reminder",
        status: "active",
        started_at: now,
        fires_at: now,
        remarks: JSON.stringify({
          reason: "ticket_hot_priority",
          reasonLabel,
          note: data.note || (ticketNumber ? `Order marked Hot Priority from support ticket #${ticketNumber}` : "Escalated to hot priority"),
          durationMinutes: 0,
          channel: "email",
          origin: "support_ticket",
          ticketId: data.ticketId || null,
          ticketNumber: ticketNumber || null,
          created_by_name: staffName,
          created_at: now,
        }),
        created_by: context.userId,
      })
      .select("id, application_id, status, fires_at, remarks, created_at")
      .single();

    if (error) {
      console.error("[makeOrderHotFromTicket] insert error:", error);
      throw new Error(`Failed to set hot priority: ${error.message}`);
    }

    // 4. Auto-reassign to active operations employee if assignee is inactive, unassigned, or in pool with toggle OFF
    try {
      const { ensureActiveAssigneeForReopenedOrder } = await import("@/lib/crm/assignment-engine.server");
      await ensureActiveAssigneeForReopenedOrder({
        orderId: targetOrderId,
        actorId: context.userId,
        origin: "ticket_hot",
        ticketNumber: ticketNumber || null,
        currentAssigneeId: preApp.assigned_to,
      });
    } catch (assignErr) {
      console.warn("[makeOrderHotFromTicket] auto-reassign warning:", assignErr);
    }

    // 5. Update lead status if lead was previously closed
    if (preApp.lead_id) {
      try {
        const [{ data: lead }, { data: paidPayment }] = await Promise.all([
          admin
            .from("leads")
            .select("id, lead_status_v2, status")
            .eq("id", preApp.lead_id)
            .maybeSingle(),
          admin
            .from("payments")
            .select("id")
            .eq("lead_id", preApp.lead_id)
            .eq("status", "paid")
            .limit(1)
            .maybeSingle(),
        ]);

        if (lead) {
          const isClosedLead = ["closed", "closed_refunded", "uninterested"].includes(String(lead.lead_status_v2 ?? "")) ||
                               ["closed", "uninterested"].includes(String(lead.status ?? ""));
          if (isClosedLead) {
            const nextLeadStatus = paidPayment ? "payment_successful" : "contacted";
            await admin
              .from("leads")
              .update({
                lead_status_v2: nextLeadStatus,
                status: nextLeadStatus,
                updated_at: now,
              } as never)
              .eq("id", lead.id);
          }
        }
      } catch (leadErr) {
        console.warn("[makeOrderHotFromTicket] lead status update warning:", leadErr);
      }
    }

    // 6. Log event in workflow_events, application_events, and activity_logs
    try {
      const noteSuffix = data.note ? `\nRemarks for Assignee: "${data.note}"` : "";
      await admin.from("workflow_events").insert({
        application_id: targetOrderId,
        lead_id: preApp.lead_id ?? null,
        event_type: "order_reopened",
        title: "Order Reopened & Escalated to Hot Priority",
        description: `Order reopened and marked Hot Priority from Ticket #${ticketNumber || ""}.${noteSuffix}`,
        customer_visible: false,
        actor_id: context.userId,
        actor_name: staffName,
        is_system: false,
        metadata: {
          event: "ORDER_REOPENED_HOT",
          previousStage,
          previousStatus,
          newStage: "Order Reopened",
          reopenedBy: context.userId,
          reopenedAt: now,
          ticketNumber: ticketNumber || null,
          note: data.note || null,
        },
      } as never);

      await admin.from("application_events").insert({
        application_id: targetOrderId,
        lead_id: preApp.lead_id ?? null,
        customer_id: preApp.customer_id ?? null,
        event_type: "hot_priority_escalated",
        old_value: String(previousStatus),
        new_value: "REOPENED",
        note: data.note
          ? `[Hot Priority Escalation from Ticket #${ticketNumber || ""}] Note for Assignee: ${data.note}`
          : `Order reopened and escalated to Hot Priority from Ticket #${ticketNumber || ""}`,
        created_by: context.userId,
        staff_name: staffName,
        staff_role: "staff",
      } as never);

      if (data.ticketId) {
        await admin.from("activity_logs").insert({
          user_id: context.userId,
          activity_type: "ticket_order_hot_escalated",
          activity_description: `Linked order was reopened and marked on HOT PRIORITY by ${staffName}${data.note ? ` (Note: ${data.note})` : ""}`,
        } as never);

        // 8. Close the ticket and log internal note
        const noteText = data.note
          ? `Closed: Reopened order & prioritized as Hot Order. Note: ${data.note}`
          : "Closed: Reopened order & prioritized as Hot Order";

        await admin.from("ticket_replies").insert({
          ticket_id: data.ticketId,
          reply_text: noteText,
          is_internal: true,
          created_by: context.userId,
          direction: "reopened_order",
        } as never);

        const patch: Record<string, unknown> = {
          status: "closed",
          resolved_at: now,
          resolved_by: context.userId,
          closed_at: now,
          updated_at: now,
          last_staff_message_at: now,
        };
        await admin.from("support_tickets").update(patch as never).eq("id", data.ticketId);

        try {
          const { cancelTicketAutocloseByTicket } = await import("@/lib/scheduling/schedulers.server");
          await cancelTicketAutocloseByTicket(data.ticketId, "closed_reopened_hot");
        } catch {
          /* non-fatal */
        }
      }

      // 7. Send notification to assigned employee
      const assignedTarget = preApp.assigned_to;
      if (assignedTarget && assignedTarget !== context.userId) {
        const { createNotification } = await import("@/lib/crm/notifications.functions");
        await createNotification({
          user_id: assignedTarget,
          kind: "hot_order_alert",
          title: `🔥 Hot Order Escalation: ${preApp.application_code || "Order"}`,
          body: data.note
            ? `Note from ${staffName}: "${data.note}"`
            : `Order was marked as Hot Priority from Support Ticket #${ticketNumber || ""}`,
          href: `/admin/orders/${targetOrderId}`,
          entity_kind: "application",
          entity_id: targetOrderId,
        }).catch((notifErr) => console.warn("[makeOrderHotFromTicket] notif warning:", notifErr));
      }
    } catch (e) {
      console.warn("[makeOrderHotFromTicket] audit logging warning:", e);
    }

    return { ok: true, scheduler: created };
  });




