import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";
import { isTransitionAllowed } from "./status-engine";
import type { LeadStatus, ApplicationStatus } from "./types";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


async function getRoles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role);
}

export const transitionLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), to: z.string(), note: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const roles = await getRoles(context.supabase, user.id);
    const { data: prev } = await (await getAdmin()).from("leads").select("*").eq("id", data.id).single();
    if (!prev) throw new Error("Lead not found");
    if (!isTransitionAllowed("lead", prev.status, data.to, roles as any)) {
      throw new Error(`Transition ${prev.status} → ${data.to} not allowed for your role`);
    }
    const { error } = await (await getAdmin()).from("leads").update({ status: data.to as LeadStatus }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase, entityType: "lead", entityId: data.id,
      action: "status_transition", oldValue: { status: prev.status },
      newValue: { status: data.to, note: data.note }, actorId: user.id,
    });
    return { ok: true };
  });

export const transitionApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), to: z.string(), note: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const roles = await getRoles(context.supabase, user.id);
    const { data: prev } = await (await getAdmin()).from("applications").select("*").eq("id", data.id).single();
    if (!prev) throw new Error("Application not found");
    if (!isTransitionAllowed("application", prev.application_status, data.to, roles as any)) {
      throw new Error(`Transition ${prev.application_status} → ${data.to} not allowed for your role`);
    }
    const { error } = await (await getAdmin()).from("applications").update({ application_status: data.to as ApplicationStatus }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase, entityType: "application", entityId: data.id,
      action: "status_transition", oldValue: { application_status: prev.application_status },
      newValue: { application_status: data.to, note: data.note }, actorId: user.id,
    });
    return { ok: true };
  });

export const transitionComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), to: z.enum(["pending", "in_progress", "resolved", "closed"]), note: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const roles = await getRoles(context.supabase, user.id);
    const { data: prev } = await (await getAdmin()).from("complaints").select("*").eq("id", data.id).single();
    if (!prev) throw new Error("Complaint not found");
    if (!isTransitionAllowed("complaint", prev.status, data.to, roles as any)) {
      throw new Error(`Transition ${prev.status} → ${data.to} not allowed for your role`);
    }
    const patch: any = { status: data.to };
    if (data.to === "resolved" || data.to === "closed") patch.resolved_at = new Date().toISOString();
    const { error } = await (await getAdmin()).from("complaints").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase, entityType: "complaint", entityId: data.id,
      action: "status_transition", oldValue: { status: prev.status },
      newValue: { status: data.to, note: data.note }, actorId: user.id,
    });
    return { ok: true };
  });

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("user_roles").select("role");
    return { roles: (data ?? []).map((r: any) => r.role as string) };
  });
