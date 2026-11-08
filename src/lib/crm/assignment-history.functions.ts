import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assignOrderCanonical,
  reassignOrdersFromUnavailableEmployee,
  distributeOrdersEquallyCanonical,
  calculateStaffWorkloads,
  getReassignmentOperationalMetrics,
  type AssignmentChangeType,
} from "./assignment-engine.server";

async function assertAdminOrStaff(supabase: any, userId?: string) {
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  return { isAdmin: !!isAdmin, isSuper: !!isSuper };
}

/* -------------------------------------------------------------------------- */
/*  1. GET ASSIGNMENT HISTORY FOR A SINGLE ORDER                              */
/* -------------------------------------------------------------------------- */

export const getOrderAssignmentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("order_assignment_history")
      .select("*")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[getOrderAssignmentHistory] fetch notice:", error.message);
      return { rows: [] };
    }

    const userIds = Array.from(
      new Set(
        (rows ?? [])
          .flatMap((r: any) => [r.previous_employee_id, r.new_employee_id, r.changed_by])
          .filter(Boolean),
      ),
    );

    const { data: profiles } = userIds.length
      ? await (supabaseAdmin as any).from("profiles").select("id, full_name, display_name, email").in("id", userIds)
      : { data: [] };

    const nameMap = new Map<string, string>();
    (profiles ?? []).forEach((p: any) =>
      nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff"),
    );

    return {
      rows: (rows ?? []).map((r: any) => ({
        id: r.id,
        orderId: r.order_id,
        leadId: r.lead_id,
        previousEmployeeId: r.previous_employee_id,
        previousEmployeeName: r.previous_employee_id ? nameMap.get(r.previous_employee_id) || "Unassigned" : "Unassigned",
        newEmployeeId: r.new_employee_id,
        newEmployeeName: r.new_employee_id ? nameMap.get(r.new_employee_id) || "Unassigned" : "Unassigned",
        changeType: r.change_type as AssignmentChangeType,
        reason: r.reason || null,
        source: r.source || "system",
        changedBy: r.changed_by,
        changedByName: r.changed_by ? nameMap.get(r.changed_by) || "System" : "System",
        createdAt: r.created_at,
        metadata: r.metadata || {},
      })),
    };
  });

/* -------------------------------------------------------------------------- */
/*  2. ADMIN: LIST ALL ASSIGNMENT HISTORY (PAGINATED & FILTERABLE)             */
/* -------------------------------------------------------------------------- */

export const listAssignmentHistoryAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(30),
        search: z.string().optional(),
        employeeId: z.string().optional(),
        previousEmployeeId: z.string().optional(),
        newEmployeeId: z.string().optional(),
        changeType: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);

    let query = (supabaseAdmin as any)
      .from("order_assignment_history")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.employeeId && data.employeeId !== "all") {
      query = query.or(`previous_employee_id.eq.${data.employeeId},new_employee_id.eq.${data.employeeId}`);
    }
    if (data.previousEmployeeId && data.previousEmployeeId !== "all") {
      query = query.eq("previous_employee_id", data.previousEmployeeId);
    }
    if (data.newEmployeeId && data.newEmployeeId !== "all") {
      query = query.eq("new_employee_id", data.newEmployeeId);
    }
    if (data.changeType && data.changeType !== "all") {
      if (data.changeType === "auto") {
        query = query.ilike("change_type", "AUTO%");
      } else if (data.changeType === "manual") {
        query = query.ilike("change_type", "MANUAL%");
      } else {
        query = query.eq("change_type", data.changeType);
      }
    }
    if (data.dateFrom) {
      query = query.gte("created_at", `${data.dateFrom}T00:00:00+05:30`);
    }
    if (data.dateTo) {
      query = query.lte("created_at", `${data.dateTo}T23:59:59+05:30`);
    }

    const start = (data.page - 1) * data.pageSize;
    query = query.range(start, start + data.pageSize - 1);

    const { data: rows, count, error } = await query;
    if (error) {
      console.warn("[listAssignmentHistoryAdmin] query notice:", error.message);
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
    }

    // Collect order and employee IDs for hydration
    const orderIds = Array.from(new Set((rows ?? []).map((r: any) => r.order_id).filter(Boolean)));
    const userIds = Array.from(
      new Set(
        (rows ?? [])
          .flatMap((r: any) => [r.previous_employee_id, r.new_employee_id, r.changed_by])
          .filter(Boolean),
      ),
    );

    const [{ data: apps }, { data: profiles }] = await Promise.all([
      orderIds.length
        ? (supabaseAdmin as any)
            .from("applications")
            .select("id, application_code, customer_id, customers(name, primary_mobile)")
            .in("id", orderIds)
        : { data: [] },
      userIds.length
        ? (supabaseAdmin as any)
            .from("profiles")
            .select("id, full_name, display_name, email")
            .in("id", userIds)
        : { data: [] },
    ]);

    const appMap = new Map<string, any>();
    (apps ?? []).forEach((a: any) => appMap.set(a.id, a));

    const nameMap = new Map<string, string>();
    (profiles ?? []).forEach((p: any) =>
      nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff"),
    );

    let mappedRows: any[] = (rows ?? []).map((r: any) => {
      const app = appMap.get(r.order_id);
      return {
        id: r.id,
        orderId: r.order_id,
        applicationCode: app?.application_code || r.order_id.slice(0, 8),
        customerName: app?.customers?.name || "Customer",
        customerMobile: app?.customers?.primary_mobile || null,
        previousEmployeeId: r.previous_employee_id,
        previousEmployeeName: r.previous_employee_id ? nameMap.get(r.previous_employee_id) || "Unassigned" : "Unassigned",
        newEmployeeId: r.new_employee_id,
        newEmployeeName: r.new_employee_id ? nameMap.get(r.new_employee_id) || "Unassigned" : "Unassigned",
        changeType: r.change_type as AssignmentChangeType,
        reason: r.reason || null,
        source: r.source || "system",
        changedBy: r.changed_by,
        changedByName: r.changed_by ? nameMap.get(r.changed_by) || "System" : "System",
        createdAt: r.created_at,
        metadata: r.metadata || {},
      };
    });

    if (data.search && data.search.trim()) {
      const q = data.search.trim().toLowerCase();
      mappedRows = mappedRows.filter(
        (r: any) =>
          r.applicationCode.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.previousEmployeeName.toLowerCase().includes(q) ||
          r.newEmployeeName.toLowerCase().includes(q) ||
          (r.reason || "").toLowerCase().includes(q),
      );
    }

    return {
      rows: mappedRows,
      total: count ?? mappedRows.length,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/* -------------------------------------------------------------------------- */
/*  3. OPERATIONAL METRICS FOR REASSIGNMENT DASHBOARD                          */
/* -------------------------------------------------------------------------- */

export const getAssignmentOperationalMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    return await getReassignmentOperationalMetrics();
  });

