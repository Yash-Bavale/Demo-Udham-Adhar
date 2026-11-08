// Admin-only: manage per-employee permissions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export const listPermissionModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("permission_modules")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const admin = await getAdmin();
    const [perms, scopes] = await Promise.all([
      admin
        .from("user_permissions")
        .select("*")
        .eq("user_id", data.userId),
      admin
        .from("user_permission_scopes")
        .select("*")
        .eq("user_id", data.userId),
    ]);
    if (perms.error) throw new Error(perms.error.message);
    if (scopes.error) throw new Error(scopes.error.message);
    return { permissions: perms.data ?? [], scopes: scopes.data ?? [] };
  });

const UpsertPermInput = z.object({
  userId: z.string().uuid(),
  moduleKey: z.string().min(1),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  scopeAll: z.boolean(),
});

export const upsertUserPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertPermInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const admin = await getAdmin();
    const effectiveCanView = data.canView || data.canCreate || data.canEdit;
    const { error } = await admin.from("user_permissions").upsert(
      {
        user_id: data.userId,
        module_key: data.moduleKey,
        can_view: effectiveCanView,
        can_create: data.canCreate,
        can_edit: data.canEdit,
        can_delete: data.canDelete,
        scope_all: data.scopeAll,
      },
      { onConflict: "user_id,module_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetScopesInput = z.object({
  userId: z.string().uuid(),
  moduleKey: z.string().min(1),
  scopes: z.array(
    z.object({
      websiteId: z.string().uuid().nullable().optional(),
      categoryId: z.string().uuid().nullable().optional(),
      serviceId: z.string().uuid().nullable().optional(),
    }),
  ),
});

export const setUserPermissionScopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetScopesInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const admin = await getAdmin();
    const { error: dErr } = await admin
      .from("user_permission_scopes")
      .delete()
      .eq("user_id", data.userId)
      .eq("module_key", data.moduleKey);
    if (dErr) throw new Error(dErr.message);
    if (data.scopes.length > 0) {
      const rows = data.scopes.map((s) => ({
        user_id: data.userId,
        module_key: data.moduleKey,
        website_id: s.websiteId ?? null,
        category_id: s.categoryId ?? null,
        service_id: s.serviceId ?? null,
      }));
      const { error } = await admin.from("user_permission_scopes").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const bulkResetUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userId: z.string().uuid(),
      grantAll: z.boolean().default(false),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const admin = await getAdmin();
    const { data: modules, error: mErr } = await admin
      .from("permission_modules")
      .select("key");
    if (mErr) throw new Error(mErr.message);
    const rows = (modules ?? []).map((m) => ({
      user_id: data.userId,
      module_key: m.key,
      can_view: data.grantAll,
      can_create: data.grantAll,
      can_edit: data.grantAll,
      can_delete: false,
      scope_all: true,
    }));
    const { error } = await admin
      .from("user_permissions")
      .upsert(rows, { onConflict: "user_id,module_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const admin = await getAdmin();
    await Promise.all([
      admin.from("user_permissions").delete().eq("user_id", data.userId),
      admin.from("user_permission_scopes").delete().eq("user_id", data.userId),
    ]);
    return { ok: true };
  });
