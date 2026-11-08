import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeOrderStage, type OrderStage } from "./computeOrderStage";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export const TICKET_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export const RESPONSE_STATES = ["all", "new", "unread", "awaiting_action", "awaiting_customer", "replied", "closed"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof PRIORITIES)[number];
export type ResponseState = (typeof RESPONSE_STATES)[number];

// Re-export the emailing reply from ticket-actions so the UI has a single source of truth.
export { replyToTicket } from "@/lib/tickets/ticket-actions.functions";

export type TicketResponseState = "new" | "awaiting_action" | "awaiting_customer" | "replied" | "closed";

export function computeTicketResponseState(ticket: {
  status: string | null;
  first_response_at?: string | null;
  last_customer_message_at?: string | null;
  last_staff_message_at?: string | null;
}): TicketResponseState {
  if (ticket.status === "resolved" || ticket.status === "closed") {
    return "closed";
  }
  if (!ticket.first_response_at) {
    return "new";
  }
  if (
    ticket.last_customer_message_at &&
    (!ticket.last_staff_message_at ||
      new Date(ticket.last_customer_message_at) > new Date(ticket.last_staff_message_at))
  ) {
    return "awaiting_action";
  }
  if (ticket.status === "waiting_customer") {
    return "awaiting_customer";
  }
  if (ticket.last_staff_message_at) {
    return "replied";
  }
  return "new";
}

