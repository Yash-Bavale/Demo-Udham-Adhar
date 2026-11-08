import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin as any;
}

async function verifyAdminOrSuperAdmin(supabase: any, userId?: string) {
  const admin = await getAdmin();
  let query = admin.from("user_roles").select("role");
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  const roles = new Set((data ?? []).map((r: any) => r.role));
  const isPrivileged =
    roles.has("admin") || roles.has("super_admin") || roles.has("manager");
  if (!isPrivileged)
    throw new Error("Unauthorized: Admin or Super Admin access required.");
  return true;
}

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                     */
/* -------------------------------------------------------------------------- */

export interface EmployeeSessionRecord {
  sessionId: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  avatarUrl?: string | null;
  loginTime: string;
  lastHeartbeat: string;
  lastActivityAt: string;
  activeDurationMinutes: number;
  idleDurationMinutes: number;
  awayDurationMinutes: number;
  presenceStatus: "ACTIVE" | "IDLE" | "AWAY" | "OFFLINE";
  currentPage: string;
  currentModule: string;
  currentOrderId: string | null;
  currentOrderCode: string | null;
  lastActionText: string;
  browser: string;
  os: string;
  deviceType: string;
  ipAddress: string;
  shiftId: string;
  terminated: boolean;
}

export interface WorkShift {
  id: string;
  name: string;
  code: string;
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
  lunchStart: string;// "13:00"
  lunchEnd: string;  // "14:00"
  graceMins: number; // 15
  isDefault: boolean;
  assignedUsers: string[];
}

export interface PresenceThresholds {
  idleThresholdMins: number;       // 5
  awayThresholdMins: number;       // 15
  heartbeatIntervalSeconds: number;// 30
  sessionTimeoutHours: number;     // 9
}

// Default shifts
let defaultShiftsConfig: WorkShift[] = [
  {
    id: "shift_alpha",
    name: "Shift Alpha (Morning)",
    code: "ALPHA",
    startTime: "09:00",
    endTime: "18:00",
    lunchStart: "13:00",
    lunchEnd: "14:00",
    graceMins: 15,
    isDefault: true,
    assignedUsers: [],
  },
  {
    id: "shift_beta",
    name: "Shift Beta (Afternoon)",
    code: "BETA",
    startTime: "13:00",
    endTime: "22:00",
    lunchStart: "17:00",
    lunchEnd: "18:00",
    graceMins: 15,
    isDefault: false,
    assignedUsers: [],
  },
  {
    id: "shift_general",
    name: "General Shift",
    code: "GEN",
    startTime: "10:00",
    endTime: "19:00",
    lunchStart: "13:30",
    lunchEnd: "14:30",
    graceMins: 15,
    isDefault: false,
    assignedUsers: [],
  },
];

let presenceThresholdsConfig: PresenceThresholds = {
  idleThresholdMins: 5,
  awayThresholdMins: 15,
  heartbeatIntervalSeconds: 30,
  sessionTimeoutHours: 9,
};

/* -------------------------------------------------------------------------- */
/*  1. RECORD HEARTBEAT (Database backed)                                     */
/* -------------------------------------------------------------------------- */

export const recordEmployeeHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        sessionId: z.string().min(1),
        presenceStatus: z.enum(["ACTIVE", "IDLE", "AWAY", "OFFLINE"]),
        currentPage: z.string().default("/admin"),
        currentModule: z.string().default("General"),
        currentOrderId: z.string().uuid().nullable().optional(),
        currentOrderCode: z.string().nullable().optional(),
        lastActionText: z.string().nullable().optional(),
        activeSecondsDelta: z.number().int().nonnegative().default(0),
        idleSecondsDelta: z.number().int().nonnegative().default(0),
        awaySecondsDelta: z.number().int().nonnegative().default(0),
        browser: z.string().default("Chrome"),
        os: z.string().default("Windows"),
        deviceType: z.string().default("Desktop"),
        ipAddress: z.string().default("103.21.58.92"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: res } = await admin.rpc("record_employee_heartbeat_v2", {
      p_session_id: data.sessionId,
      p_presence_status: data.presenceStatus,
      p_current_page: data.currentPage,
      p_current_module: data.currentModule,
      p_current_order_id: data.currentOrderId ?? null,
      p_current_order_code: data.currentOrderCode ?? null,
      p_last_action_text: data.lastActionText ?? null,
      p_active_seconds_delta: data.activeSecondsDelta,
      p_idle_seconds_delta: data.idleSecondsDelta,
      p_away_seconds_delta: data.awaySecondsDelta,
      p_browser: data.browser,
      p_os: data.os,
      p_device_type: data.deviceType,
      p_ip_address: data.ipAddress,
    });

    const typedRes = res as any;

    return {
      ok: typedRes?.ok ?? true,
      terminated: typedRes?.terminated ?? false,
      activeMinutes: Math.round((typedRes?.active_seconds || 0) / 60),
      idleMinutes: Math.round((typedRes?.idle_seconds || 0) / 60),
      awayMinutes: Math.round((typedRes?.away_seconds || 0) / 60),
      presenceStatus: (typedRes?.status?.toUpperCase() as any) || data.presenceStatus,
    };
  });

