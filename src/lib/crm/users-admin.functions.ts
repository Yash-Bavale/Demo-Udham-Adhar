// Admin-only user/workforce management.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ASSIGNABLE_ROLES, type Role } from "@/lib/roles";
import {
  type EmploymentStatus,
  type WorkSchedule,
  calculateStaffWorkloads,
  reassignOrdersFromUnavailableEmployee,
} from "./assignment-engine.server";

const ROLE_VALUES = ASSIGNABLE_ROLES as unknown as [string, ...string[]];

const EMPLOYMENT_STATUS_VALUES = ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED", "ARCHIVED"] as const;

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function assertAdmin(userId: string) {
  const { data, error } = await (await getAdmin())
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin access required.");
}

/**
 * Lists all staff users with complete employment lifecycle, workload, capacity, presence, and performance metadata.
 * Uses public.profiles and public.user_roles as the primary workforce directory source.
 */
export const listStaffUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();
    const adminAny = admin as any;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    // Query profiles and operational data concurrently
    const [
      { data: roles, error: rErr },
      { data: profiles, error: pErr },
      { data: poolRows, error: poolErr },
      { data: leavesRows, error: lErr },
      { data: leadsAssigned, error: laErr },
      { data: appsAssigned, error: aaErr },
      { data: appsCompletedMonth, error: cmErr },
      { data: appsCompletedAll, error: caErr },
    ] = await Promise.all([
      admin.from("user_roles").select("user_id, role"),
      adminAny.from("profiles").select("*"),
      admin.from("assignment_pool").select("user_id, is_active, total_assigned, last_assigned_at"),
      adminAny.from("employee_leaves").select("employee_id, start_time, end_time, status, reason, leave_type").eq("status", "ACTIVE"),
      admin.from("leads").select("assigned_to, status, created_at, updated_at"),
      admin.from("applications").select("assigned_to, application_status, fulfillment_status"),
      admin
        .from("applications")
        .select("assigned_to, updated_at, application_status")
        .eq("application_status", "completed")
        .gte("updated_at", monthStartIso),
      admin
        .from("applications")
        .select("assigned_to, created_at, updated_at, application_status")
        .eq("application_status", "completed"),
    ]);

    if (rErr) throw new Error(rErr.message);
    if (pErr) throw new Error(pErr.message);

    // Optional auth metadata lookup (non-blocking)
    const authUserMap = new Map<string, any>();
    try {
      const { data: usersRes } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 500,
      });
      (usersRes?.users ?? []).forEach((u) => authUserMap.set(u.id, u));
    } catch (authErr) {
      console.warn("[listStaffUsers] auth.admin.listUsers failed, falling back to profile records:", authErr);
    }

    const roleMap = new Map<string, string[]>();
    const staffRoleUserIds = new Set<string>();
    (roles ?? []).forEach((r) => {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role as string);
      roleMap.set(r.user_id, list);
      staffRoleUserIds.add(r.user_id);
    });

    const poolMap = new Map<string, any>();
    (poolRows ?? []).forEach((ap: any) => poolMap.set(ap.user_id, ap));

    const nowIso = new Date().toISOString();
    const activeLeavesMap = new Map<string, any>();
    (leavesRows ?? []).forEach((lv: any) => {
      if (lv.start_time <= nowIso && lv.end_time >= nowIso) {
        activeLeavesMap.set(lv.employee_id, lv);
      }
    });

    // Performance aggregates keyed by user_id
    type Perf = {
      assignedLeads: number;
      openLeads: number;
      assignedApps: number;
      openApps: number;
      completedThisMonth: number;
      avgTurnaroundHours: number | null;
    };
    const perf = new Map<string, Perf>();
    const ensure = (id: string): Perf => {
      let p = perf.get(id);
      if (!p) {
        p = { assignedLeads: 0, openLeads: 0, assignedApps: 0, openApps: 0, completedThisMonth: 0, avgTurnaroundHours: null };
        perf.set(id, p);
      }
      return p;
    };
    const OPEN_LEAD = new Set(["new", "lead_received", "documents_pending", "under_process", "under_review"]);
    const OPEN_APP = new Set(["details_pending", "documents_pending", "under_review", "under_process", "awaiting_payment", "payment_done", "form_submitted"]);

    (leadsAssigned ?? []).forEach((l) => {
      if (!l.assigned_to) return;
      const p = ensure(l.assigned_to);
      p.assignedLeads += 1;
      if (OPEN_LEAD.has(String(l.status ?? ""))) p.openLeads += 1;
    });
    (appsAssigned ?? []).forEach((a) => {
      if (!a.assigned_to) return;
      const p = ensure(a.assigned_to);
      p.assignedApps += 1;
      if (OPEN_APP.has(String(a.application_status ?? "")) || OPEN_APP.has(String(a.fulfillment_status ?? ""))) {
        p.openApps += 1;
      }
    });
    (appsCompletedMonth ?? []).forEach((a) => {
      if (!a.assigned_to) return;
      ensure(a.assigned_to).completedThisMonth += 1;
    });

    const turnaroundAgg = new Map<string, { sum: number; n: number }>();
    (appsCompletedAll ?? []).forEach((a) => {
      if (!a.assigned_to || !a.created_at || !a.updated_at) return;
      const ms = new Date(a.updated_at).getTime() - new Date(a.created_at).getTime();
      if (!Number.isFinite(ms) || ms < 0) return;
      const cur = turnaroundAgg.get(a.assigned_to) ?? { sum: 0, n: 0 };
      cur.sum += ms / 3_600_000;
      cur.n += 1;
      turnaroundAgg.set(a.assigned_to, cur);
    });
    turnaroundAgg.forEach((v, id) => {
      const p = ensure(id);
      p.avgTurnaroundHours = v.n ? Math.round((v.sum / v.n) * 10) / 10 : null;
    });

    // Determine target profiles: Include profiles with user_roles or profiles in assignment pool/all active profiles
    const targetProfiles = (profiles ?? []).filter((p: any) => {
      if (!p.id) return false;
      if (staffRoleUserIds.size > 0 && staffRoleUserIds.has(p.id)) return true;
      if (poolMap.has(p.id)) return true;
      // Also include any profile if roles table has not been fully mapped
      return staffRoleUserIds.size === 0;
    });

    const rows = targetProfiles.map((p: any) => {
      const uid = p.id;
      const uAuth = authUserMap.get(uid);
      const pool = poolMap.get(uid);
      const leave = activeLeavesMap.get(uid);
      const stats = perf.get(uid) ?? {
        assignedLeads: 0,
        openLeads: 0,
        assignedApps: 0,
        openApps: 0,
        completedThisMonth: 0,
        avgTurnaroundHours: null,
      };

      let employmentStatus: EmploymentStatus =
        p?.employment_status ?? (p?.is_active === false ? "INACTIVE" : "ACTIVE");

      // Auto-heal inconsistent state: if is_active is true, employment_status cannot remain ARCHIVED or INACTIVE
      if (p?.is_active === true && (employmentStatus === "ARCHIVED" || employmentStatus === "INACTIVE")) {
        employmentStatus = "ACTIVE";
        adminAny.from("profiles").update({ employment_status: "ACTIVE", archived_at: null }).eq("id", uid).then();
      }

      const isActive = p?.is_active !== false && employmentStatus === "ACTIVE";
      const isInPool = pool?.is_active ?? false;
      const autoAssignEnabled = isInPool;
      const maxWorkload = Number(p?.max_workload || 50);

      const resolvedName = p?.full_name?.trim() || p?.display_name?.trim() || null;

      return {
        id: uid,
        email: p?.email || uAuth?.email || "",
        full_name: resolvedName,
        mobile: p?.mobile ?? null,
        smartflo_agent_id: p?.smartflo_agent_id ?? null,
        is_active: isActive,
        employment_status: employmentStatus,
        auto_assign_enabled: autoAssignEnabled,
        is_in_pool: isInPool,
        max_workload: maxWorkload,
        work_schedule: (p?.work_schedule as WorkSchedule) || null,
        is_on_leave: !!leave,
        active_leave: leave ? { leave_type: leave.leave_type, reason: leave.reason, start_time: leave.start_time, end_time: leave.end_time } : null,
        created_at: uAuth?.created_at || p?.created_at || new Date().toISOString(),
        last_sign_in_at: uAuth?.last_sign_in_at || null,
        archived_at: p?.archived_at ?? null,
        terminated_at: p?.terminated_at ?? null,
        roles: roleMap.get(uid) ?? [],
        employee_code: p?.employee_code ?? null,
        department: p?.department ?? null,
        joining_date: p?.joining_date ?? null,
        perf: stats,
      };
    });

    return { rows };
  });