export const listTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        q: z.string().default(""),
        bucket: z.enum(["all", "need_action", "backlog", "reopened", "refund", "closed", "open", "new"]).optional(),
        status: z.enum(TICKET_STATUSES).optional(),
        statuses: z.array(z.enum(TICKET_STATUSES)).optional(),
        responseState: z.enum(RESPONSE_STATES).optional().default("all"),
        priority: z.enum(PRIORITIES).optional(),
        assignedTo: z.string().optional(), // uuid or "unassigned"
        serviceId: z.string().uuid().optional(),
        stage: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        scope: z.enum(["mine", "all"]).default("all"),
        sort: z.enum(["newest", "oldest", "updated", "last_activity", "highest_priority", "unassigned"]).default("last_activity"),
        unassignedOnly: z.boolean().default(false),
        isStarred: z.boolean().optional(),
        folderId: z.string().uuid().optional(),
      })
      .parse(i ?? {})
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    const istOffset = 5.5 * 3600 * 1000;
    const nowUtc = Date.now();
    const istNow = new Date(nowUtc + istOffset);
    const todayStartUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0) - istOffset).toISOString();

    // Filter by starred if requested
    let filterTicketIds: string[] | null = null;
    if (data.isStarred) {
      const { getUserStarredTicketIds } = await import("@/lib/crm/support-folders.functions");
      const starredIds = await getUserStarredTicketIds(context.userId);
      filterTicketIds = starredIds;
      if (filterTicketIds.length === 0) {
        return { tickets: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
    } else if (data.folderId) {
      const { getFolderTicketIds } = await import("@/lib/crm/support-folders.functions");
      const fIds = await getFolderTicketIds(data.folderId, context.userId);
      filterTicketIds = fIds;
      if (filterTicketIds.length === 0) {
        return { tickets: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
    }

    // Filter by bucket if specified
    const isFolderOrStarred = Boolean(data.folderId || data.isStarred);
    let bucketTicketIds: string[] | null = null;
    if (!isFolderOrStarred && data.bucket === "reopened") {
      const { data: replies } = await admin
        .from("ticket_replies")
        .select("ticket_id")
        .or("direction.eq.reopened_order,reply_text.ilike.%reopened order%");
      bucketTicketIds = Array.from(new Set((replies ?? []).map((r: any) => r.ticket_id).filter(Boolean)));
      if (bucketTicketIds.length === 0) {
        return { tickets: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
    } else if (!isFolderOrStarred && data.bucket === "refund") {
      const { data: replies } = await admin
        .from("ticket_replies")
        .select("ticket_id")
        .or("direction.eq.refund_rejected,template_code.eq.R002,reply_text.ilike.%Refund Rejected%");
      bucketTicketIds = Array.from(new Set((replies ?? []).map((r: any) => r.ticket_id).filter(Boolean)));
      if (bucketTicketIds.length === 0) {
        return { tickets: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
    }

    let q = admin
      .from("support_tickets")
      .select(
        `id, ticket_number, subject, description, status, priority, assigned_to, created_at, updated_at, closed_at, resolved_at,
         first_response_at, last_customer_message_at, last_staff_message_at, ticket_email, source,
         customer_id, application_id, service_id,
         customers(id, name, primary_email, primary_mobile),
         applications(id, application_code, fulfillment_status, application_status, workflow_status, form_submitted_at, certificate_uploaded_at, service_id, leads!applications_lead_id_fkey(id, status, lead_status_v2)),
         services(id, service_name)`,
        { count: "exact" }
      );

    if (filterTicketIds && filterTicketIds.length > 0) {
      q = q.in("id", filterTicketIds);
    }
    if (bucketTicketIds && bucketTicketIds.length > 0) {
      q = q.in("id", bucketTicketIds);
    }

    // Sorting
    if (data.bucket === "closed") {
      q = q.order("closed_at", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
    } else if (data.sort === "oldest") {
      q = q.order("created_at", { ascending: true });
    } else if (data.sort === "updated") {
      q = q.order("updated_at", { ascending: false });
    } else if (data.sort === "highest_priority") {
      // Urgent, High, Medium, Low
      q = q
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });
    } else if (data.sort === "unassigned") {
      q = q
        .order("assigned_to", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: false });
    } else if (data.sort === "last_activity") {
      q = q
        .order("last_customer_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false });
    }

    // Assignment filters
    if (data.unassignedOnly || data.assignedTo === "unassigned") {
      q = q.is("assigned_to", null);
    } else if (data.assignedTo && data.assignedTo !== "all") {
      q = q.eq("assigned_to", data.assignedTo);
    }

    // Status filter
    if (!isFolderOrStarred && data.bucket === "backlog") {
      q = q.not("status", "in", '("resolved","closed")').lt("created_at", todayStartUtc);
    } else if (!isFolderOrStarred && (data.bucket === "need_action" || data.bucket === "open")) {
      q = q.not("status", "in", '("resolved","closed")');
    } else if (!isFolderOrStarred && (data.bucket === "closed" || data.bucket === "refund")) {
      q = q.in("status", ["resolved", "closed"]);
    } else if (data.status) {
      q = q.eq("status", data.status);
    } else if (data.statuses && data.statuses.length) {
      q = q.in("status", data.statuses);
    }

    // Priority filter
    if (data.priority) {
      q = q.eq("priority", data.priority);
    }

    // Service filter
    if (data.serviceId) {
      q = q.eq("service_id", data.serviceId);
    }

    // Date range filter
    if (!isFolderOrStarred && data.bucket !== "backlog") {
      if (data.dateFrom) {
        const fromIso = data.dateFrom.includes("T") ? data.dateFrom : `${data.dateFrom}T00:00:00+05:30`;
        const dateField = data.bucket === "closed" ? "closed_at" : "created_at";
        q = q.gte(dateField, new Date(fromIso).toISOString());
      }
      if (data.dateTo) {
        const toIso = data.dateTo.includes("T") ? data.dateTo : `${data.dateTo}T23:59:59+05:30`;
        const dateField = data.bucket === "closed" ? "closed_at" : "created_at";
        q = q.lte(dateField, new Date(toIso).toISOString());
      }
    } else if (isFolderOrStarred) {
      if (data.dateFrom) {
        const fromIso = data.dateFrom.includes("T") ? data.dateFrom : `${data.dateFrom}T00:00:00+05:30`;
        q = q.gte("created_at", new Date(fromIso).toISOString());
      }
      if (data.dateTo) {
        const toIso = data.dateTo.includes("T") ? data.dateTo : `${data.dateTo}T23:59:59+05:30`;
        q = q.lte("created_at", new Date(toIso).toISOString());
      }
    }

    // Scope filter
    if (data.scope === "mine") {
      q = q.eq("assigned_to", context.userId);
    }

    // Response State Filter (Direct DB conditions)
    if (data.responseState === "closed") {
      q = q.in("status", ["resolved", "closed"]);
    } else if (data.responseState === "new") {
      q = q.is("first_response_at", null).not("status", "in", '("resolved","closed")');
    } else if (data.responseState === "awaiting_customer") {
      q = q.eq("status", "waiting_customer");
    } else if (data.responseState === "awaiting_action") {
      q = q.not("status", "in", '("resolved","closed")').not("first_response_at", "is", null);
    } else if (data.responseState === "unread") {
      q = q.not("status", "in", '("resolved","closed")').not("last_customer_message_at", "is", null);
    } else if (data.responseState === "replied") {
      q = q.not("status", "in", '("resolved","closed")').not("last_staff_message_at", "is", null).neq("status", "waiting_customer");
    }

    // Search query
    const term = data.q.trim().replace(/[(),*]/g, " ").trim();
    if (term) {
      const like = `%${term}%`;
      const ors = [
        `ticket_number.ilike.${like}`,
        `subject.ilike.${like}`,
        `description.ilike.${like}`,
        `ticket_email.ilike.${like}`,
      ];

      // Resolve customers (email / name / mobile) and orders (code) separately
      const [custRes, appRes, mailRes] = await Promise.all([
        admin
          .from("customers")
          .select("id")
          .or(`primary_email.ilike.${like},name.ilike.${like},primary_mobile.ilike.${like}`)
          .limit(50),
        admin
          .from("applications")
          .select("id")
          .ilike("application_code", like)
          .limit(50),
        admin
          .from("email_logs")
          .select("customer_id, application_id")
          .or(`to_email.ilike.${like},from_email.ilike.${like}`)
          .limit(100),
      ]);

      const custIds = new Set<string>((custRes.data ?? []).map((r: any) => r.id));
      const appIds = new Set<string>((appRes.data ?? []).map((r: any) => r.id));
      (mailRes.data ?? []).forEach((r: any) => {
        if (r.customer_id) custIds.add(r.customer_id);
        if (r.application_id) appIds.add(r.application_id);
      });

      // Cap the ID lists: a very long IN(...) makes the PostgREST URL exceed
      // limits and the underlying fetch fails outright.
      const capped = (s: Set<string>) => Array.from(s).slice(0, 60);
      const custList = capped(custIds);
      const appList = capped(appIds);
      if (custList.length) ors.push(`customer_id.in.(${custList.join(",")})`);
      if (appList.length) ors.push(`application_id.in.(${appList.join(",")})`);

      q = q.or(ors.join(","));
    }

    // Apply pagination range
    q = q.range(from, to);

    // Transient network failures (undici "fetch failed") should not blank the page.
    let rows: any[] | null = null;
    let count: number | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await q;
        if (res.error) throw new Error(res.error.message);
        rows = res.data as any[];
        count = res.count ?? null;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    if (lastErr) throw new Error(lastErr instanceof Error ? lastErr.message : String(lastErr));

    const assignees = Array.from(
      new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean))
    ) as string[];
    const nameMap = new Map<string, string>();
    if (assignees.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", assignees);
      (profs ?? []).forEach((p: any) =>
        nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff")
      );
    }

    const rowIds = (rows ?? []).map((r: any) => r.id);
    const { getTicketOrganizationMeta } = await import("@/lib/crm/support-folders.functions");
    const { starredSet, ticketFolderMap } = await getTicketOrganizationMeta(context.userId, rowIds);

    let tickets = (rows ?? []).map((r: any) => {
      const isUnread = Boolean(
        r.last_customer_message_at &&
          (!r.last_staff_message_at ||
            new Date(r.last_customer_message_at) > new Date(r.last_staff_message_at))
      );
      const isNew = !r.first_response_at && !["resolved", "closed"].includes(r.status);
      const responseState = computeTicketResponseState(r);

      const orderApp = r.applications;
      const orderLead = Array.isArray(orderApp?.leads) ? orderApp?.leads[0] : orderApp?.leads;
      const orderStage: OrderStage | null = orderApp ? computeOrderStage(orderLead, orderApp) : null;

      const lastCustomerTime = r.last_customer_message_at ? new Date(r.last_customer_message_at).getTime() : 0;
      const lastStaffTime = r.last_staff_message_at ? new Date(r.last_staff_message_at).getTime() : 0;
      const lastActivityAt = r.last_customer_message_at || r.last_staff_message_at || r.updated_at || r.created_at;
      const lastActivityActor: "customer" | "staff" = lastCustomerTime >= lastStaffTime && lastCustomerTime > 0 ? "customer" : "staff";

      const folderInfo = ticketFolderMap.get(r.id);

      return {
        id: r.id,
        ticket_number: r.ticket_number,
        is_starred: starredSet.has(r.id),
        folder_id: folderInfo?.folderId ?? null,
        folder_name: folderInfo?.folderName ?? null,
        folder_color: folderInfo?.color ?? null,
        subject: r.subject,
        description: r.description,
        status: r.status as TicketStatus,
        priority: (r.priority as TicketPriority) ?? "medium",
        response_state: responseState,
        is_unread: isUnread,
        is_new: isNew,
        assigned_to: r.assigned_to,
        assigned_name: r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        first_response_at: r.first_response_at,
        last_customer_message_at: r.last_customer_message_at,
        last_staff_message_at: r.last_staff_message_at,
        last_activity_at: lastActivityAt,
        last_activity_actor: lastActivityActor,
        ticket_email: r.ticket_email,
        source: r.source,
        customer_id: r.customer_id,
        customer_name: r.customers?.name ?? null,
        customer_email: r.customers?.primary_email ?? r.ticket_email ?? null,
        customer_mobile: r.customers?.primary_mobile ?? null,
        application_id: r.application_id,
        application_code: r.applications?.application_code ?? null,
        service_id: r.service_id,
        service_name: r.services?.service_name ?? null,
        order_stage: orderStage,
      };
    });

    if (data.stage && data.stage !== "all") {
      tickets = tickets.filter((t) => t.order_stage === data.stage);
    }

    return { tickets, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const getTicketStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const admin = await getAdmin();

    const istOffset = 5.5 * 3600 * 1000;
    const nowUtc = Date.now();
    const istNow = new Date(nowUtc + istOffset);
    const todayStartUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0) - istOffset).toISOString();

    const [totalRes, closedRes, openRes, backlogRes, reopenedRepliesRes, refundRepliesRes, newRes, awaitingCustRes, activeRowsRes] = await Promise.all([
      admin.from("support_tickets").select("id", { count: "exact", head: true }),
      admin.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["resolved", "closed"]),
      admin.from("support_tickets").select("id", { count: "exact", head: true }).not("status", "in", '("resolved","closed")'),
      admin.from("support_tickets").select("id", { count: "exact", head: true }).not("status", "in", '("resolved","closed")').lt("created_at", todayStartUtc),
      admin.from("ticket_replies").select("ticket_id").or("direction.eq.reopened_order,reply_text.ilike.%reopened order%"),
      admin.from("ticket_replies").select("ticket_id").or("direction.eq.refund_rejected,template_code.eq.R002,reply_text.ilike.%Refund Rejected%"),
      admin.from("support_tickets").select("id", { count: "exact", head: true }).is("first_response_at", null).not("status", "in", '("resolved","closed")'),
      admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "waiting_customer"),
      admin.from("support_tickets").select("id, status, first_response_at, last_customer_message_at, last_staff_message_at").not("status", "in", '("resolved","closed")'),
    ]);

    const total = totalRes.count ?? 0;
    const closedCount = closedRes.count ?? 0;
    const openCount = openRes.count ?? 0;
    const backlogCount = backlogRes.count ?? 0;
    const newCount = newRes.count ?? 0;
    const awaitingCustomerCount = awaitingCustRes.count ?? 0;

    const reopenedTicketIdsRaw = Array.from(new Set((reopenedRepliesRes.data ?? []).map((r: any) => r.ticket_id).filter(Boolean)));
    const refundTicketIdsRaw = Array.from(new Set((refundRepliesRes.data ?? []).map((r: any) => r.ticket_id).filter(Boolean)));

    let refundCount = 0;
    if (refundTicketIdsRaw.length > 0) {
      const { count: rfClosedCount } = await admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("id", refundTicketIdsRaw)
        .in("status", ["resolved", "closed"]);
      refundCount = rfClosedCount ?? 0;
    }

    let reopenedCount = 0;
    if (reopenedTicketIdsRaw.length > 0) {
      const { count: roCount } = await admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("id", reopenedTicketIdsRaw);
      reopenedCount = roCount ?? 0;
    }

    let unreadCount = 0;
    let awaitingActionCount = 0;
    let repliedCount = 0;

    for (const r of (activeRowsRes.data ?? []) as any[]) {
      const isUnread = Boolean(
        r.last_customer_message_at &&
          (!r.last_staff_message_at ||
            new Date(r.last_customer_message_at) > new Date(r.last_staff_message_at))
      );
      if (isUnread) unreadCount++;

      const respState = computeTicketResponseState(r);
      if (respState === "awaiting_action") awaitingActionCount++;
      else if (respState === "replied") repliedCount++;
    }

    return {
      total,
      need_action: openCount,
      open: openCount,
      backlog: backlogCount,
      reopened: reopenedCount,
      refund: refundCount,
      new: newCount,
      unread: unreadCount,
      awaiting_action: awaitingActionCount,
      awaiting_customer: awaitingCustomerCount,
      replied: repliedCount,
      closed: closedCount,
    };
  });