/* -------------------------------------------------------------------------- */
/*  4. EMPLOYEE LEAVE MANAGEMENT (SCHEDULE LEAVE & AUTO-REASSIGN)              */
/* -------------------------------------------------------------------------- */

export const createEmployeeLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        startTime: z.string(),
        endTime: z.string(),
        reason: z.string().optional().default("Staff on scheduled leave"),
        autoReassign: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    const nowIso = new Date().toISOString();

    const { data: leave, error } = await (supabaseAdmin as any)
      .from("employee_leaves")
      .insert({
        employee_id: data.employeeId,
        start_time: new Date(data.startTime).toISOString(),
        end_time: new Date(data.endTime).toISOString(),
        reason: data.reason,
        status: "ACTIVE",
        auto_reassign: data.autoReassign,
        created_by: context.userId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    let redistributionSummary = null;
    // If leave starts now or in past, and autoReassign is ON, trigger immediate automatic redistribution
    const startsNow = new Date(data.startTime).getTime() <= Date.now() + 60000;
    if (startsNow && data.autoReassign) {
      redistributionSummary = await reassignOrdersFromUnavailableEmployee({
        unavailableEmployeeId: data.employeeId,
        reason: `Employee on leave: ${data.reason}`,
        changeType: "AUTO_LEAVE",
        actorId: context.userId,
      });
    }

    return {
      success: true,
      leave,
      redistributionSummary,
    };
  });

export const cancelEmployeeLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leaveId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("employee_leaves")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.leaveId);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const listEmployeeLeaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    const { data: leaves, error } = await (supabaseAdmin as any)
      .from("employee_leaves")
      .select("*")
      .order("start_time", { ascending: false })
      .limit(100);

    if (error) return { rows: [] };

    const employeeIds = Array.from(new Set((leaves ?? []).map((l: any) => l.employee_id)));
    const { data: profiles } = employeeIds.length
      ? await (supabaseAdmin as any).from("profiles").select("id, full_name, display_name, email").in("id", employeeIds)
      : { data: [] };

    const nameMap = new Map<string, string>();
    (profiles ?? []).forEach((p: any) =>
      nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff"),
    );

    return {
      rows: (leaves ?? []).map((l: any) => ({
        id: l.id,
        employeeId: l.employee_id,
        employeeName: nameMap.get(l.employee_id) || "Staff",
        startTime: l.start_time,
        endTime: l.end_time,
        reason: l.reason,
        status: l.status,
        autoReassign: l.auto_reassign,
        reassignedCount: l.reassigned_count,
        createdAt: l.created_at,
      })),
    };
  });

/* -------------------------------------------------------------------------- */
/*  5. MANUAL / ON-DEMAND TRIGGER FOR EMPLOYEE REASSIGNMENT                   */
/* -------------------------------------------------------------------------- */

export const triggerEmployeeReassignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        reason: z.string().min(1),
        changeType: z.enum(["AUTO_UNAVAILABLE", "AUTO_LEAVE", "AUTO_INACTIVITY"]).default("AUTO_UNAVAILABLE"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    return await reassignOrdersFromUnavailableEmployee({
      unavailableEmployeeId: data.employeeId,
      reason: data.reason,
      changeType: data.changeType,
      actorId: context.userId,
    });
  });

/* -------------------------------------------------------------------------- */
/*  6. EQUALLY DISTRIBUTE / AUTO-BALANCE ARBITRARY SELECTED ORDERS            */
/* -------------------------------------------------------------------------- */

export const autoDistributeSelectedOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        applicationIds: z.array(z.string().uuid()).min(1),
        reason: z.string().optional(),
        targetEmployeeIds: z.array(z.string().uuid()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    return await distributeOrdersEquallyCanonical(
      data.applicationIds,
      context.userId,
      data.reason || "Equally distributed by SuperAdmin across active staff",
      data.targetEmployeeIds,
    );
  });