/**
 * SuperAdmin Workforce Management Live Dashboard Metrics
 */
export const getWorkforceDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const workloads = await calculateStaffWorkloads();
    const admin = await getAdmin();
    const adminAny = admin as any;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [todayAssignedRes, todayReassignedRes, unassignedRes] = await Promise.all([
      adminAny
        .from("order_assignment_history")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso)
        .in("change_type", ["AUTO_INITIAL_POOL"]),
      adminAny
        .from("order_assignment_history")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso)
        .in("change_type", ["AUTO_LEAVE", "AUTO_UNAVAILABLE", "AUTO_INACTIVITY", "AUTO_OFFLINE", "AUTO_CAPACITY", "AUTO_TERMINATED", "AUTO_DISABLED"]),
      admin
        .from("applications")
        .select("id", { count: "exact", head: true })
        .is("assigned_to", null)
        .eq("is_deleted", false)
        .not("fulfillment_status", "in", '("completed","order_completed","order_closed","cancelled")'),
    ]);

    const totalEmployees = workloads.length;
    const activeEmployees = workloads.filter((w) => w.employmentStatus === "ACTIVE").length;
    const onLeaveEmployees = workloads.filter((w) => w.presenceStatus === "ON_LEAVE").length;
    const availableEmployees = workloads.filter((w) => w.presenceStatus === "AVAILABLE").length;
    const idleEmployees = workloads.filter((w) => w.presenceStatus === "IDLE").length;
    const awayEmployees = workloads.filter((w) => w.presenceStatus === "AWAY").length;
    const offlineEmployees = workloads.filter((w) => w.presenceStatus === "OFFLINE").length;
    const inactiveEmployees = workloads.filter((w) => w.employmentStatus !== "ACTIVE").length;

    const poolMembers = workloads.filter((w) => w.isAutoAssignEligible || w.employmentStatus === "ACTIVE").length;
    const poolAvailable = workloads.filter((w) => w.isAutoAssignEligible).length;
    const poolUnavailable = poolMembers - poolAvailable;

    const totalCapacity = workloads.reduce((sum, w) => sum + (w.employmentStatus === "ACTIVE" ? w.maxWorkload : 0), 0);
    const usedCapacity = workloads.reduce((sum, w) => sum + (w.employmentStatus === "ACTIVE" ? w.activeActionOrders : 0), 0);

    return {
      workforce: {
        total: totalEmployees,
        active: activeEmployees,
        onLeave: onLeaveEmployees,
        available: availableEmployees,
        idle: idleEmployees,
        away: awayEmployees,
        offline: offlineEmployees,
        inactive: inactiveEmployees,
      },
      pool: {
        totalMembers: poolMembers,
        available: poolAvailable,
        unavailable: poolUnavailable,
        totalCapacity,
        usedCapacity,
        remainingCapacity: Math.max(0, totalCapacity - usedCapacity),
      },
      today: {
        autoAssignedToday: todayAssignedRes.count ?? 0,
        autoReassignedToday: todayReassignedRes.count ?? 0,
        unassignedOrders: unassignedRes.count ?? 0,
      },
      workloads,
    };
  });

