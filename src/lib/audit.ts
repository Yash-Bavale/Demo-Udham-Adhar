import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../integrations/supabase/types";

export type AuditEntity =
  | "lead"
  | "application"
  | "payment"
  | "complaint"
  | "onboarding"
  | "document"
  | "certificate"
  | "payment_gateway"
  | "workflow_delay_reasons"
  | "workflow_closure_reasons"
  | "workflow_automation_rules";

export async function writeAudit(
  params: {
    supabase: SupabaseClient<Database>;
    entityType: AuditEntity;
    entityId: string;
    action: string;
    oldValue?: any;
    newValue?: any;
    actorId?: string;
    actorEmail?: string;
  }
) {
  const { data: { user } } = await params.supabase.auth.getUser();

  await params.supabase.from("audit_logs").insert({
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    old_value: params.oldValue,
    new_value: params.newValue,
    actor_id: params.actorId || user?.id,
    actor_email: params.actorEmail || user?.email,
  });
}

export async function assertRole(
  supabase: SupabaseClient<Database>,
  roles: Database["public"]["Enums"]["app_role"][]
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const checks = await Promise.all(
    roles.map((role) =>
      supabase.rpc("has_role", {
        _user_id: user.id,
        _role: role,
      })
    )
  );

  const hasRole = checks.some(({ data, error }) => !error && data === true);

  if (!hasRole) {
    throw new Error("Forbidden: You do not have permission to perform this action.");
  }

  return user;
}

export async function isUserAdmin(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  return roles.includes("super_admin") || roles.includes("admin");
}

