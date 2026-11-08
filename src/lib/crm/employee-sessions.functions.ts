import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin as any;
}

function getClientIpFromRequest(): string | null {
  try {
    const req = getRequest();
    if (!req?.headers) return null;
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp) return cfIp.trim();
    return null;
  } catch {
    return null;
  }
}

async function verifyAdminOrSuperAdmin(userId: string) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  const isPrivileged =
    roles.has("admin") || roles.has("super_admin") || roles.has("manager");
  if (!isPrivileged)
    throw new Error("Unauthorized: Admin or Super Admin access required.");
  return true;
}

/* -------------------------------------------------------------------------- */
/*  1. RECORD HEARTBEAT                                                       */
/* -------------------------------------------------------------------------- */

export const recordHeartbeat = createServerFn({ method: "POST" })
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
        browserVersion: z.string().nullable().optional(),
        os: z.string().default("Windows"),
        deviceType: z.string().default("Desktop"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = context.userId;
    const clientIp = getClientIpFromRequest();
    const nowIso = new Date().toISOString();

    // 1. Try RPC execution first
    try {
      const { data: res, error } = await admin.rpc("record_employee_heartbeat_v2", {
        p_employee_id: userId,
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
        p_browser_version: data.browserVersion ?? null,
        p_os: data.os,
        p_device_type: data.deviceType,
        p_ip_address: clientIp,
      });

      if (!error && res && res.ok !== false) {
        return res as {
          ok: boolean;
          terminated: boolean;
          logout_reason?: string;
          active_seconds?: number;
          idle_seconds?: number;
          away_seconds?: number;
          status?: string;
        };
      }
      if (error) {
        console.warn("[recordHeartbeat] RPC notice, falling back to direct table update:", error.message);
      }
    } catch (rpcErr) {
      console.warn("[recordHeartbeat] RPC exception, using direct table update:", rpcErr);
    }

    // 2. Direct PostgreSQL fallback on employee_sessions table
    const { data: existingSess } = await admin
      .from("employee_sessions")
      .select("*")
      .eq("session_id", data.sessionId)
      .maybeSingle();

    if (existingSess) {
      if (existingSess.is_active === false || existingSess.status === "force_logged_out") {
        return {
          ok: false,
          terminated: true,
          logout_reason: existingSess.logout_reason || "Terminated by administrator",
          status: existingSess.status,
        };
      }

      const activeSec = (existingSess.active_seconds || 0) + (data.activeSecondsDelta || 0);
      const idleSec = (existingSess.idle_seconds || 0) + (data.idleSecondsDelta || 0);
      const awaySec = (existingSess.away_seconds || 0) + (data.awaySecondsDelta || 0);

      await admin
        .from("employee_sessions")
        .update({
          last_heartbeat_at: nowIso,
          last_activity_at: data.presenceStatus === "ACTIVE" ? nowIso : (existingSess.last_activity_at || nowIso),
          status: data.presenceStatus.toLowerCase(),
          is_active: true,
          active_seconds: activeSec,
          idle_seconds: idleSec,
          away_seconds: awaySec,
          current_page: data.currentPage,
          current_module: data.currentModule,
          current_order_id: data.currentOrderId ?? existingSess.current_order_id ?? null,
          current_order_code: data.currentOrderCode ?? existingSess.current_order_code ?? null,
          last_action_text: data.lastActionText ?? existingSess.last_action_text ?? null,
          browser: data.browser || existingSess.browser,
          browser_version: data.browserVersion || existingSess.browser_version,
          operating_system: data.os || existingSess.operating_system,
          device_type: data.deviceType || existingSess.device_type,
          ip_address: clientIp || existingSess.ip_address,
          updated_at: nowIso,
        })
        .eq("session_id", data.sessionId);

      return {
        ok: true,
        terminated: false,
        active_seconds: activeSec,
        idle_seconds: idleSec,
        away_seconds: awaySec,
        status: data.presenceStatus.toLowerCase(),
      };
    } else {
      // Insert new session row
      await admin
        .from("employee_sessions")
        .insert({
          employee_id: userId,
          auth_user_id: userId,
          session_id: data.sessionId,
          login_method: "password",
          login_at: nowIso,
          last_activity_at: nowIso,
          last_heartbeat_at: nowIso,
          active_seconds: data.activeSecondsDelta || 0,
          idle_seconds: data.idleSecondsDelta || 0,
          away_seconds: data.awaySecondsDelta || 0,
          is_active: true,
          status: data.presenceStatus.toLowerCase(),
          current_page: data.currentPage,
          current_module: data.currentModule,
          current_order_id: data.currentOrderId ?? null,
          current_order_code: data.currentOrderCode ?? null,
          last_action_text: data.lastActionText ?? null,
          browser: data.browser,
          browser_version: data.browserVersion || null,
          operating_system: data.os,
          device_type: data.deviceType,
          ip_address: clientIp,
          created_at: nowIso,
          updated_at: nowIso,
        });

      return {
        ok: true,
        terminated: false,
        active_seconds: data.activeSecondsDelta || 0,
        idle_seconds: data.idleSecondsDelta || 0,
        away_seconds: data.awaySecondsDelta || 0,
        status: data.presenceStatus.toLowerCase(),
      };
    }
  });