export const bulkAssignTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketIds: z.array(z.string().uuid()).min(1),
        assignedTo: z.string().uuid().nullable(),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("support_tickets")
      .update({ assigned_to: data.assignedTo } as never)
      .in("id", data.ticketIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ticketIds.length };
  });

export const bulkUpdateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketIds: z.array(z.string().uuid()).min(1),
        status: z.enum(TICKET_STATUSES),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };

    if (data.status === "resolved") {
      patch.resolved_at = now;
      patch.resolved_by = context.userId;
    } else if (data.status === "closed") {
      patch.closed_at = now;
    } else {
      patch.resolved_at = null;
      patch.resolved_by = null;
      patch.closed_at = null;
    }

    const { error } = await admin
      .from("support_tickets")
      .update(patch as never)
      .in("id", data.ticketIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ticketIds.length };
  });

export const bulkUpdateTicketPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketIds: z.array(z.string().uuid()).min(1),
        priority: z.enum(PRIORITIES),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("support_tickets")
      .update({ priority: data.priority } as never)
      .in("id", data.ticketIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ticketIds.length };
  });

export const bulkMarkTicketsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ticketIds: z.array(z.string().uuid()).min(1),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const now = new Date().toISOString();
    const { error } = await admin
      .from("support_tickets")
      .update({ last_staff_message_at: now } as never)
      .in("id", data.ticketIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ticketIds.length };
  });