/* -------------------------------------------------------------------------- */
/*  2. GET ACTIVE SESSIONS (Admin / Superadmin, DB-backed)                     */
/* -------------------------------------------------------------------------- */

export interface GetActiveEmployeeSessionsResult {
  sessions: EmployeeSessionRecord[];
  totalCount: number;
  activeCount: number;
  idleCount: number;
  awayCount: number;
  offlineCount: number;
}

export const getActiveEmployeeSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GetActiveEmployeeSessionsResult> => {
    await verifyAdminOrSuperAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    const nowTime = Date.now();

    // Query staff user IDs
    const { data: staffRoles } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", [
        "operations",
        "support",
        "admin",
        "super_admin",
        "manager",
        "executive",
        "accounts",
      ]);

    const staffUserIds = Array.from(
      new Set((staffRoles ?? []).map((r: any) => String(r.user_id))),
    ) as string[];

    const [{ data: profiles }, { data: dbSessions }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, display_name, email, is_active")
        .in(
          "id",
          staffUserIds.length
            ? staffUserIds
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      admin
        .from("employee_sessions")
        .select("*")
        .order("last_heartbeat_at", { ascending: false })
        .limit(200),
    ]);

    const profileMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profileMap.set(String(p.id), p));

    const roleMap = new Map<string, string>();
    (staffRoles ?? []).forEach((r: any) => roleMap.set(String(r.user_id), r.role));

    // Map latest active session by employee
    const latestSessionByEmp = new Map<string, any>();
    (dbSessions ?? []).forEach((s: any) => {
      if (!latestSessionByEmp.has(String(s.employee_id))) {
        latestSessionByEmp.set(String(s.employee_id), s);
      }
    });

    const sessionsList: EmployeeSessionRecord[] = staffUserIds.map((uid) => {
      const p = profileMap.get(uid);
      const s = latestSessionByEmp.get(uid);
      const name =
        p?.full_name ||
        p?.display_name ||
        p?.email?.split("@")[0] ||
        "Staff";

      const assignedShift = defaultShiftsConfig.find(
        (sh) => sh.assignedUsers.includes(uid) || sh.isDefault,
      );

      let status: "ACTIVE" | "IDLE" | "AWAY" | "OFFLINE" = "OFFLINE";
      if (s && s.is_active && s.status !== "force_logged_out" && s.status !== "logged_out") {
        const lastHb = s.last_heartbeat_at || s.last_activity_at || s.login_at;
        const diffMs = nowTime - new Date(lastHb).getTime();
        if (diffMs > 10 * 60 * 1000) {
          status = "OFFLINE";
        } else if (diffMs > 8 * 60 * 1000 || s.status === "away") {
          status = "AWAY";
        } else if (diffMs > 5 * 60 * 1000 || s.status === "idle") {
          status = "IDLE";
        } else {
          status = "ACTIVE";
        }
      }

      return {
        sessionId: s?.session_id ? String(s.session_id) : `sess_${uid.slice(0, 8)}`,
        employeeId: uid,
        employeeName: name,
        employeeRole: roleMap.get(uid) || "operations",
        avatarUrl: null,
        loginTime: s?.login_at ? String(s.login_at) : new Date().toISOString(),
        lastHeartbeat: s?.last_heartbeat_at ? String(s.last_heartbeat_at) : new Date().toISOString(),
        lastActivityAt: s?.last_activity_at ? String(s.last_activity_at) : new Date().toISOString(),
        activeDurationMinutes: Math.round(((s?.active_seconds as number) || 0) / 60),
        idleDurationMinutes: Math.round(((s?.idle_seconds as number) || 0) / 60),
        awayDurationMinutes: Math.round(((s?.away_seconds as number) || 0) / 60),
        presenceStatus: status,
        currentPage: s?.current_page ? String(s.current_page) : "/admin",
        currentModule: s?.current_module ? String(s.current_module) : "General",
        currentOrderId: s?.current_order_id ? String(s.current_order_id) : null,
        currentOrderCode: s?.current_order_code ? String(s.current_order_code) : null,
        lastActionText: s?.last_action_text ? String(s.last_action_text) : (status === "ACTIVE" ? "Connected to CRM" : "No active session"),
        browser: s?.browser ? String(s.browser) : "Chrome",
        os: s?.operating_system ? String(s.operating_system) : "Windows",
        deviceType: s?.device_type ? String(s.device_type) : "Desktop",
        ipAddress: s?.ip_address ? String(s.ip_address) : "103.21.58.92",
        shiftId: assignedShift?.id || "shift_alpha",
        terminated: s?.status === "force_logged_out" || s?.is_active === false,
      };
    });

    return {
      sessions: sessionsList,
      totalCount: sessionsList.length,
      activeCount: sessionsList.filter((s) => s.presenceStatus === "ACTIVE").length,
      idleCount: sessionsList.filter((s) => s.presenceStatus === "IDLE").length,
      awayCount: sessionsList.filter((s) => s.presenceStatus === "AWAY").length,
      offlineCount: sessionsList.filter((s) => s.presenceStatus === "OFFLINE").length,
    };
  });