const InviteInput = z.object({
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  mobile: z.string().trim().max(20).optional().nullable(),
  smartflo_agent_id: z.string().trim().max(100).optional().nullable(),
  role: z.enum(ROLE_VALUES),
  department: z.string().trim().max(120).optional().nullable(),
  max_workload: z.number().int().min(5).max(200).default(50),
  auto_assign_enabled: z.boolean().default(false), // New employees default to OFF per spec!
  password: z.string().min(8).max(72).optional(),
});

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!9";
}

/**
 * Creates a new employee with explicit lifecycle fields, defaulting Auto Assignment to OFF.
 */
export const inviteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InviteInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();

    const tempPassword = data.password ?? generateTempPassword();
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: data.full_name },
    });
    if (cErr) throw new Error(cErr.message);
    const newUser = created.user;
    if (!newUser) throw new Error("User creation did not return a user.");

    // Upsert profile
    const { error: pErr } = await (admin as any).from("profiles").upsert({
      id: newUser.id,
      email: data.email,
      display_name: data.full_name,
      full_name: data.full_name,
      mobile: data.mobile ?? null,
      smartflo_agent_id: data.smartflo_agent_id ? data.smartflo_agent_id.trim() : null,
      is_active: true,
    }, { onConflict: "id" });
    if (pErr) throw new Error(pErr.message);

    // Create entry in assignment_pool
    await admin.from("assignment_pool").upsert({
      user_id: newUser.id,
      is_active: data.auto_assign_enabled ?? false,
    } as any, { onConflict: "user_id" });

    // Grant role
    const { error: rErr } = await admin.from("user_roles").upsert(
      { user_id: newUser.id, role: data.role as Role },
      { onConflict: "user_id,role" },
    );
    if (rErr) throw new Error(rErr.message);

    return { ok: true, user_id: newUser.id, email: data.email, temp_password: tempPassword };
  });