export const getTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("support_tickets")
      .select(
        "id, ticket_number, subject, description, status, priority, assigned_to, resolved_at, resolved_by, closed_at, first_response_at, last_customer_message_at, last_staff_message_at, ticket_email, source, created_at, updated_at, customer_id, application_id, service_id, customers(id, name, primary_email, primary_mobile), applications(id, application_code), services(service_name)"
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ticket not found");

    const { data: replies } = await admin
      .from("ticket_replies")
      .select("id, reply_text, is_internal, created_by, created_at, direction, emailed_at, email_message_id")
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: true });

    const authorIds = Array.from(
      new Set([
        ...(replies ?? []).map((r) => r.created_by).filter(Boolean) as string[],
        ...(row.assigned_to ? [row.assigned_to] : []),
        ...(row.resolved_by ? [row.resolved_by] : []),
      ])
    );
    const nameMap = new Map<string, string>();
    if (authorIds.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", authorIds);
      (profs ?? []).forEach((p: any) =>
        nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff")
      );
    }

    return {
      ticket: {
        ...row,
        assigned_name: row.assigned_to ? nameMap.get(row.assigned_to) ?? null : null,
        resolved_name: row.resolved_by ? nameMap.get(row.resolved_by) ?? null : null,
      },
      replies: (replies ?? []).map((r: any) => ({
        ...r,
        author_name: r.created_by ? nameMap.get(r.created_by) ?? "Staff" : "System",
      })),
    };
  });

