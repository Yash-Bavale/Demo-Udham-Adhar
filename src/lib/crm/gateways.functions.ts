import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


async function requireSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isSuper = (data ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (!isSuper) throw new Error("Forbidden");
}

export const listGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { data, error } = await (await getAdmin())
      .from("payment_gateways")
      .select("*")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  is_enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export const updateGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { data: prev } = await (await getAdmin())
      .from("payment_gateways").select("*").eq("id", id).single();
    const { error } = await (await getAdmin())
      .from("payment_gateways").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase,
      actorId: context.userId,
      entityType: "payment_gateway",
      entityId: id,
      action: "update",
      oldValue: prev ?? null,
      newValue: { ...prev, ...patch },
    });
    return { ok: true };
  });