const UpdateInput = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(120).optional(),
  mobile: z.string().trim().max(20).optional().nullable(),
  smartflo_agent_id: z.string().trim().max(100).optional().nullable(),
  role: z.enum(ROLE_VALUES).optional(),
  department: z.string().trim().max(120).optional().nullable(),
  joining_date: z.string().trim().max(20).optional().nullable(),
  max_workload: z.number().int().min(5).max(200).optional(),
  auto_assign_enabled: z.boolean().optional(),
});

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();
    const patch: any = {};
    if (data.full_name !== undefined) {
      patch.full_name = data.full_name;
      patch.display_name = data.full_name;
    }
    if (data.mobile !== undefined) patch.mobile = data.mobile;
    if (data.smartflo_agent_id !== undefined) {
      patch.smartflo_agent_id = data.smartflo_agent_id ? data.smartflo_agent_id.trim() : null;
    }

    if (Object.keys(patch).length) {
      const { error } = await admin.from("profiles").update(patch).eq("id", data.user_id);
      if (error) console.warn("[updateEmployee] profile update notice:", error.message);
    }

    if (data.auto_assign_enabled !== undefined) {
      const { data: existingPool } = await admin
        .from("assignment_pool")
        .select("id")
        .eq("user_id", data.user_id)
        .limit(1);

      if (existingPool && existingPool.length > 0) {
        await admin
          .from("assignment_pool")
          .update({ is_active: data.auto_assign_enabled })
          .eq("user_id", data.user_id);
      } else {
        await admin
          .from("assignment_pool")
          .insert({ user_id: data.user_id, is_active: data.auto_assign_enabled } as any);
      }
      await (admin.from("profiles") as any).update({ auto_assign_enabled: data.auto_assign_enabled }).eq("id", data.user_id);
    }

    if (data.role) {
      const { error: dErr } = await admin.from("user_roles").delete().eq("user_id", data.user_id);
      if (dErr) throw new Error(dErr.message);
      const { error: iErr } = await admin.from("user_roles").insert({ user_id: data.user_id, role: data.role as Role });
      if (iErr) throw new Error(iErr.message);
    }
    return { ok: true };
  });

/**
 * SuperAdmin Employment Status Lifecycle Controller
 */
const EmploymentStatusInput = z.object({
  user_id: z.string().uuid(),
  status: z.enum(EMPLOYMENT_STATUS_VALUES),
  reason: z.string().optional(),
});