/* -------------------------------------------------------------------------- */
/*  2. LOG LOGIN ATTEMPT & INITIALIZE SESSION                                  */
/* -------------------------------------------------------------------------- */

export const logLoginAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        sessionId: z.string().min(1),
        loginMethod: z.enum(["password", "google"]).default("password"),
        browser: z.string().default("Chrome"),
        browserVersion: z.string().nullable().optional(),
        os: z.string().default("Windows"),
        deviceType: z.string().default("Desktop"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const admin = await getAdmin();
    const clientIp = getClientIpFromRequest();
    const nowIso = new Date().toISOString();

    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, full_name, display_name, is_active")
      .eq("id", userId)
      .maybeSingle();

    const userEmail = profile?.email || context.claims.email || "staff@crm";

    // 1. Record in employee_login_history
    await admin.from("employee_login_history").insert({
      employee_id: userId,
      auth_user_id: userId,
      email: userEmail,
      login_method: data.loginMethod,
      login_at: nowIso,
      success: true,
      failure_reason: null,
      ip_address: clientIp,
      browser: data.browser,
      browser_version: data.browserVersion || null,
      operating_system: data.os,
      device_type: data.deviceType,
    });

    // 2. Record security event
    await admin.from("employee_security_events").insert({
      employee_id: userId,
      auth_user_id: userId,
      actor_id: userId,
      session_id: data.sessionId,
      event_type: "LOGIN_SUCCESS",
      metadata: {
        method: data.loginMethod,
        browser: data.browser,
        os: data.os,
        deviceType: data.deviceType,
      },
      ip_address: clientIp,
    });

    // 3. Upsert session row
    await admin.from("employee_sessions").upsert(
      {
        employee_id: userId,
        auth_user_id: userId,
        session_id: data.sessionId,
        login_method: data.loginMethod,
        login_at: nowIso,
        last_activity_at: nowIso,
        last_heartbeat_at: nowIso,
        is_active: true,
        status: "active",
        browser: data.browser,
        browser_version: data.browserVersion || null,
        operating_system: data.os,
        device_type: data.deviceType,
        ip_address: clientIp,
      },
      { onConflict: "session_id" },
    );

    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  3. VERIFY GOOGLE OAUTH STAFF AUTHORIZATION                                */
/* -------------------------------------------------------------------------- */

export const verifyGoogleStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const admin = await getAdmin();
    const clientIp = getClientIpFromRequest();

    const [{ data: profile }, { data: userRoles }] = await Promise.all([
      admin.from("profiles").select("id, email, is_active").eq("id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const isStaff = (userRoles ?? []).length > 0;
    const isActive = profile?.is_active !== false;

    if (!isStaff || !isActive) {
      // Log unauthorized attempt
      await admin.from("employee_login_history").insert({
        employee_id: profile?.id || null,
        auth_user_id: userId,
        email: profile?.email || context.claims.email || "unknown@google",
        login_method: "google",
        success: false,
        failure_reason: !isStaff ? "NO_STAFF_ROLE_ASSIGNED" : "ACCOUNT_SUSPENDED",
        ip_address: clientIp,
      });

      await admin.from("employee_security_events").insert({
        employee_id: profile?.id || null,
        auth_user_id: userId,
        event_type: "UNAUTHORIZED_ACCESS",
        metadata: {
          reason: !isStaff ? "Google login without CRM staff role" : "Suspended account login attempt",
          email: profile?.email || context.claims.email,
        },
        ip_address: clientIp,
      });

      return { authorized: false, reason: !isStaff ? "NO_STAFF_ROLE" : "ACCOUNT_SUSPENDED" };
    }

    return { authorized: true, email: profile.email };
  });

/* -------------------------------------------------------------------------- */
/*  4. LOGOUT SESSION                                                         */
/* -------------------------------------------------------------------------- */

export const logEmployeeLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ sessionId: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const admin = await getAdmin();
    const clientIp = getClientIpFromRequest();
    const nowIso = new Date().toISOString();

    await admin
      .from("employee_sessions")
      .update({
        is_active: false,
        status: "logged_out",
        logout_at: nowIso,
        logout_reason: "User signed out",
        updated_at: nowIso,
      })
      .eq("session_id", data.sessionId);

    await admin.from("employee_security_events").insert({
      employee_id: userId,
      auth_user_id: userId,
      actor_id: userId,
      session_id: data.sessionId,
      event_type: "LOGOUT",
      metadata: { reason: "User initiated sign out" },
      ip_address: clientIp,
    });

    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  5. ADMIN: LIST ALL EMPLOYEE SESSIONS & SECURITY FLEET                     */
/* -------------------------------------------------------------------------- */

export interface OperatorSessionRow {
  employeeId: string;
  employeeCode: string | null;
  name: string;
  email: string;
  mobile: string | null;
  roles: string[];
  primaryRole: string;
  isActiveAccount: boolean;
  presenceStatus: "active" | "idle" | "away" | "offline";
  sessionId: string | null;
  loginMethod: string | null;
  loginAt: string | null;
  lastHeartbeatAt: string | null;
  lastActivityAt: string | null;
  totalSessionMinutes: number;
  activeMinutes: number;
  idleMinutes: number;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  currentPage: string | null;
  currentModule: string | null;
  currentOrderCode: string | null;
  lastActionText: string | null;
}

export interface ListEmployeeSessionsAdminResult {
  rows: OperatorSessionRow[];
  totalStaffCount: number;
  activeCount: number;
  idleCount: number;
  awayCount: number;
  offlineCount: number;
}

export const listEmployeeSessionsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        statusFilter: z.enum(["all", "active", "idle", "away", "offline"]).default("all"),
        searchQuery: z.string().optional().default(""),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ListEmployeeSessionsAdminResult> => {
    await verifyAdminOrSuperAdmin(context.userId);
    const admin = await getAdmin();
    const nowTime = Date.now();

    // Query staff user IDs
    const { data: staffRoles } = await admin
      .from("user_roles")
      .select("user_id, role");

    const staffUserIds = Array.from(
      new Set((staffRoles ?? []).map((r: any) => String(r.user_id))),
    ) as string[];

    const [{ data: profiles }, { data: sessions }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name, full_name, email, is_active, employee_code, mobile")
        .in(
          "id",
          staffUserIds.length ? staffUserIds : ["00000000-0000-0000-0000-000000000000"],
        ),
      admin
        .from("employee_sessions")
        .select("*")
        .order("last_heartbeat_at", { ascending: false })
        .limit(200),
    ]);

    const profileMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profileMap.set(String(p.id), p));

    const roleMap = new Map<string, string[]>();
    (staffRoles ?? []).forEach((r: any) => {
      const list = roleMap.get(String(r.user_id)) || [];
      list.push(r.role);
      roleMap.set(String(r.user_id), list);
    });

    // Group sessions by employee
    const latestSessionByEmp = new Map<string, any>();
    (sessions ?? []).forEach((s: any) => {
      if (!latestSessionByEmp.has(String(s.employee_id))) {
        latestSessionByEmp.set(String(s.employee_id), s);
      }
    });

    // Construct operator rows
    const operatorRows: OperatorSessionRow[] = staffUserIds.map((uid) => {
      const prof = profileMap.get(uid);
      const sess = latestSessionByEmp.get(uid);
      const roles = roleMap.get(uid) || ["staff"];

      let presence: "active" | "idle" | "away" | "offline" = "offline";
      if (sess && sess.is_active && sess.status !== "force_logged_out" && sess.status !== "logged_out") {
        const lastHbMs = new Date(sess.last_heartbeat_at || sess.last_activity_at || sess.login_at).getTime();
        const diffMs = nowTime - lastHbMs;
        if (diffMs > 10 * 60 * 1000) {
          presence = "offline";
        } else if (sess.status === "away" || diffMs > 8 * 60 * 1000) {
          presence = "away";
        } else if (sess.status === "idle" || diffMs > 5 * 60 * 1000) {
          presence = "idle";
        } else {
          presence = "active";
        }
      }

      const name = prof?.full_name || prof?.display_name || prof?.email?.split("@")[0] || "Operator";
      const totalSec = (sess?.active_seconds || 0) + (sess?.idle_seconds || 0) + (sess?.away_seconds || 0);

      return {
        employeeId: uid,
        employeeCode: prof?.employee_code || null,
        name,
        email: prof?.email || "—",
        mobile: prof?.mobile || null,
        roles,
        primaryRole: roles[0] || "operations",
        isActiveAccount: prof?.is_active !== false,
        presenceStatus: presence,
        sessionId: sess?.session_id ? String(sess.session_id) : null,
        loginMethod: sess?.login_method ? String(sess.login_method) : null,
        loginAt: sess?.login_at ? String(sess.login_at) : null,
        lastHeartbeatAt: sess?.last_heartbeat_at ? String(sess.last_heartbeat_at) : null,
        lastActivityAt: sess?.last_activity_at ? String(sess.last_activity_at) : null,
        totalSessionMinutes: Math.round(totalSec / 60),
        activeMinutes: Math.round((sess?.active_seconds || 0) / 60),
        idleMinutes: Math.round(((sess?.idle_seconds || 0) + (sess?.away_seconds || 0)) / 60),
        browser: sess?.browser ? `${sess.browser} ${sess.browser_version || ""}`.trim() : null,
        os: sess?.operating_system ? String(sess.operating_system) : null,
        deviceType: sess?.device_type ? String(sess.device_type) : null,
        ipAddress: sess?.ip_address ? String(sess.ip_address) : null,
        currentPage: sess?.current_page ? String(sess.current_page) : null,
        currentModule: sess?.current_module ? String(sess.current_module) : null,
        currentOrderCode: sess?.current_order_code ? String(sess.current_order_code) : null,
        lastActionText: sess?.last_action_text ? String(sess.last_action_text) : null,
      };
    });

    // Apply filters
    let filtered = operatorRows;
    if (data.statusFilter !== "all") {
      filtered = filtered.filter((r) => r.presenceStatus === data.statusFilter);
    }
    if (data.searchQuery.trim()) {
      const q = data.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.employeeCode && r.employeeCode.toLowerCase().includes(q)) ||
          r.roles.some((role) => role.toLowerCase().includes(q)),
      );
    }

    return {
      rows: filtered.slice(0, data.limit),
      totalStaffCount: operatorRows.length,
      activeCount: operatorRows.filter((r) => r.presenceStatus === "active").length,
      idleCount: operatorRows.filter((r) => r.presenceStatus === "idle").length,
      awayCount: operatorRows.filter((r) => r.presenceStatus === "away").length,
      offlineCount: operatorRows.filter((r) => r.presenceStatus === "offline").length,
    };
  });

