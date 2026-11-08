import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export type QuarantineRow = {
  id: string;
  zoho_mail_uid: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  reason: string;
  matched_ticket_id: string | null;
  matched_ticket_email: string | null;
  received_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_action: string | null;
  matched_ticket?: {
    id: string;
    ticket_number: string;
    subject: string;
    status: string;
    ticket_email: string | null;
  } | null;
};

// ─── LIST ─────────────────────────────────────────────────────────────
export const listQuarantine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        scope: z.enum(["pending", "reviewed", "all"]).default("pending"),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i ?? {})
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    let q = admin
      .from("inbound_email_quarantine")
      .select(
        "id, zoho_mail_uid, message_id, in_reply_to, from_email, to_email, subject, body_text, body_html, reason, matched_ticket_id, matched_ticket_email, received_at, reviewed_at, reviewed_by, review_action, matched_ticket:support_tickets!inbound_email_quarantine_matched_ticket_id_fkey(id, ticket_number, subject, status, ticket_email)"
      )
      .order("received_at", { ascending: false })
      .limit(data.limit);
    if (data.scope === "pending") q = q.is("reviewed_at", null);
    if (data.scope === "reviewed") q = q.not("reviewed_at", "is", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as QuarantineRow[];
  });

// ─── RE-RUN MATCHING (single row) ─────────────────────────────────────
export const rerunQuarantineMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("inbound_email_quarantine")
      .select("id, subject, in_reply_to, from_email, matched_ticket_id")
      .eq("id", data.id)
      .maybeSingle();
    const r = row as {
      id: string;
      subject: string | null;
      in_reply_to: string | null;
      from_email: string | null;
      matched_ticket_id: string | null;
    } | null;
    if (!r) throw new Error("Quarantine row not found");

    // Try token in subject
    let ticketId: string | null = null;
    let ticketEmail: string | null = null;
    const tokenMatch = (r.subject || "").match(/\[#\s*(TKT-\d{8}-\d{3,6})\s*\]/i);
    if (tokenMatch) {
      const { data: t } = await admin
        .from("support_tickets")
        .select("id, ticket_email")
        .eq("ticket_number", tokenMatch[1].toUpperCase())
        .maybeSingle();
      if (t) {
        ticketId = (t as { id: string }).id;
        ticketEmail = (t as { ticket_email: string | null }).ticket_email;
      }
    }

    // Try In-Reply-To against ticket_replies
    if (!ticketId && r.in_reply_to) {
      const { data: rep } = await admin
        .from("ticket_replies")
        .select("ticket_id")
        .eq("email_message_id", r.in_reply_to)
        .not("ticket_id", "is", null)
        .limit(1)
        .maybeSingle();
      const rr = rep as { ticket_id: string } | null;
      if (rr?.ticket_id) {
        ticketId = rr.ticket_id;
        const { data: t } = await admin
          .from("support_tickets")
          .select("ticket_email")
          .eq("id", ticketId)
          .maybeSingle();
        ticketEmail = (t as { ticket_email: string | null } | null)?.ticket_email ?? null;
      }
    }

    if (!ticketId) {
      return { matched: false as const };
    }

    const senderOk =
      !!r.from_email &&
      !!ticketEmail &&
      r.from_email.trim().toLowerCase() === ticketEmail.trim().toLowerCase();

    await admin
      .from("inbound_email_quarantine")
      .update({
        matched_ticket_id: ticketId,
        matched_ticket_email: ticketEmail,
        reason: senderOk ? "rematched_pending_review" : "sender_mismatch",
      } as never)
      .eq("id", r.id);

    return { matched: true as const, ticketId, senderOk };
  });

// ─── APPROVE — attach to a ticket as inbound reply ────────────────────
const ApproveInput = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid().optional(),
});

