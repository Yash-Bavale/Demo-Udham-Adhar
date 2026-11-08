/**
 * getTicketWorkspace — one-shot loader for the full-page ticket workspace.
 * Returns everything the 3-column detail page needs so first paint is instant.
 *
 * ARCHITECTURE RULE (post-audit repair):
 * This function is READ-ONLY regarding ticket order relationships.
 * It does NOT silently mutate support_tickets.application_id / customer_id / order_link_status.
 * Order resolution authority lives in inbox-matcher.server.ts (ingestion time).
 * When a ticket has order_link_status = "needs_review", this function returns
 * candidateOrders so the UI can surface an explicit employee linking action.
 * Use linkTicketToApplication() for the explicit employee-driven linking.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * On-demand sync helper to fetch missing inbound attachments & inline screenshots from Zoho Mail.
 * Automatically runs if a ticket has inbound emails with zero saved attachments, or can be called explicitly.
 */
export async function syncTicketInboundAttachments(ticketId: string): Promise<any[]> {
  try {
    const admin = await getAdmin();
    const { data: ticket } = await admin
      .from("support_tickets")
      .select("id, ticket_number, application_id, customer_id, ticket_email")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) return [];

    const { data: existingAtts } = await (admin.from("ticket_reply_attachments" as any) as any)
      .select("id, ticket_reply_id, zoho_attachment_id, storage_path")
      .eq("ticket_id", ticketId);

    const existingAttIds = new Set((existingAtts ?? []).map((a: any) => a.zoho_attachment_id).filter(Boolean));

    const { data: replies } = await admin
      .from("ticket_replies")
      .select("id, direction, email_message_id, created_at")
      .eq("ticket_id", ticketId)
      .in("direction", ["inbound", "incoming"]);

    let emailLogsQuery = admin
      .from("email_logs")
      .select("id, zoho_mail_uid, message_id, direction, body_html")
      .in("direction", ["incoming", "inbound"])
      .not("zoho_mail_uid", "is", null);

    if (ticket.application_id) {
      emailLogsQuery = emailLogsQuery.eq("application_id", ticket.application_id);
    } else if (ticket.customer_id) {
      emailLogsQuery = emailLogsQuery.eq("customer_id", ticket.customer_id);
    } else {
      // Never scan every inbound email in the system for an unlinked ticket.
      return [];
    }

    const { data: matchedEmailLogs } = await emailLogsQuery;
    const emailLogsWithUid = (matchedEmailLogs ?? []).filter((e: any) => Boolean(e.zoho_mail_uid));

    if (emailLogsWithUid.length === 0) return [];

    let folders: Array<{ folderId: string; folderName: string; isRelevantInbound?: boolean }> = [];
    try {
      const { discoverZohoFolders } = await import("@/lib/mail/zoho-inbox.server");
      const all = (await discoverZohoFolders()) as any[];
      const relevant = all.filter((f) => f.isRelevantInbound);
      folders = relevant.length > 0 ? relevant : all;
    } catch (e) {
      console.warn("[syncTicketInboundAttachments] discoverZohoFolders warning:", e);
      return [];
    }

    const { fetchMessageAttachmentsList, downloadZohoAttachment } = await import("@/lib/mail/zoho-inbox.server");
    const newAttachments: any[] = [];

    for (const em of emailLogsWithUid) {
      const zohoUid = em.zoho_mail_uid;
      const matchingReply = (replies ?? []).find(
        (r: any) => r.email_message_id && (r.email_message_id === em.message_id)
      );
      const replyId = matchingReply?.id || null;

      for (const folder of folders) {
        try {
          const list = await fetchMessageAttachmentsList(zohoUid, folder.folderId);
          if (!list || list.length === 0) continue;

          for (const meta of list) {
            const idKey = meta.cid || meta.attachmentId;
            if (existingAttIds.has(idKey)) continue;

            const downloaded = await downloadZohoAttachment(
              zohoUid,
              folder.folderId,
              meta.attachmentId,
              meta.attachmentName,
              meta.isInline,
              meta.cid,
            );

            if (!downloaded || !downloaded.buffer) continue;

            const safeFilename = meta.attachmentName.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `support-tickets/${ticketId}/${replyId || "inbound"}/${Date.now()}_${safeFilename}`;
            const bucket = "documents";

            const { error: upErr } = await admin.storage
              .from(bucket)
              .upload(storagePath, downloaded.buffer, {
                contentType: downloaded.contentType || meta.contentType || "application/octet-stream",
                upsert: true,
              });

            if (upErr) {
              console.warn("[syncTicketInboundAttachments] Upload error:", upErr.message);
              continue;
            }

            const { data: inserted, error: insErr } = await (admin.from("ticket_reply_attachments" as any) as any)
              .insert({
                ticket_id: ticketId,
                ticket_reply_id: replyId,
                file_name: meta.attachmentName,
                file_size: Number(meta.attachmentSize || downloaded.buffer.length),
                mime_type: downloaded.contentType || meta.contentType || "application/octet-stream",
                storage_bucket: bucket,
                storage_path: storagePath,
                zoho_attachment_id: idKey,
              })
              .select()
              .single();

            if (!insErr && inserted) {
              existingAttIds.add(idKey);
              newAttachments.push(inserted);
            }
          }
          break;
        } catch {
          // Continue to next folder
        }
      }
    }

    return newAttachments;
  } catch (err) {
    console.warn("[syncTicketInboundAttachments] error:", err);
    return [];
  }
}