/* -------------------------------------------------------------------------- */
/*  6. ADMIN: FORCE LOGOUT A SESSION                                          */
/* -------------------------------------------------------------------------- */

export const forceLogoutSessionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        sessionId: z.string().min(1),
        reason: z.string().default("Force logged out by administrator"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await verifyAdminOrSuperAdmin(context.userId);
    const admin = await getAdmin();
    const actorId = context.userId;
    const nowIso = new Date().toISOString();

    // 1. Try RPC execution first
    try {
      const { data: res, error } = await admin.rpc("admin_force_logout_session", {
        p_session_id: data.sessionId,
        p_reason: data.reason,
      });
      if (!error && res) {
        return res as { ok: boolean; session_id: string };
      }
      if (error) {
        console.warn("[forceLogoutSessionAdmin] RPC returned error, using direct table update:", error.message);
      }
    } catch (rpcErr) {
      console.warn("[forceLogoutSessionAdmin] RPC exception, using direct table update:", rpcErr);
    }

    // 2. Direct table fallback
    const { data: sessionData } = await admin
      .from("employee_sessions")
      .select("employee_id, auth_user_id, ip_address")
      .eq("session_id", data.sessionId)
      .maybeSingle();

    await admin
      .from("employee_sessions")
      .update({
        is_active: false,
        status: "force_logged_out",
        logout_at: nowIso,
        logout_reason: data.reason,
        updated_at: nowIso,
      })
      .eq("session_id", data.sessionId);

    if (sessionData?.employee_id) {
      await admin.from("employee_security_events").insert({
        employee_id: sessionData.employee_id,
        auth_user_id: sessionData.auth_user_id,
        actor_employee_id: actorId,
        target_employee_id: sessionData.employee_id,
        session_id: data.sessionId,
        event_type: "FORCE_LOGOUT",
        metadata: { reason: data.reason, timestamp: nowIso },
        ip_address: sessionData.ip_address || null,
      });
    }

    return { ok: true, session_id: data.sessionId };
  });

