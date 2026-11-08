import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export const createFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        scheduledAt: z.string().min(1), // ISO string from <input type=datetime-local>
        reason: z.enum(["call_back", "documents_pending", "refund_followup", "general", "other"]),
        reasonNote: z.string().trim().max(500).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: lead } = await admin
      .from("leads")
      .select("customer_id")
      .eq("id", data.leadId)
      .maybeSingle();
    const { data: app } = await admin
      .from("applications")
      .select("id")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await admin.from("follow_ups").insert({
      lead_id: data.leadId,
      customer_id: lead?.customer_id ?? null,
      application_id: app?.id ?? null,
      scheduled_at: new Date(data.scheduledAt).toISOString(),
      reason: data.reason,
      reason_note: data.reasonNote?.trim() || null,
      assigned_to: data.assignedTo ?? null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);

    // Also stamp leads.next_followup_at when the new one is the earliest pending.
    await admin
      .from("leads")
      .update({
        next_followup_at: new Date(data.scheduledAt).toISOString(),
        followup_note: data.reasonNote?.trim() || data.reason,
      } as never)
      .eq("id", data.leadId);

    return { ok: true };
  });

export const listFollowUpsForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("follow_ups")
      .select("id, scheduled_at, reason, reason_note, assigned_to, is_completed, completed_at, completion_note, created_at")
      .eq("lead_id", data.leadId)
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const completeFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().max(2000).optional() }).parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("follow_ups")
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        completion_note: data.note ?? null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
