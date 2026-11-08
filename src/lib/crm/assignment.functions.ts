import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function assertAdmin(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

export const getAssignmentConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("lead_assignment_config")
      .select("*")
      .is("service_id", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { config: data };
  });

export const setAutoAssignEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    const { error } = await admin
      .from("lead_assignment_config")
      .update({ is_active: data.enabled, updated_at: new Date().toISOString() } as never)
      .is("service_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAssignmentPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("assignment_pool")
      .select("id, user_id, service_id, is_active, last_assigned_at, total_assigned, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const svcIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.service_id).filter(Boolean))
    );

    const [{ data: profs }, { data: roleRows }, { data: svcs }] = await Promise.all([
      userIds.length
        ? admin.from("profiles").select("id, full_name, display_name, email, is_active, employment_status").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? admin.from("user_roles").select("user_id, role").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      svcIds.length
        ? admin.from("services").select("id, service_name").in("id", svcIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profMap = new Map<string, any>();
    (profs ?? []).forEach((p: any) => profMap.set(p.id, p));

    // Auto-clean any archived or inactive employees from assignment_pool immediately
    const staleUserIds = userIds.filter((uid) => {
      const p = profMap.get(uid);
      if (!p) return true;
      const status = String(p.employment_status || "").toUpperCase();
      return status === "ARCHIVED" || status === "TERMINATED" || p.is_active === false;
    });

    if (staleUserIds.length > 0) {
      try {
        await admin.from("assignment_pool").delete().in("user_id", staleUserIds);
      } catch (cleanupErr) {
        console.warn("[listAssignmentPool] stale pool cleanup notice:", cleanupErr);
      }
    }

    const nameMap = new Map<string, string>();
    (profs ?? []).forEach((p: any) =>
      nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff")
    );
    const roleMap = new Map<string, string[]>();
    (roleRows ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const svcMap = new Map<string, string>();
    (svcs ?? []).forEach((s: any) => svcMap.set(s.id, s.service_name));

    // Only return active, non-archived pool members
    const staleSet = new Set(staleUserIds);
    const validRows = (rows ?? []).filter((r: any) => !staleSet.has(r.user_id));

    return {
      rows: validRows.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: nameMap.get(r.user_id) ?? "Staff",
        user_roles: roleMap.get(r.user_id) ?? [],
        service_id: r.service_id,
        service_name: r.service_id ? svcMap.get(r.service_id) ?? "—" : "All Services",
        is_active: r.is_active,
        last_assigned_at: r.last_assigned_at,
        total_assigned: r.total_assigned,
      })),
    };
  });

export const listEligibleEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const admin = await getAdmin();
    const ORDER_ACCESS_ROLES = ["operations", "executive", "manager", "admin", "super_admin", "support"] as const;
    const { data: roleRows, error } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ORDER_ACCESS_ROLES);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return { rows: [] as { id: string; name: string; role: string }[] };
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name, display_name, email, is_active")
      .in("id", ids);
    const byId = new Map<string, any>();
    (profs ?? []).forEach((p: any) => byId.set(p.id, p));
    const roleById = new Map<string, string>();
    (roleRows ?? []).forEach((r: any) => {
      if (!roleById.has(r.user_id)) roleById.set(r.user_id, r.role);
    });
    return {
      rows: ids
        .map((id) => {
          const p = byId.get(id);
          if (!p || p.is_active === false) return null;
          return {
            id,
            name: p.full_name ?? p.display_name ?? p.email ?? "Staff",
            role: roleById.get(id) ?? "executive",
          };
        })
        .filter(Boolean) as { id: string; name: string; role: string }[],
    };
  });

export const addToPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        serviceId: z.string().uuid().nullable().optional(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    // verify role
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const ORDER_ACCESS_ROLES = ["operations", "executive", "manager", "admin", "super_admin", "support"];
    const okRoles = (roles ?? []).some((r: any) =>
      ORDER_ACCESS_ROLES.includes(r.role)
    );
    if (!okRoles) throw new Error("Only employees with order access roles can be added to the pool.");
    const { error } = await admin
      .from("assignment_pool")
      .insert({
        user_id: data.userId,
        service_id: data.serviceId ?? null,
        is_active: true,
      } as never);
    if (error) {
      if (error.code === "23505") throw new Error("This employee is already in the pool for this service.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const togglePoolActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    // 1. Fetch current pool row to find the user_id
    const { data: poolRow } = await admin
      .from("assignment_pool")
      .select("id, user_id")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await admin
      .from("assignment_pool")
      .update({ is_active: data.isActive } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // 2. Synchronize profiles.auto_assign_enabled with pool active status
    if (poolRow?.user_id) {
      if (!data.isActive) {
        // If toggled OFF, verify if employee has any other active pool entry
        const { data: otherActive } = await admin
          .from("assignment_pool")
          .select("id")
          .eq("user_id", poolRow.user_id)
          .eq("is_active", true)
          .neq("id", data.id)
          .limit(1);

        if (!otherActive || otherActive.length === 0) {
          await (admin.from("profiles") as any)
            .update({ auto_assign_enabled: false })
            .eq("id", poolRow.user_id);
        }
      } else {
        await (admin.from("profiles") as any)
          .update({ auto_assign_enabled: true })
          .eq("id", poolRow.user_id);
      }
    }

    return { ok: true };
  });

export const removeFromPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    const { data: poolRow } = await admin
      .from("assignment_pool")
      .select("id, user_id")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await admin.from("assignment_pool").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    // If no remaining active pool rows, set auto_assign_enabled to false
    if (poolRow?.user_id) {
      const { data: remaining } = await admin
        .from("assignment_pool")
        .select("id")
        .eq("user_id", poolRow.user_id)
        .eq("is_active", true)
        .limit(1);

      if (!remaining || remaining.length === 0) {
        await (admin.from("profiles") as any)
          .update({ auto_assign_enabled: false })
          .eq("id", poolRow.user_id);
      }
    }

    return { ok: true };
  });