/* -------------------------------------------------------------------------- */
/*  7. ADMIN: FORCE LOGOUT ALL SESSIONS OF AN EMPLOYEE                        */
/* -------------------------------------------------------------------------- */

export const forceLogoutAllSessionsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        reason: z.string().default("Force logged out of all devices by administrator"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await verifyAdminOrSuperAdmin(context.userId);
    const admin = await getAdmin();
    const actorId = context.userId;
    const nowIso = new Date().toISOString();

    // 1. Try RPC execution first
    try {
      const { data: res, error } = await admin.rpc("admin_force_logout_all_sessions", {
        p_employee_id: data.employeeId,
        p_reason: data.reason,
      });
      if (!error && res) {
        return res as { ok: boolean; terminated_count: number };
      }
      if (error) {
        console.warn("[forceLogoutAllSessionsAdmin] RPC returned error, using direct table update:", error.message);
      }
    } catch (rpcErr) {
      console.warn("[forceLogoutAllSessionsAdmin] RPC exception, using direct table update:", rpcErr);
    }

    // 2. Direct table fallback
    const { data: sessions } = await admin
      .from("employee_sessions")
      .select("session_id, auth_user_id, ip_address")
      .eq("employee_id", data.employeeId)
      .eq("is_active", true);

    const count = sessions?.length || 0;

    await admin
      .from("employee_sessions")
      .update({
        is_active: false,
        status: "force_logged_out",
        logout_at: nowIso,
        logout_reason: data.reason,
        updated_at: nowIso,
      })
      .eq("employee_id", data.employeeId)
      .eq("is_active", true);

    await admin.from("employee_security_events").insert({
      employee_id: data.employeeId,
      actor_employee_id: actorId,
      target_employee_id: data.employeeId,
      event_type: "FORCE_LOGOUT_ALL",
      metadata: { reason: data.reason, sessions_terminated: count, timestamp: nowIso },
    });

    return { ok: true, terminated_count: count };
  });