export const approveQuarantine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ApproveInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("inbound_email_quarantine")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const q = row as QuarantineRow | null;
    if (!q) throw new Error("Quarantine row not found");
    if (q.reviewed_at) throw new Error("This message is already reviewed.");

    const ticketId = data.ticketId || q.matched_ticket_id;
    if (!ticketId) throw new Error("No ticket selected. Provide a ticket to attach this message to.");

    const { data: ticket } = await admin
      .from("support_tickets")
      .select("id, application_id, customer_id")
      .eq("id", ticketId)
      .maybeSingle();
    const t = ticket as { id: string; application_id: string | null; customer_id: string | null } | null;
    if (!t) throw new Error("Ticket not found");

    const receivedAt = q.received_at;
    const bodyText = q.body_text ?? "";

    // email_logs entry (incoming)
    await admin.from("email_logs").insert({
      direction: "incoming",
      status: "sent",
      to_email: q.to_email,
      from_email: q.from_email,
      subject: q.subject,
      body_html: q.body_html,
      body_text: q.body_text,
      message_id: q.message_id,
      in_reply_to: q.in_reply_to,
      zoho_mail_uid: q.zoho_mail_uid,
      application_id: t.application_id,
      customer_id: t.customer_id,
      sent_at: receivedAt,
    } as never);

    // ticket_replies inbound
    await admin.from("ticket_replies").insert({
      ticket_id: t.id,
      reply_text: bodyText.slice(0, 8000),
      is_internal: false,
      direction: "inbound",
      email_message_id: q.message_id,
      email_in_reply_to: q.in_reply_to,
    } as never);

    await admin
      .from("support_tickets")
      .update({
        status: "open",
        last_customer_message_at: receivedAt,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", t.id);

    // Cancel autoclose if any
    try {
      const { cancelTicketAutocloseByTicket, cancelTicketAutocloseForOrder } =
        await import("@/lib/scheduling/schedulers.server");
      await cancelTicketAutocloseByTicket(t.id, "customer_replied").catch(() => {});
      if (t.application_id) {
        await cancelTicketAutocloseForOrder(t.application_id, "customer_replied").catch(() => {});
      }
    } catch { /* non-fatal */ }

    await admin
      .from("inbound_email_quarantine")
      .update({
        matched_ticket_id: t.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        review_action: "approved",
      } as never)
      .eq("id", q.id);

    return { ok: true, ticketId: t.id };
  });

// ─── DISCARD ──────────────────────────────────────────────────────────
export const discardQuarantine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    await admin
      .from("inbound_email_quarantine")
      .update({
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        review_action: data.reason ? `discarded: ${data.reason}` : "discarded",
      } as never)
      .eq("id", data.id);
    return { ok: true };
  });

// ─── LOOKUP TICKETS BY NUMBER / SUBJECT (for manual attach) ───────────
export const searchTicketsForQuarantine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().trim().min(1).max(100) }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const term = data.q;
    const { data: rows } = await admin
      .from("support_tickets")
      .select("id, ticket_number, subject, status, ticket_email")
      .or(`ticket_number.ilike.%${term}%,subject.ilike.%${term}%,ticket_email.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(20);
    return (rows ?? []) as Array<{
      id: string;
      ticket_number: string;
      subject: string;
      status: string;
      ticket_email: string | null;
    }>;
  });

// ─── CREATE A NEW TICKET FROM A QUARANTINED EMAIL ─────────────────────
// Use case: inbound email from an unknown sender (or one we couldn't safely
// attach) that should still become a support ticket. Optionally links to a
// customer / application.
const CreateFromQuarantineInput = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

export const createTicketFromQuarantine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateFromQuarantineInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();

    const { data: row } = await admin
      .from("inbound_email_quarantine")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const q = row as QuarantineRow | null;
    if (!q) throw new Error("Quarantine row not found");
    if (q.reviewed_at) throw new Error("This message is already reviewed.");

    // Best-effort customer resolution when caller didn't pass one.
    let customerId = data.customerId ?? null;
    if (!customerId && q.from_email) {
      const { data: cust } = await admin
        .from("customers")
        .select("id")
        .eq("primary_email", q.from_email.toLowerCase())
        .limit(1)
        .maybeSingle();
      customerId = (cust as { id: string } | null)?.id ?? null;
    }

    const subject = (q.subject || "(no subject)").slice(0, 240);
    const bodyText = q.body_text ?? "";

    const { data: created, error: tErr } = await admin
      .from("support_tickets")
      .insert({
        subject,
        description: bodyText.slice(0, 4000),
        source: "email_inbound",
        status: "open",
        ticket_state: "open",
        customer_id: customerId,
        application_id: data.applicationId ?? null,
        ticket_email: q.from_email,
        last_customer_message_at: q.received_at,
      } as never)
      .select("id, ticket_number")
      .single();
    if (tErr) throw new Error(tErr.message);
    const t = created as { id: string; ticket_number: string };

    // Snapshot the inbound message as the first reply on the new ticket.
    await admin.from("ticket_replies").insert({
      ticket_id: t.id,
      reply_text: bodyText.slice(0, 8000),
      is_internal: false,
      direction: "inbound",
      email_message_id: q.message_id,
      email_in_reply_to: q.in_reply_to,
    } as never);

    // Log the incoming email itself.
    await admin.from("email_logs").insert({
      direction: "incoming",
      status: "sent",
      to_email: q.to_email,
      from_email: q.from_email,
      subject: q.subject,
      body_html: q.body_html,
      body_text: q.body_text,
      message_id: q.message_id,
      in_reply_to: q.in_reply_to,
      zoho_mail_uid: q.zoho_mail_uid,
      customer_id: customerId,
      sent_at: q.received_at,
    } as never);

    await admin
      .from("inbound_email_quarantine")
      .update({
        matched_ticket_id: t.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        review_action: "converted_to_ticket",
      } as never)
      .eq("id", q.id);

    return { ok: true, ticketId: t.id, ticketNumber: t.ticket_number };
  });
