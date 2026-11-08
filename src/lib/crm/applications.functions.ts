import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


const APPLICATION_STATUS_ENUM = [
  "awaiting_payment",
  "payment_received",
  "details_pending",
  "documents_pending",
  "under_review",
  "under_process",
  "completed",
] as const;

export const getApplicationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ applicationId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "support"]);
    
    const { data: app, error } = await (await getAdmin())
      .from("applications")
      .select("*, lead:leads(*), certificates(*)")
      .eq("id", data.applicationId)
      .single();

    if (error || !app) throw new Error("Application not found");

    return { 
      application: app,
      lead: app.lead,
      certificates: app.certificates || []
    };
  });

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    page: z.number().default(1),
    pageSize: z.number().default(25),
    status: z.enum(APPLICATION_STATUS_ENUM).optional(),
  }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "support"]);

    let query = (await getAdmin())
      .from("applications")
      .select("*, leads(*)", { count: "exact" });

    if (data.status) {
      query = query.eq("application_status", data.status);
    }

    const { data: rows, count, error } = await query
      .order("created_at", { ascending: false })
      .range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);

    if (error) throw new Error(error.message);
    return { rows: rows || [], total: count || 0 };
  });

export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    application_status: z.enum(APPLICATION_STATUS_ENUM).optional(),
    document_status: z.string().optional(),
    form_status: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin"]);
    const { id, ...patch } = data;

    const { data: prev } = await (await getAdmin())
      .from("applications")
      .select("*")
      .eq("id", id)
      .single();

    const { error } = await (await getAdmin())
      .from("applications")
      .update(patch)
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAudit({
      supabase: context.supabase,
      entityType: "application",
      entityId: id,
      action: "update_application",
      oldValue: prev,
      newValue: { ...prev, ...patch },
      actorId: context.userId,
    });

    return { ok: true };
  });

export const getApplicationCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "support"]);
    const admin = await getAdmin();
    const { data, error } = await admin.from("applications").select("application_status");
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = { all: data.length };
    for (const r of data) counts[r.application_status] = (counts[r.application_status] ?? 0) + 1;
    return { counts };
  });