export const syncTicketAttachmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    return await syncTicketInboundAttachments(data.ticketId);
  });

export const getTicketWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();

    // 1. Fetch primary ticket record — includes order_link_status and is_unlinked
    const { data: ticket, error: ticketErr } = await admin
      .from("support_tickets")
      .select(
        "id, ticket_number, subject, description, status, priority, assigned_to, resolved_at, resolved_by, closed_at, first_response_at, last_customer_message_at, last_staff_message_at, ticket_email, source, created_at, updated_at, customer_id, application_id, service_id, parent_ticket_id, order_link_status, is_unlinked, alternate_sender_email"
      )
      .eq("id", data.ticketId)
      .maybeSingle();

    if (ticketErr) {
      console.error("[getTicketWorkspace] fetch ticket error:", ticketErr);
      throw new Error(ticketErr.message);
    }
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const t = ticket as any;
    // READ the persisted relationships. Do NOT resolve or mutate them here.
    const customerId = t.customer_id as string | null;
    const applicationId = t.application_id as string | null;
    const orderLinkStatus = (t.order_link_status as string | null) ?? (applicationId ? "linked" : "unlinked");

    // 2. Fetch linked application and associated lead (READ-ONLY)
    let applicationData: any = null;
    let leadData: any = null;
    if (applicationId) {
      try {
        const { data: app } = await admin
          .from("applications")
          .select(
            "id, application_code, order_status, fulfillment_status, assigned_to, created_at, updated_at, fulfilled_at, reopened_at, refund_requested_at, service_id, lead_id, customer_id, is_hot, form_submitted_at, certificate_uploaded_at, application_status, workflow_status, refund_approved_at, refund_processed_at, closure_stage, technical_hold_started_at, customer_hold_started_at"
          )
          .eq("id", applicationId)
          .maybeSingle();

        if (app?.lead_id) {
          const { data: lead } = await admin
            .from("leads")
            .select(
              "id, name, email, mobile, service, total_amount, lead_code, lead_status_v2, status, payment_successful_at, lead_source, source"
            )
            .eq("id", app.lead_id)
            .maybeSingle();
          leadData = lead;
        }

        if (app) {
          applicationData = app;
        }
      } catch (e) {
        console.warn("[getTicketWorkspace] application fetch warning:", e);
      }
    }

    // 3. Fetch customer details (READ-ONLY)
    let customerData: any = null;
    const effectiveCustomerId = customerId || applicationData?.customer_id || null;
    if (effectiveCustomerId) {
      try {
        const { data: cust } = await admin
          .from("customers")
          .select("id, name, primary_email, primary_mobile, state, language, created_at, lifetime_value, total_applications, completed_applications")
          .eq("id", effectiveCustomerId)
          .maybeSingle();
        customerData = cust;
      } catch (e) {
        console.warn("[getTicketWorkspace] customer fetch warning:", e);
      }
    }

    // 4. Customer/applicant name — DISPLAY ONLY, no DB write.
    // When the application is linked, use leads.name as the authoritative applicant name
    // for display purposes. Do NOT overwrite customers.name from a read path.
    let displayCustomerName: string | null = customerData?.name ?? null;
    if (leadData?.name) {
      const isPlaceholder =
        !displayCustomerName ||
        /^(tesr|test|customer|demo|null|undefined|n\/a|—|-|new customer)$/i.test(
          displayCustomerName.trim()
        );
      if (isPlaceholder) {
        displayCustomerName = leadData.name;
      }
    }
    // Produce a display-only customer object. The DB is never touched.
    const displayCustomer = customerData
      ? { ...customerData, name: displayCustomerName }
      : (effectiveCustomerId
          ? {
              id: effectiveCustomerId,
              name: leadData?.name ?? null,
              primary_email: leadData?.email ?? t.ticket_email ?? null,
              primary_mobile: leadData?.mobile ?? null,
              state: null,
              language: null,
              created_at: null,
              lifetime_value: leadData?.total_amount ?? null,
              total_applications: null,
              completed_applications: null,
            }
          : null);

    // 5. Fetch service details (READ-ONLY)
    const effectiveServiceId = t.service_id || applicationData?.service_id || null;
    let serviceData: any = null;
    if (effectiveServiceId) {
      try {
        const { data: svc } = await admin
          .from("services")
          .select("id, service_name")
          .eq("id", effectiveServiceId)
          .maybeSingle();
        serviceData = svc;
      } catch (e) {
        console.warn("[getTicketWorkspace] service fetch warning:", e);
      }
    }

    // 6. When order_link_status = "needs_review" AND application_id is null,
    // return candidate active applications for this customer so the UI can
    // present an explicit "Link Order" action. Scoped to the customer only.
    let candidateOrders: Array<{
      id: string;
      application_code: string | null;
      order_status: string | null;
      fulfillment_status: string | null;
      created_at: string | null;
      service_id: string | null;
    }> = [];

    if (orderLinkStatus === "needs_review" && effectiveCustomerId && !applicationId) {
      try {
        const { data: candidates } = await admin
          .from("applications")
          .select("id, application_code, order_status, fulfillment_status, created_at, service_id, lead_id, form_submitted_at, certificate_uploaded_at, application_status, workflow_status, refund_approved_at, refund_processed_at, closure_stage, technical_hold_started_at, customer_hold_started_at")
          .eq("customer_id", effectiveCustomerId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(20);

        const rawCandidates = (candidates ?? []) as any[];
        if (rawCandidates.length > 0) {
          const appIds = rawCandidates.map((c) => c.id);
          const leadIds = rawCandidates.map((c) => c.lead_id).filter(Boolean);
          const orList: string[] = [];
          if (appIds.length) orList.push(`application_id.in.(${appIds.join(",")})`);
          if (leadIds.length) orList.push(`lead_id.in.(${leadIds.join(",")})`);

          const paidAppIds = new Set<string>();
          const paidLeadIds = new Set<string>();

          if (orList.length) {
            const { data: pays } = await admin
              .from("payments")
              .select("application_id, lead_id, status")
              .or(orList.join(","))
              .eq("status", "paid");

            for (const p of (pays ?? []) as Array<{ application_id: string | null; lead_id: string | null; status: string }>) {
              if (p.application_id) paidAppIds.add(p.application_id);
              if (p.lead_id) paidLeadIds.add(p.lead_id);
            }
          }

          const leadMap = new Map<string, any>();
          if (leadIds.length) {
            const { data: leads } = await admin
              .from("leads")
              .select("id, lead_status_v2, status, payment_successful_at, lead_source, source, service, total_amount, lead_code")
              .in("id", leadIds);

            for (const l of (leads ?? []) as Array<any>) {
              leadMap.set(l.id, l);
              if (
                l.lead_status_v2 === "payment_successful" ||
                l.lead_status_v2 === "welcome_mail_sent" ||
                l.status === "payment_successful"
              ) {
                paidLeadIds.add(l.id);
              }
            }
          }

          candidateOrders = rawCandidates
            .filter((c) => paidAppIds.has(c.id) || (c.lead_id && paidLeadIds.has(c.lead_id)))
            .map((c) => ({
              ...c,
              lead: c.lead_id ? leadMap.get(c.lead_id) ?? null : null,
            }));
        }
      } catch (e) {
        console.warn("[getTicketWorkspace] candidateOrders fetch warning:", e);
      }
    }

    // 7. Fire auxiliary queries in parallel with safe error guards
    const [
      repliesList,
      eventsList,
      docsList,
      prevTicketsList,
      prevOrdersList,
      complaintsList,
      refundsList,
      paymentsList,
      invoicesList,
      activeScheduler,
      parentTicket,
      childTickets,
      rawAttachmentsList,
    ] = await Promise.all([
      admin
        .from("ticket_replies")
        .select("id, reply_text, is_internal, created_by, created_at, direction, emailed_at, email_message_id, email_send_log_id")
        .eq("ticket_id", data.ticketId)
        .order("created_at", { ascending: true })
        .then((r) => r.data ?? [], () => []),

      applicationId
        ? admin
            .from("application_events")
            .select("id, event_type, old_value, new_value, note, staff_name, staff_role, created_at, created_by")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false })
            .limit(60)
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      applicationId
        ? admin
            .from("documents")
            .select("id, doc_type, file_name, file_path, mime_type, size_bytes, status, uploaded_at, verified_at, verified_by, remarks")
            .eq("application_id", applicationId)
            .order("uploaded_at", { ascending: false })
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      effectiveCustomerId
        ? admin
            .from("support_tickets")
            .select("id, ticket_number, subject, status, priority, created_at")
            .eq("customer_id", effectiveCustomerId)
            .neq("id", data.ticketId)
            .order("created_at", { ascending: false })
            .limit(20)
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      effectiveCustomerId
        ? admin
            .from("applications")
            .select("id, application_code, order_status, created_at, service_id")
            .eq("customer_id", effectiveCustomerId)
            .order("created_at", { ascending: false })
            .limit(20)
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      effectiveCustomerId
        ? admin
            .from("complaints")
            .select("id, complaint_number, description, status, severity, created_at")
            .eq("customer_id", effectiveCustomerId)
            .order("created_at", { ascending: false })
            .limit(10)
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      applicationId
        ? admin
            .from("refund_requests")
            .select("id, refund_amount, status, created_at, application_id")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false })
            .limit(10)
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      applicationId
        ? admin
            .from("payments")
            .select("id, amount, status, gateway_name, payment_date, created_at")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false })
            .limit(10)
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      applicationId
        ? admin
            .from("invoices")
            .select("id, invoice_number, total_amount, delivery_status, created_at")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false })
            .limit(5)
            .then((r) => r.data ?? [], () => [])
        : Promise.resolve([]),

      applicationId
        ? admin
            .from("order_schedulers")
            .select("id, status, fires_at, remarks")
            .eq("application_id", applicationId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
            .then((r) => r.data, () => null)
        : Promise.resolve(null),

      t.parent_ticket_id
        ? admin
            .from("support_tickets")
            .select("id, ticket_number, subject, status, created_at")
            .eq("id", t.parent_ticket_id)
            .maybeSingle()
            .then((r) => r.data, () => null)
        : Promise.resolve(null),

      admin
        .from("support_tickets")
        .select("id, ticket_number, subject, status, created_at")
        .eq("parent_ticket_id" as any, data.ticketId)
        .order("created_at", { ascending: false })
        .then((r) => r.data ?? [], () => []),

      admin
        .from("ticket_reply_attachments" as any)
        .select("id, ticket_id, ticket_reply_id, file_name, file_size, mime_type, storage_bucket, storage_path, zoho_attachment_id, created_at")
        .eq("ticket_id", data.ticketId)
        .order("created_at", { ascending: true })
        .then((r: any) => r.data ?? [], () => []),
    ]);

    const parentTicketData = parentTicket;
    const childTicketsData = childTickets;

    // 8. Resolve profile names for authors/assignees
    const ids = new Set<string>();
    if (t.assigned_to) ids.add(t.assigned_to);
    if (t.resolved_by) ids.add(t.resolved_by);
    if (applicationData?.assigned_to) ids.add(applicationData.assigned_to);
    repliesList.forEach((r: any) => r.created_by && ids.add(r.created_by));
    eventsList.forEach((r: any) => r.created_by && ids.add(r.created_by));
    docsList.forEach((r: any) => r.verified_by && ids.add(r.verified_by));

    const nameMap = new Map<string, string>();
    if (ids.size) {
      try {
        const { data: profs } = await admin
          .from("profiles")
          .select("id, full_name, display_name, email")
          .in("id", Array.from(ids));
        (profs ?? []).forEach((p: any) =>
          nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff")
        );
      } catch (e) {
        console.warn("[getTicketWorkspace] profiles lookup warning:", e);
      }
    }

    // 9. Hydrate email details for replies linked to email_logs
    const sendLogIds = Array.from(new Set(repliesList.map((r: any) => r.email_send_log_id).filter(Boolean)));
    const messageIds = Array.from(new Set(repliesList.map((r: any) => r.email_message_id).filter(Boolean)));

    const emailById = new Map<string, any>();
    const emailByMsgId = new Map<string, any>();
    let allMatchedEmails: any[] = [];

    const mailOrs: string[] = [];
    if (sendLogIds.length) mailOrs.push(`id.in.(${sendLogIds.join(",")})`);
    if (messageIds.length) mailOrs.push(`message_id.in.(${messageIds.join(",")})`);
    if (applicationId) mailOrs.push(`application_id.eq.${applicationId}`);
    else if (effectiveCustomerId) mailOrs.push(`customer_id.eq.${effectiveCustomerId}`);

    if (mailOrs.length) {
      try {
        const { data: matchedEmails } = await admin
          .from("email_logs")
          .select("id, subject, from_email, to_email, direction, body_html, body_text, created_at, sent_at, status, message_id, template_code, application_id, zoho_mail_uid")
          .or(mailOrs.join(","));

        allMatchedEmails = matchedEmails ?? [];
        allMatchedEmails.forEach((e: any) => {
          if (e.id) emailById.set(e.id, e);
          if (e.message_id) emailByMsgId.set(e.message_id, e);
        });
      } catch (e) {
        console.warn("[getTicketWorkspace] email_logs query warning:", e);
      }
    }

    // 9.5. Hydrate ticket reply attachments & resolve signed URLs.
    // Mailbox attachment sync is no longer run on page open (it scanned every
    // Zoho folder per email on each load); it runs via syncTicketAttachmentsFn.
    const attachmentsList: any[] = (rawAttachmentsList as any[]) ?? [];

    const signedUrlMap = new Map<string, string>();
    await Promise.all(
      attachmentsList.map(async (att: any) => {
        try {
          const { data: signed } = await admin.storage
            .from(att.storage_bucket || "documents")
            .createSignedUrl(att.storage_path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) {
            signedUrlMap.set(att.storage_path, signed.signedUrl);
          }
        } catch (err) {
          void err;
        }
      })
    );

    const attachmentsWithUrls = attachmentsList.map((att: any) => ({
      ...att,
      fileName: att.file_name,
      fileSize: att.file_size,
      mimeType: att.mime_type,
      storagePath: att.storage_path,
      url: signedUrlMap.get(att.storage_path) || null,
      isImage: Boolean(
        att.mime_type?.startsWith("image/") ||
        /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(att.file_name)
      ),
      cid: att.zoho_attachment_id || null,
    }));

    const replyAttachmentsMap = new Map<string, any[]>();
    for (const att of attachmentsWithUrls) {
      if (att.ticket_reply_id) {
        const list = replyAttachmentsMap.get(att.ticket_reply_id) || [];
        list.push(att);
        replyAttachmentsMap.set(att.ticket_reply_id, list);
      }
    }

    const replies = repliesList.map((r: any) => {
      let linkedEmail = (r.email_send_log_id ? emailById.get(r.email_send_log_id) : null) ??
                        (r.email_message_id ? emailByMsgId.get(r.email_message_id) : null) ??
                        null;

      // Fallback matching by direction and timestamp proximity (within 5 minutes)
      if (!linkedEmail && allMatchedEmails.length > 0) {
        const replyTime = new Date(r.created_at).getTime();
        linkedEmail = allMatchedEmails.find((e: any) => {
          const isDirMatch = r.direction === "inbound"
            ? (e.direction === "incoming" || e.direction === "inbound")
            : (e.direction === "outgoing" || e.direction === "outbound");
          if (!isDirMatch) return false;
          const eTime = new Date(e.sent_at || e.created_at).getTime();
          return Math.abs(eTime - replyTime) < 300_000;
        }) ?? null;
      }

      const replyAtts = (r.id && replyAttachmentsMap.get(r.id)) || [];

      let resolvedBodyHtml = linkedEmail?.body_html ?? null;
      if (resolvedBodyHtml && attachmentsWithUrls.length > 0) {
        for (const att of attachmentsWithUrls) {
          if (att.url) {
            if (att.cid) {
              const cidRx = new RegExp(`src=["']cid:${escapeRegex(att.cid)}["']`, "gi");
              resolvedBodyHtml = resolvedBodyHtml.replace(cidRx, `src="${att.url}" data-resolved-cid="true"`);
              const bareCidRx = new RegExp(`cid:${escapeRegex(att.cid)}`, "gi");
              resolvedBodyHtml = resolvedBodyHtml.replace(bareCidRx, att.url);
            }
            if (att.fileName) {
              const fnRx = new RegExp(`src=["']cid:${escapeRegex(att.fileName)}["']`, "gi");
              resolvedBodyHtml = resolvedBodyHtml.replace(fnRx, `src="${att.url}" data-resolved-cid="true"`);
            }
          }
        }
      }

      return {
        ...r,
        author_name: r.created_by
          ? nameMap.get(r.created_by) ?? "Staff"
          : (r.direction === "inbound" ? (displayCustomer?.name ?? "Customer") : "System"),
        subject: linkedEmail?.subject ?? null,
        body_html: resolvedBodyHtml,
        from_email: linkedEmail?.from_email ?? null,
        template_code: linkedEmail?.template_code ?? null,
        email_status: linkedEmail?.status ?? (r.emailed_at ? "sent" : null),
        attachments: replyAtts,
      };
    });

    // 10. Compute customer stats & lifetime value
    let lifetimeValue = Number(customerData?.lifetime_value ?? 0);
    if (!lifetimeValue && effectiveCustomerId) {
      try {
        const { data: pays } = await admin
          .from("payments")
          .select("amount, status")
          .eq("customer_id", effectiveCustomerId)
          .in("status", ["paid"]);
        lifetimeValue = (pays ?? []).reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
      } catch (e) {
        console.warn("[getTicketWorkspace] lifetimeValue calc warning:", e);
      }
    }

    const openTicketsForCustomer = prevTicketsList.filter((r: any) =>
      ["open", "in_progress", "waiting_customer"].includes(r.status)
    ).length;
    const closedTicketsForCustomer = prevTicketsList.length - openTicketsForCustomer;

    // 11. Determine if order is hot dynamically
    const firesAt = activeScheduler?.fires_at ? new Date(activeScheduler.fires_at).getTime() : 0;
    const isDue = firesAt > 0 && firesAt <= Date.now();
    const isReopened =
      applicationData?.fulfillment_status === "order_reopened" ||
      applicationData?.order_status === "REOPENED";
    const isFinalOrder =
      ["completed", "closed", "cancelled"].includes(String(applicationData?.fulfillment_status ?? "").toLowerCase()) ||
      ["COMPLETED", "CLOSED", "CANCELLED"].includes(String(applicationData?.order_status ?? "").toUpperCase()) ||
      (Boolean(applicationData?.closure_stage) && applicationData?.closure_stage !== "none");
    const isHotOrder = Boolean(applicationData) && !isFinalOrder && (isDue || isReopened);

    const appPayload = applicationData
      ? {
          ...applicationData,
          leads: leadData,
          is_hot: isHotOrder,
          services: serviceData ? { service_name: serviceData.service_name } : null,
        }
      : null;

    const { getTicketOrganizationMeta } = await import("@/lib/crm/support-folders.functions");
    const { starredSet, ticketFolderMap } = await getTicketOrganizationMeta(context.userId, [data.ticketId]);
    const fInfo = ticketFolderMap.get(data.ticketId);
    const isStarred = starredSet.has(data.ticketId);

    return {
      ticket: {
        ...t,
        is_starred: isStarred,
        folder_id: fInfo?.folderId ?? null,
        folder_name: fInfo?.folderName ?? null,
        folder_color: fInfo?.color ?? null,
        application_id: applicationId,
        order_link_status: orderLinkStatus,
        applications: appPayload,
        customers: displayCustomer,
        services: serviceData ? { service_name: serviceData.service_name } : null,
        assigned_name: t.assigned_to ? nameMap.get(t.assigned_to) ?? null : null,
        resolved_name: t.resolved_by ? nameMap.get(t.resolved_by) ?? null : null,
        executive_name: applicationData?.assigned_to
          ? nameMap.get(applicationData.assigned_to) ?? null
          : null,
      },
      replies,
      events: eventsList.map((r: any) => ({
        ...r,
        actor_name: r.created_by ? nameMap.get(r.created_by) ?? r.staff_name ?? "System" : r.staff_name ?? "System",
      })),
      documents: docsList.map((r: any) => ({
        ...r,
        verified_name: r.verified_by ? nameMap.get(r.verified_by) ?? null : null,
      })),
      payments: paymentsList,
      invoices: invoicesList,
      previousTickets: prevTicketsList,
      previousOrders: prevOrdersList,
      complaints: complaintsList,
      refunds: refundsList,
      emails: allMatchedEmails,
      parentTicket: parentTicketData,
      childTickets: childTicketsData,
      // candidateOrders: non-empty only when order_link_status = "needs_review"
      // and application_id is null. Contains active applications for the customer.
      candidateOrders,
      ticketReplyAttachments: attachmentsWithUrls,
      customerStats: {
        lifetimeValue,
        totalOrders: Number(customerData?.total_applications ?? prevOrdersList.length),
        completedOrders: Number(customerData?.completed_applications ?? 0),
        openTickets: openTicketsForCustomer + (["open", "in_progress", "waiting_customer"].includes(t.status) ? 1 : 0),
        closedTickets: closedTicketsForCustomer,
      },
    };
  });