export const setEmploymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EmploymentStatusInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();

    const isNowActive = data.status === "ACTIVE";
    const nowIso = new Date().toISOString();

    // 1. Update profile is_active, employment_status, and lifecycle timestamps
    const profilePatch: Record<string, any> = {
      is_active: isNowActive,
      employment_status: data.status,
    };

    if (isNowActive) {
      profilePatch.archived_at = null;
      profilePatch.terminated_at = null;
    } else if (data.status === "ARCHIVED") {
      profilePatch.archived_at = nowIso;
    } else if (data.status === "TERMINATED") {
      profilePatch.terminated_at = nowIso;
    }

    try {
      const { error: pErr } = await (admin.from("profiles") as any)
        .update(profilePatch)
        .eq("id", data.user_id);
      if (pErr) {
        console.warn("[setEmploymentStatus] Full profile update warning, falling back to basic:", pErr.message);
        await admin.from("profiles").update({ is_active: isNowActive, employment_status: data.status } as any).eq("id", data.user_id);
      }
    } catch (err) {
      console.warn("[setEmploymentStatus] Profile update exception, falling back:", err);
      await admin.from("profiles").update({ is_active: isNowActive }).eq("id", data.user_id);
    }

    // 2. Sync auth ban (unban when active, ban when inactive/archived/terminated)
    try {
      await admin.auth.admin.updateUserById(data.user_id, {
        ban_duration: isNowActive ? "none" : "876000h",
      } as never);
    } catch (authErr) {
      console.warn("[setEmploymentStatus] Auth updateUserById notice:", authErr);
    }

    // 3. Sync assignment_pool and user_roles
    if (isNowActive) {
      // Ensure restored employee has an assignment_pool row
      try {
        const { data: existingPool } = await admin
          .from("assignment_pool")
          .select("id")
          .eq("user_id", data.user_id)
          .maybeSingle();

        if (!existingPool) {
          await admin.from("assignment_pool").insert({
            user_id: data.user_id,
            is_active: false,
          } as any);
        }
      } catch (poolErr) {
        console.warn("[setEmploymentStatus] assignment_pool ensure notice:", poolErr);
      }

      // Ensure employee has a role in user_roles so they appear in staff directories
      try {
        const { data: userRoles } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user_id);

        if (!userRoles || userRoles.length === 0) {
          await admin.from("user_roles").insert({
            user_id: data.user_id,
            role: "executive" as Role,
          });
        }
      } catch (rErr) {
        console.warn("[setEmploymentStatus] user_roles ensure notice:", rErr);
      }
    } else {
      // Immediately end every CRM session and sign the account out everywhere
      try {
        await admin.rpc("admin_force_logout_all_sessions", {
          p_employee_id: data.user_id,
          p_reason: `Employee status changed to ${data.status}`,
        } as never);
      } catch (sErr) {
        console.warn("[setEmploymentStatus] session termination notice:", sErr);
      }

      // Remove from assignment_pool table when deactivated/archived
      try {
        await admin.from("assignment_pool").delete().eq("user_id", data.user_id);
      } catch (poolErr) {
        console.warn("[setEmploymentStatus] assignment_pool removal notice:", poolErr);
      }

      // Automatically redistribute open action orders
      try {
        await reassignOrdersFromUnavailableEmployee({
          unavailableEmployeeId: data.user_id,
          reason: `Employee status changed to ${data.status} (${data.reason || "Administrative action"})`,
          changeType: data.status === "TERMINATED" ? "AUTO_TERMINATED" : "AUTO_DISABLED",
          actorId: context.userId,
        });
      } catch (err) {
        console.warn("[setEmploymentStatus] Auto-reassign warning:", err);
      }
    }

    return { ok: true };
  });

/**
 * SuperAdmin Auto-Assignment Toggle for an Employee
 */
export const toggleEmployeeAutoAssign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();

    // Update or insert assignment_pool table (authoritative source of pool state)
    const { data: existingPool } = await admin
      .from("assignment_pool")
      .select("id")
      .eq("user_id", data.user_id)
      .limit(1);

    if (existingPool && existingPool.length > 0) {
      const { error: poolErr } = await admin
        .from("assignment_pool")
        .update({ is_active: data.enabled })
        .eq("user_id", data.user_id);
      if (poolErr) throw new Error(poolErr.message);
    } else {
      const { error: poolErr } = await admin
        .from("assignment_pool")
        .insert({ user_id: data.user_id, is_active: data.enabled } as any);
      if (poolErr) throw new Error(poolErr.message);
    }

    // Keep profiles table auto_assign_enabled in sync
    await admin
      .from("profiles")
      .update({ auto_assign_enabled: data.enabled } as any)
      .eq("id", data.user_id);

    return { ok: true };
  });

/**
 * Safe Archiving Controller: Replaces destructive deletion with historical archiving.
 */