export const checkOpenTicketForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("support_tickets")
      .select("id, ticket_number, subject, status")
      .eq("application_id", data.applicationId)
      .in("status", ["open", "in_progress", "waiting_customer"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row ?? null;
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        subject: z.string().trim().min(3).max(200),
        description: z.string().trim().max(5000).optional(),
        priority: z.enum(PRIORITIES).default("medium"),
        assignedTo: z.string().uuid().nullable().optional(),
        customerId: z.string().uuid(),
        applicationId: z.string().uuid().nullable().optional(),
        source: z.enum(["staff", "email_inbound", "web"]).default("staff"),
        allowDuplicate: z.boolean().default(false),
        category: z.enum(["technical", "order_related", "suggestion_to_owner"]).nullable().optional(),
        attachmentUrl: z.string().url().max(2000).nullable().optional(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();

    // Dedup: reuse existing open ticket for the same order unless overridden.
    if (data.applicationId && !data.allowDuplicate) {
      const { data: existing } = await admin
        .from("support_tickets")
        .select("id, ticket_number")
        .eq("application_id", data.applicationId)
        .in("status", ["open", "in_progress", "waiting_customer"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ex = existing as { id: string; ticket_number: string | null } | null;
      if (ex) {
        return { id: ex.id, ticket_number: ex.ticket_number ?? "", reused: true as const };
      }
    }

    // Enforce "registered email only" — resolve and snapshot the customer's email up-front.
    const { data: cust } = await admin
      .from("customers")
      .select("name, primary_email")
      .eq("id", data.customerId)
      .maybeSingle();
    const custRow = cust as { name: string | null; primary_email: string | null } | null;
    const ticketEmail = custRow?.primary_email?.trim().toLowerCase() || null;
    if (!ticketEmail) {
      throw new Error(
        "Customer has no registered email address on file. Add an email to the customer profile before opening a ticket."
      );
    }

    let serviceId: string | null = null;
    if (data.applicationId) {
      const { data: app } = await admin
        .from("applications")
        .select("service_id")
        .eq("id", data.applicationId)
        .maybeSingle();
      serviceId = (app?.service_id as string | null) ?? null;
    }

    // Auto-assign from assignment_pool round-robin when no explicit assignee.
    let resolvedAssignee: string | null = data.assignedTo ?? null;
    let autoAssignedPoolId: string | null = null;
    if (!resolvedAssignee) {
      const { data: poolRow } = await admin
        .from("assignment_pool")
        .select("id, user_id, service_id, last_assigned_at, total_assigned")
        .eq("is_active", true)
        .or(
          serviceId
            ? `service_id.eq.${serviceId},service_id.is.null`
            : `service_id.is.null`
        )
        .order("service_id", { ascending: true, nullsFirst: false })
        .order("last_assigned_at", { ascending: true, nullsFirst: true })
        .order("total_assigned", { ascending: true })
        .limit(1)
        .maybeSingle();
      const p = poolRow as { id: string; user_id: string } | null;
      if (p) {
        resolvedAssignee = p.user_id;
        autoAssignedPoolId = p.id;
      }
    }

    const { data: ins, error } = await admin
      .from("support_tickets")
      .insert({
        subject: data.subject,
        description: data.description ?? null,
        priority: data.priority,
        assigned_to: resolvedAssignee,
        customer_id: data.customerId,
        application_id: data.applicationId ?? null,
        service_id: serviceId,
        status: "open",
        ticket_email: ticketEmail,
        source: data.source,
        category: data.category ?? null,
        attachment_url: data.attachmentUrl ?? null,
      } as never)
      .select("id, ticket_number")
      .single();
    if (error) throw new Error(error.message);

    if (autoAssignedPoolId) {
      const { data: cur } = await admin
        .from("assignment_pool")
        .select("total_assigned")
        .eq("id", autoAssignedPoolId)
        .maybeSingle();
      const curCount = ((cur as { total_assigned: number | null } | null)?.total_assigned ?? 0) + 1;
      await admin
        .from("assignment_pool")
        .update({ last_assigned_at: new Date().toISOString(), total_assigned: curCount } as never)
        .eq("id", autoAssignedPoolId);
    }

    if (data.applicationId) {
      await admin.from("application_events").insert({
        application_id: data.applicationId,
        customer_id: data.customerId,
        event_type: "ticket_created",
        new_value: ins!.ticket_number,
        created_by: context.userId,
      } as never);
    }

    return { id: ins!.id, ticket_number: ins!.ticket_number, reused: false as const };
  });

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(TICKET_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
        resolutionNote: z.string().trim().max(2000).optional(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === "resolved") {
        patch.resolved_at = now;
        patch.resolved_by = context.userId;
      } else if (data.status === "closed") {
        patch.closed_at = now;
      } else {
        // Re-opening clears resolution timestamps
        patch.resolved_at = null;
        patch.resolved_by = null;
        patch.closed_at = null;
      }
    }
    if (data.priority) patch.priority = data.priority;
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { data: row, error } = await admin
      .from("support_tickets")
      .update(patch as never)
      .eq("id", data.id)
      .select(
        "application_id, customer_id, ticket_number, ticket_email, subject, status"
      )
      .single();
    if (error) throw new Error(error.message);

    if (data.status && row.application_id) {
      await admin.from("application_events").insert({
        application_id: row.application_id,
        customer_id: row.customer_id,
        event_type: "ticket_status_change",
        new_value: data.status,
        note: `Ticket ${row.ticket_number}`,
        created_by: context.userId,
      } as never);
    }

    // Close auto-close scheduler when staff manually resolves/closes the ticket.
    if (data.status === "resolved" || data.status === "closed") {
      // Cancel any armed auto-close scheduler
      try {
        const { cancelTicketAutocloseByTicket } = await import(
          "@/lib/scheduling/schedulers.server"
        );
        await cancelTicketAutocloseByTicket(data.id, data.status === "resolved" ? "resolved_by_staff" : "closed_by_staff");
      } catch { /* non-fatal */ }

      if (row.application_id) {
        try {
          const { dispatchEvent } = await import("@/lib/workflow/engine.server");
          await dispatchEvent({
            type: "TicketClosed",
            applicationId: row.application_id,
            ticketId: data.id,
            outcome: "cooperating",
            actorId: context.userId,
          }, context.userId);
        } catch (e) { console.error("[workflow] TicketClosed(status update) dispatch failed", e); }

        try {
          const { data: paused } = await admin
            .from("order_schedulers")
            .select("id")
            .eq("application_id", row.application_id)
            .eq("status", "paused")
            .eq("paused_by_ticket_id", data.id)
            .in("scheduler_type", ["customer_closure_24h", "customer_side_delay"]);
          if (paused?.length) {
            const { resumeScheduler } = await import("@/lib/scheduling/schedulers.server");
            for (const s of paused as Array<{ id: string }>) await resumeScheduler(s.id);
          }
        } catch (e) { console.error("[tickets] paused order scheduler resume failed", e); }
      }
    }

    return { ok: true };
  });

export const searchCustomerOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().default("") }).parse(i ?? {}))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    let query = admin
      .from("customers")
      .select("id, customer_code, name, primary_email, primary_mobile")
      .order("created_at", { ascending: false })
      .limit(15);
    const q = data.q.trim();
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `name.ilike.${like},primary_email.ilike.${like},primary_mobile.ilike.${like},customer_code.ilike.${like}`
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getAdjacentTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: curr } = await admin
      .from("support_tickets")
      .select("created_at")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!curr) return { prevId: null, nextId: null };

    const [prevRes, nextRes] = await Promise.all([
      admin
        .from("support_tickets")
        .select("id")
        .gt("created_at", curr.created_at)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin
        .from("support_tickets")
        .select("id")
        .lt("created_at", curr.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      prevId: prevRes.data?.id ?? null,
      nextId: nextRes.data?.id ?? null,
    };
  });