/* -------------------------------------------------------------------------- */
/*  3. TERMINATE SESSION (Force Logout, DB backed)                             */
/* -------------------------------------------------------------------------- */

export const terminateEmployeeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        sessionId: z.string().min(1),
        employeeId: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await verifyAdminOrSuperAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    if (data.employeeId) {
      try {
        const { error } = await admin.rpc("admin_force_logout_all_sessions", {
          p_employee_id: data.employeeId,
          p_reason: "Terminated by administrator",
        });
        if (error) throw error;
      } catch (e) {
        await admin
          .from("employee_sessions")
          .update({
            is_active: false,
            status: "force_logged_out",
            logout_at: new Date().toISOString(),
            logout_reason: "Terminated by administrator",
          })
          .eq("employee_id", data.employeeId)
          .eq("is_active", true);
      }
    } else {
      try {
        const { error } = await admin.rpc("admin_force_logout_session", {
          p_session_id: data.sessionId,
          p_reason: "Terminated by administrator",
        });
        if (error) throw error;
      } catch (e) {
        await admin
          .from("employee_sessions")
          .update({
            is_active: false,
            status: "force_logged_out",
            logout_at: new Date().toISOString(),
            logout_reason: "Terminated by administrator",
          })
          .eq("session_id", data.sessionId);
      }
    }

    return { ok: true, terminatedSessionId: data.sessionId };
  });

/* -------------------------------------------------------------------------- */
/*  4. GET & SAVE SHIFT SETTINGS                                              */
/* -------------------------------------------------------------------------- */

export const getShiftSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await verifyAdminOrSuperAdmin(context.supabase, context.userId);
    const admin = await getAdmin();

    const { data: staffRoles } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", [
        "operations",
        "support",
        "admin",
        "super_admin",
        "manager",
        "executive",
      ]);

    const staffUserIds = Array.from(
      new Set((staffRoles ?? []).map((r: any) => String(r.user_id))),
    ) as string[];

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, display_name, email")
      .in(
        "id",
        staffUserIds.length
          ? staffUserIds
          : ["00000000-0000-0000-0000-000000000000"],
      );

    const staffList = (profiles ?? []).map((p: any) => ({
      id: p.id,
      name: p.full_name || p.display_name || p.email?.split("@")[0] || "Staff",
      email: p.email,
    }));

    return {
      shifts: defaultShiftsConfig,
      thresholds: presenceThresholdsConfig,
      staffList,
    };
  });

export const saveShiftSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        shifts: z.array(
          z.object({
            id: z.string(),
            name: z.string().min(1),
            code: z.string().min(1),
            startTime: z.string().min(1),
            endTime: z.string().min(1),
            lunchStart: z.string().min(1),
            lunchEnd: z.string().min(1),
            graceMins: z.number().int().min(0).max(60).default(15),
            isDefault: z.boolean().default(false),
            assignedUsers: z.array(z.string()).default([]),
          }),
        ),
        thresholds: z.object({
          idleThresholdMins: z.number().int().min(1).max(60).default(5),
          awayThresholdMins: z.number().int().min(2).max(120).default(15),
          heartbeatIntervalSeconds: z.number().int().min(10).max(120).default(30),
          sessionTimeoutHours: z.number().int().min(1).max(24).default(9),
        }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await verifyAdminOrSuperAdmin(context.supabase, context.userId);
    defaultShiftsConfig = data.shifts;
    presenceThresholdsConfig = data.thresholds;
    return { ok: true, shifts: defaultShiftsConfig, thresholds: presenceThresholdsConfig };
  });

export function getEmployeePresenceState(employeeId: string) {
  const assignedShift = defaultShiftsConfig.find(
    (s) => s.assignedUsers.includes(employeeId) || s.isDefault,
  );

  return {
    session: null,
    shift: assignedShift || defaultShiftsConfig[0],
    thresholds: presenceThresholdsConfig,
  };
}
