import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    actorEmail: z.string().optional(),
    limit: z.number().default(200),
  }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    let q = (await getAdmin()).from("audit_logs").select("*").order("created_at", { ascending: false });
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.actorEmail) q = q.ilike("actor_email", `%${data.actorEmail}%`);
    const { data: rows, error } = await q.limit(Math.min(data.limit, 1000));
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
