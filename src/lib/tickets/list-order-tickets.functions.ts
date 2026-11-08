// Phase 3 finish — list all support tickets for one order (open + closed).
// Powers the TicketPanel on the order workspace.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrderTicketRow = {
  id: string;
  ticket_number: string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  reopened_count: number | null;
  last_closed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export const listOrderTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, subject, status, priority, reopened_count, last_closed_at, created_at, updated_at",
      )
      .eq("application_id", data.orderId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tickets: (rows ?? []) as OrderTicketRow[] };
  });
