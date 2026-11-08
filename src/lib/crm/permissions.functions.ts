// Self-permissions: what the currently signed-in user is allowed to do.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { bestAccess, ALL_MODULES, type Module } from "@/lib/roles";

export type ModulePerm = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  scopeAll: boolean;
  scopes: Array<{ websiteId: string | null; categoryId: string | null; serviceId: string | null }>;
};

export type MyPermissions = {
  isAdmin: boolean;
  modules: Record<string, ModulePerm>;
};

export function getModuleAliases(key: string): string[] {
  if (key === "leads" || key === "work.leads") return ["leads", "work.leads"];
  if (key === "orders" || key === "work.orders") return ["orders", "work.orders"];
  if (key === "support" || key === "work.support" || key === "tickets" || key === "complaints") {
    return ["support", "work.support", "tickets", "complaints"];
  }
  if (key === "finance" || key === "work.finance" || key === "payments" || key === "invoices") {
    return ["finance", "work.finance", "payments", "invoices"];
  }
  return [key];
}

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyPermissions> => {
    const { userId } = context;
    const admin = await getAdmin();
    // Admin detection
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roleList = (roles ?? []).map((r: { role: string }) => r.role);
    const isAdmin = roleList.some((r: string) => r === "admin" || r === "super_admin");

    if (isAdmin) return { isAdmin: true, modules: {} };

    const [permsRes, scopesRes] = await Promise.all([
      admin
        .from("user_permissions")
        .select("module_key, can_view, can_create, can_edit, can_delete, scope_all")
        .eq("user_id", userId),
      admin
        .from("user_permission_scopes")
        .select("module_key, website_id, category_id, service_id")
        .eq("user_id", userId),
    ]);
    if (permsRes.error) throw new Error(permsRes.error.message);
    if (scopesRes.error) throw new Error(scopesRes.error.message);

    const modules: Record<string, ModulePerm> = {};
    const customPerms = permsRes.data ?? [];

    // 1. Initialize all standard modules with the user's role defaults
    for (const m of ALL_MODULES) {
      const acc = bestAccess(roleList, m);
      const canView = acc !== "none";
      const canEdit = acc === "full";
      const permObj: ModulePerm = {
        view: canView,
        create: canEdit,
        edit: canEdit,
        delete: false,
        scopeAll: true,
        scopes: [],
      };
      for (const alias of getModuleAliases(m)) {
        modules[alias] = { ...permObj, scopes: [] };
      }
    }

    // 2. Override with any custom user_permissions configured by admin
    for (const p of customPerms) {
      const effectiveView = !!p.can_view || !!p.can_create || !!p.can_edit;
      const permObj: ModulePerm = {
        view: effectiveView,
        create: !!p.can_create,
        edit: !!p.can_edit,
        delete: !!p.can_delete,
        scopeAll: !!p.scope_all,
        scopes: [],
      };
      for (const alias of getModuleAliases(p.module_key)) {
        modules[alias] = { ...permObj, scopes: [] };
      }
    }

    for (const s of scopesRes.data ?? []) {
      for (const alias of getModuleAliases(s.module_key)) {
        const m = modules[alias];
        if (!m) continue;
        m.scopes.push({
          websiteId: s.website_id ?? null,
          categoryId: s.category_id ?? null,
          serviceId: s.service_id ?? null,
        });
      }
    }
    return { isAdmin: false, modules };
  });

export async function getUserModulePermission(
  _supabase: any,
  userId: string,
  moduleKey: string
): Promise<{
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  scopeAll: boolean;
  scopes: Array<{ websiteId: string | null; categoryId: string | null; serviceId: string | null }>;
}> {
  const admin = await getAdmin();
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roleList = (roles ?? []).map((r: { role: string }) => r.role);
  const isAdmin = roleList.some((r: string) => r === "admin" || r === "super_admin");

  if (isAdmin) {
    return { canView: true, canCreate: true, canEdit: true, canDelete: true, scopeAll: true, scopes: [] };
  }

  const aliases = getModuleAliases(moduleKey);

  const [permRes, scopesRes] = await Promise.all([
    admin
      .from("user_permissions")
      .select("can_view, can_create, can_edit, can_delete, scope_all")
      .eq("user_id", userId)
      .in("module_key", aliases)
      .limit(1)
      .maybeSingle(),
    admin
      .from("user_permission_scopes")
      .select("website_id, category_id, service_id")
      .eq("user_id", userId)
      .in("module_key", aliases),
  ]);

  const perm = permRes.data;
  if (!perm) {
    const acc = bestAccess(roleList, moduleKey as Module);
    const canView = acc !== "none";
    const canEdit = acc === "full";
    return { canView, canCreate: canEdit, canEdit, canDelete: false, scopeAll: true, scopes: [] };
  }

  const scopes = (scopesRes.data ?? []).map((s: any) => ({
    websiteId: s.website_id ?? null,
    categoryId: s.category_id ?? null,
    serviceId: s.service_id ?? null,
  }));

  const effectiveView = !!perm.can_view || !!perm.can_create || !!perm.can_edit;
  return {
    canView: effectiveView,
    canCreate: !!perm.can_create,
    canEdit: !!perm.can_edit,
    canDelete: !!perm.can_delete,
    scopeAll: !!perm.scope_all,
    scopes,
  };
}