/* -------------------------------------------------------------------------- */
/*  8. ADMIN: GET EMPLOYEE SECURITY & AUDIT DETAILS                           */
/* -------------------------------------------------------------------------- */

export interface EmployeeSecurityDetailResult {
  profile: any;
  activeSessions: any[];
  loginHistory: any[];
  securityEvents: any[];
  recentActivity: any[];
}

export const getEmployeeSecurityDetailAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ employeeId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<EmployeeSecurityDetailResult> => {
    await verifyAdminOrSuperAdmin(context.userId);
    const admin = await getAdmin();

    const [
      { data: profile },
      { data: activeSessions },
      { data: loginHistory },
      { data: securityEvents },
      { data: recentActivity },
    ] = await Promise.all([
      admin.from("profiles").select("*").eq("id", data.employeeId).maybeSingle(),
      admin
        .from("employee_sessions")
        .select("*")
        .eq("employee_id", data.employeeId)
        .order("login_at", { ascending: false })
        .limit(10),
      admin
        .from("employee_login_history")
        .select("*")
        .eq("employee_id", data.employeeId)
        .order("login_at", { ascending: false })
        .limit(20),
      admin
        .from("employee_security_events")
        .select("*")
        .eq("employee_id", data.employeeId)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("employee_activity_log")
        .select("*")
        .eq("employee_id", data.employeeId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    return {
      profile: profile || null,
      activeSessions: activeSessions ?? [],
      loginHistory: loginHistory ?? [],
      securityEvents: securityEvents ?? [],
      recentActivity: recentActivity ?? [],
    };
  });

/* -------------------------------------------------------------------------- */
/*  9. LOG EMPLOYEE CRM ACTIVITY                                              */
/* -------------------------------------------------------------------------- */

export const logEmployeeCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        sessionId: z.string().optional().nullable(),
        actionType: z.string().min(1),
        orderId: z.string().uuid().optional().nullable(),
        ticketId: z.string().uuid().optional().nullable(),
        previousStatus: z.string().optional().nullable(),
        newStatus: z.string().optional().nullable(),
        previousStage: z.string().optional().nullable(),
        newStage: z.string().optional().nullable(),
        metadata: z.record(z.string(), z.any()).default({}),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const admin = await getAdmin();

    await admin.from("employee_activity_log").insert({
      employee_id: userId,
      auth_user_id: userId,
      session_id: data.sessionId || null,
      action_type: data.actionType,
      order_id: data.orderId || null,
      ticket_id: data.ticketId || null,
      previous_status: data.previousStatus || null,
      new_status: data.newStatus || null,
      previous_stage: data.previousStage || null,
      new_stage: data.newStage || null,
      metadata: data.metadata,
    });

    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  10. EMPLOYEE SELF VIEW: GET MY CURRENT SESSION INFO                       */
/* -------------------------------------------------------------------------- */

export interface MySessionInfoResult {
  session: any;
  activeDurationMinutes: number;
  idleDurationMinutes: number;
  recentActivity: any[];
}

export const getMySessionInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySessionInfoResult> => {
    const userId = context.userId;
    const admin = await getAdmin();

    const [{ data: latestSession }, { data: recentLogs }] = await Promise.all([
      admin
        .from("employee_sessions")
        .select("*")
        .eq("employee_id", userId)
        .eq("is_active", true)
        .order("login_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("employee_activity_log")
        .select("*")
        .eq("employee_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const activeSec = (latestSession as any)?.active_seconds || 0;
    const idleSec = ((latestSession as any)?.idle_seconds || 0) + ((latestSession as any)?.away_seconds || 0);

    return {
      session: latestSession || null,
      activeDurationMinutes: Math.round(activeSec / 60),
      idleDurationMinutes: Math.round(idleSec / 60),
      recentActivity: recentLogs ?? [],
    };
  });