// ──────────────────────────────────────────────────────────────────────────────
// linkTicketToApplication
//
// Secure, validated, auditable server action for employees to manually resolve
// a "needs_review" ticket by selecting one of the customer's candidate applications.
//
// Security rules enforced:
//   1. Ticket must exist
//   2. Application must exist
//   3. Application MUST belong to the ticket's own customer_id (prevents cross-customer linking)
//   4. Writes: support_tickets.application_id, order_link_status, is_unlinked
//   5. Audit: application_events entry with actor, old value, new value, timestamp
// ──────────────────────────────────────────────────────────────────────────────
export const linkTicketToApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        applicationId: z.string().uuid(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const actorId = (context as any).userId as string;

    // 1. Load ticket
    const { data: ticketRow, error: tErr } = await admin
      .from("support_tickets")
      .select("id, ticket_number, customer_id, application_id, order_link_status, status")
      .eq("id", data.ticketId)
      .maybeSingle();

    if (tErr) throw new Error(tErr.message);
    if (!ticketRow) throw new Error("Ticket not found");

    const t = ticketRow as any;

    // 2. Guard: if already linked to a different order, reject
    if (t.application_id && t.application_id !== data.applicationId) {
      throw new Error(
        "Ticket is already linked to a different order. Cannot overwrite an existing order link."
      );
    }

    // 3. Load candidate application
    const { data: appRow, error: aErr } = await admin
      .from("applications")
      .select("id, application_code, customer_id, order_status")
      .eq("id", data.applicationId)
      .maybeSingle();

    if (aErr) throw new Error(aErr.message);
    if (!appRow) throw new Error("Application not found");

    const app = appRow as any;

    // 4. Security: application must belong to the ticket's customer
    if (!t.customer_id) {
      throw new Error(
        "Ticket has no customer_id — cannot safely link to an application without a verified customer association."
      );
    }
    if (app.customer_id !== t.customer_id) {
      throw new Error(
        "Security violation: The selected application belongs to a different customer. Linking rejected."
      );
    }

    // 5. Persist the link
    const { error: updateErr } = await admin
      .from("support_tickets")
      .update({
        application_id: data.applicationId,
        order_link_status: "linked",
        is_unlinked: false,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.ticketId);

    if (updateErr) throw new Error(`Failed to link ticket: ${updateErr.message}`);

    // 6. Audit trail on application_events (existing event system)
    try {
      await admin.from("application_events").insert({
        application_id: data.applicationId,
        customer_id: t.customer_id,
        event_type: "ticket_order_linked",
        old_value: t.application_id ?? null,
        new_value: data.applicationId,
        note: `Ticket ${t.ticket_number ?? data.ticketId} manually linked to order ${app.application_code ?? data.applicationId} by staff (was: ${t.order_link_status ?? "unknown"})`,
        created_by: actorId,
        staff_name: null,
        staff_role: null,
      } as never);
    } catch (auditErr) {
      console.warn("[linkTicketToApplication] audit event insert warning:", auditErr);
    }

    return {
      ok: true,
      ticketId: data.ticketId,
      applicationId: data.applicationId,
      applicationCode: app.application_code ?? null,
    };
  });

// ──────────────────────────────────────────────────────────────────────────────
// unlinkTicketFromApplication
//
// Allows staff to unlink an attached application from a ticket and reset its status
// to "unlinked" (or "needs_review" if customer has candidates).
// ──────────────────────────────────────────────────────────────────────────────
export const unlinkTicketFromApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ticketId: z.string().uuid() }).parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("support_tickets")
      .update({
        application_id: null,
        order_link_status: "unlinked",
        is_unlinked: true,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.ticketId);

    if (error) throw new Error(error.message);
    return { ok: true, ticketId: data.ticketId };
  });
