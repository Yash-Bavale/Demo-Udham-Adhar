// Phase 2 — Ticket merge: single ticket per order lifetime.
// Wraps the ticket_reopen_or_create RPC and dispatches TicketOpened so the
// workflow engine records the open ticket (per spec v2: one ticket per order,
// reopen instead of creating a new one when the same customer emails again).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const findOrReopenTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        customerEmail: z.string().email(),
        subject: z.string().max(500).optional(),
        channel: z.enum(["email", "chat", "phone", "form"]).default("email"),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("ticket_reopen_or_create", {
      _application_id: data.applicationId,
      _customer_email: data.customerEmail,
      _subject: data.subject ?? "Customer inquiry",
      _channel: data.channel,
    });
    if (error) throw new Error(error.message);

    const row = Array.isArray(rows) ? rows[0] : rows;
    const ticketId = row?.ticket_id as string | undefined;
    if (!ticketId) throw new Error("ticket_reopen_or_create returned no ticket_id");

    // Record the open/reopened ticket. Customer-delay closure continues until
    // staff explicitly chooses Restart Order; ticket creation alone must not
    // cancel, pause, or resolve that timer.
    try {
      const { dispatchEvent } = await import("@/lib/workflow/engine.server");
      await dispatchEvent({
        type: "TicketOpened",
        applicationId: data.applicationId,
        ticketId,
      });
    } catch (e) {
      console.warn("[findOrReopenTicket] TicketOpened dispatch failed:", e);
    }
    return {
      ticketId,
      wasReopened: Boolean(row?.was_reopened),
      wasCreated: Boolean(row?.was_created),
    };
  });