export const archiveEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), reason: z.string().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();

    if (data.user_id === context.userId) {
      throw new Error("You cannot archive your own account.");
    }

    const nowIso = new Date().toISOString();

    // 1. Mark profile is_active false and employment_status ARCHIVED
    try {
      const { error: pErr } = await (admin.from("profiles") as any).update({
        is_active: false,
        employment_status: "ARCHIVED",
        archived_at: nowIso,
      }).eq("id", data.user_id);
      if (pErr) {
        await (admin.from("profiles") as any).update({ is_active: false }).eq("id", data.user_id);
      }
    } catch {
      await (admin.from("profiles") as any).update({ is_active: false }).eq("id", data.user_id);
    }

    // 2. Remove from assignment pool
    try {
      await admin.from("assignment_pool").delete().eq("user_id", data.user_id);
    } catch (e) {
      console.warn("[archiveEmployee] assignment_pool removal warning:", e);
    }

    // 3. Suspend auth login
    try {
      await admin.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h" } as never);
    } catch (e) {
      console.warn("[archiveEmployee] updateUserById warning:", e);
    }

    // 4. Automatically redistribute action-required orders
    try {
      await reassignOrdersFromUnavailableEmployee({
        unavailableEmployeeId: data.user_id,
        reason: `Employee archived by administrator (${data.reason || "Staff departure"})`,
        changeType: "AUTO_TERMINATED",
        actorId: context.userId,
      });
    } catch (err) {
      console.warn("[archiveEmployee] Auto-reassign warning:", err);
    }

    return { ok: true };
  });

/**
 * Safe Delete: If user has ZERO historical data, allow permanent deletion.
 * If user has historical records, gracefully archives them instead to protect historical foreign keys.
 */
export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();

    if (data.user_id === context.userId) {
      throw new Error("You cannot delete your own account.");
    }

    // Check if user has ANY historical records in applications, leads, or history
    const [appCount, leadCount, historyCount] = await Promise.all([
      admin.from("applications").select("id", { count: "exact", head: true }).eq("assigned_to", data.user_id),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("assigned_to", data.user_id),
      (admin as any).from("order_assignment_history").select("id", { count: "exact", head: true }).or(`new_employee_id.eq.${data.user_id},previous_employee_id.eq.${data.user_id}`),
    ]);

    const totalRefs = (appCount.count ?? 0) + (leadCount.count ?? 0) + (historyCount.count ?? 0);

    if (totalRefs > 0) {
      const nowIso = new Date().toISOString();
      // User has historical records. Do NOT destructively delete! Safely archive instead.
      try {
        const { error: pErr } = await (admin.from("profiles") as any).update({
          is_active: false,
          employment_status: "ARCHIVED",
          archived_at: nowIso,
        }).eq("id", data.user_id);
        if (pErr) {
          await (admin.from("profiles") as any).update({ is_active: false }).eq("id", data.user_id);
        }
      } catch {
        await (admin.from("profiles") as any).update({ is_active: false }).eq("id", data.user_id);
      }

      try {
        await admin.from("assignment_pool").delete().eq("user_id", data.user_id);
      } catch (e) {
        console.warn("[deleteEmployee] assignment_pool removal warning:", e);
      }

      try {
        await admin.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h" } as never);
      } catch (e) {
        console.warn("[deleteEmployee] updateUserById warning:", e);
      }

      try {
        await reassignOrdersFromUnavailableEmployee({
          unavailableEmployeeId: data.user_id,
          reason: "Employee archived to preserve historical order records",
          changeType: "AUTO_TERMINATED",
          actorId: context.userId,
        });
      } catch (err) {
        console.warn("[deleteEmployee] Auto-reassign warning:", err);
      }

      return { ok: true, mode: "archived", message: "Employee had historical orders and was securely archived instead of deleted." };
    }

    // Fresh user with 0 historical associations — safe to hard-delete
    await Promise.all([
      admin.from("user_permissions").delete().eq("user_id", data.user_id),
      admin.from("user_permission_scopes").delete().eq("user_id", data.user_id),
      admin.from("user_roles").delete().eq("user_id", data.user_id),
      admin.from("assignment_pool").delete().eq("user_id", data.user_id),
      admin.from("profiles").delete().eq("id", data.user_id),
    ]);

    const { error: dErr } = await admin.auth.admin.deleteUser(data.user_id);
    if (dErr) throw new Error(dErr.message);

    return { ok: true, mode: "deleted" };
  });

export const setEmployeeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), is_active: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    return setEmploymentStatus({
      data: {
        user_id: data.user_id,
        status: data.is_active ? "ACTIVE" : "INACTIVE",
        reason: data.is_active ? "Account activated" : "Account deactivated",
      },
    });
  });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), new_password: z.string().min(8).max(72) }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: roles, error: rErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "super_admin");
    if (rErr) throw new Error(rErr.message);
    if (!roles || roles.length === 0) throw new Error("Forbidden: super_admin only.");

    const { error: uErr } = await admin.auth.admin.updateUserById(data.user_id, {
      password: data.new_password,
    });
    if (uErr) throw new Error(uErr.message);

    return { ok: true };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), role: z.enum(ROLE_VALUES) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (await getAdmin())
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role as Role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), role: z.enum(ROLE_VALUES) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (await getAdmin())
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role as Role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const WORK_MODULES = ["work.leads", "work.orders", "work.support", "work.finance"] as const;

export const getEmployeeWorkAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();
    const [perms, scopes, ws, svcs] = await Promise.all([
      admin.from("user_permissions").select("module_key, can_view").eq("user_id", data.user_id).in("module_key", WORK_MODULES as unknown as string[]),
      admin.from("user_permission_scopes").select("module_key, website_id, service_id").eq("user_id", data.user_id).in("module_key", WORK_MODULES as unknown as string[]),
      admin.from("websites").select("id, name, domain, is_active").order("sort_order", { ascending: true }),
      admin.from("services").select("id, service_code, service_name, website_id, is_active").order("sort_order", { ascending: true }),
    ]);
    const permMap: Record<string, boolean> = {};
    for (const m of WORK_MODULES) permMap[m] = false;
    (perms.data ?? []).forEach((p: any) => { permMap[p.module_key] = !!p.can_view; });
    const websiteScopes: Record<string, string[]> = {};
    const serviceScopes: Record<string, string[]> = {};
    for (const m of WORK_MODULES) { websiteScopes[m] = []; serviceScopes[m] = []; }
    (scopes.data ?? []).forEach((s: any) => {
      if (s.website_id) websiteScopes[s.module_key]?.push(s.website_id);
      if (s.service_id) serviceScopes[s.module_key]?.push(s.service_id);
    });
    return {
      permissions: permMap,
      websiteScopes,
      serviceScopes,
      websites: ws.data ?? [],
      services: svcs.data ?? [],
    };
  });

export const setEmployeeWorkAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      work: z.object({
        "work.leads": z.boolean().default(false),
        "work.orders": z.boolean().default(false),
        "work.support": z.boolean().default(false),
        "work.finance": z.boolean().default(false),
      }),
      websites: z.array(z.string().uuid()).default([]),
      services: z.array(z.string().uuid()).default([]),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();
    const MODULE_KEY_PAIRS: Record<string, string[]> = {
      "work.leads": ["work.leads", "leads"],
      "work.orders": ["work.orders", "orders"],
      "work.support": ["work.support", "support", "tickets", "complaints"],
      "work.finance": ["work.finance", "finance", "payments", "invoices"],
    };

    const allKeysToReset: string[] = [];
    for (const m of WORK_MODULES) {
      const can = !!data.work[m];
      const keysToSync = MODULE_KEY_PAIRS[m] || [m];
      for (const k of keysToSync) {
        allKeysToReset.push(k);
        await admin.from("user_permissions").upsert({
          user_id: data.user_id,
          module_key: k,
          can_view: can,
          can_create: false,
          can_edit: false,
          can_delete: false,
          scope_all: data.websites.length === 0 && data.services.length === 0,
        }, { onConflict: "user_id,module_key" });
      }
    }

    await admin.from("user_permission_scopes")
      .delete()
      .eq("user_id", data.user_id)
      .in("module_key", allKeysToReset as never);

    const rows: Array<{ user_id: string; module_key: string; website_id?: string; service_id?: string }> = [];
    for (const m of WORK_MODULES) {
      if (!data.work[m]) continue;
      const keysToSync = MODULE_KEY_PAIRS[m] || [m];
      for (const k of keysToSync) {
        for (const w of data.websites) rows.push({ user_id: data.user_id, module_key: k, website_id: w });
        for (const s of data.services) rows.push({ user_id: data.user_id, module_key: k, service_id: s });
      }
    }
    if (rows.length) {
      await admin.from("user_permission_scopes").insert(rows as never);
    }
    return { ok: true };
  });

export const getMyStaffRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const admin = await getAdmin();
    const [{ data, error }, { data: prof }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      (admin as any)
        .from("profiles")
        .select("display_name, full_name, role")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);

    const rolesSet = new Set<string>((data ?? []).map((r: any) => r.role as string));
    if (prof?.role) {
      rolesSet.add(prof.role);
    }
    return {
      userId,
      roles: Array.from(rolesSet),
      displayName: (prof?.display_name || prof?.full_name || null) as string | null,
    };
  });
