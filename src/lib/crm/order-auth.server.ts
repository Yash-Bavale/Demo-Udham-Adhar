import { SupabaseClient } from "@supabase/supabase-js";

export interface StaffRoleInfo {
  roles: string[];
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
}

const ALLOWED_STAFF_ROLES = [
  "admin",
  "super_admin",
  "manager",
  "executive",
  "operations",
  "support",
  "accounts",
  "finance",
];

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

/**
 * Returns canonical role information for a given staff user.
 */
export async function getStaffRoleInfo(
  admin: SupabaseClient | any,
  userId: string
): Promise<StaffRoleInfo> {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const roles = (data ?? []).map((r: any) => String(r.role));
  const isAdmin = roles.some((r: string) => r === "admin" || r === "super_admin");
  const isManager = roles.includes("manager");
  const isStaff = roles.some((r: string) => ALLOWED_STAFF_ROLES.includes(r));

  return { roles, isAdmin, isManager, isStaff };
}

/**
 * Ensures user is authenticated staff member.
 */
export async function assertStaffUser(
  admin: SupabaseClient | any,
  userId: string
): Promise<StaffRoleInfo> {
  const roleInfo = await getStaffRoleInfo(admin, userId);
  if (!roleInfo.isStaff) {
    throw new Error("Forbidden: Staff access required");
  }
  return roleInfo;
}

/**
 * Centralized authorization check for accessing an individual order.
 * - Admin: full access to all orders.
 * - Manager: full access to view any order details, customer information, and documents.
 * - Employee: access restricted ONLY to orders where assigned_to === userId.
 */
export async function assertCanAccessOrder(params: {
  orderId: string;
  userId: string;
  admin?: SupabaseClient | any;
}): Promise<{
  allowed: boolean;
  roleInfo: StaffRoleInfo;
  application: { id: string; application_code: string; assigned_to: string | null };
}> {
  const admin = params.admin || (await getAdmin());
  const roleInfo = await assertStaffUser(admin, params.userId);

  const { data: app, error } = await admin
    .from("applications")
    .select("id, application_code, assigned_to")
    .eq("id", params.orderId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !app) {
    throw new Error("Order not found");
  }

  // Admin and Manager can open and view all orders
  if (roleInfo.isAdmin || roleInfo.isManager) {
    return { allowed: true, roleInfo, application: app };
  }

  // Regular employees (executive, operations, support, etc.) can ONLY open orders assigned to them
  if (app.assigned_to !== params.userId) {
    throw new Error("Forbidden: You do not have permission to access this order. It is not assigned to you.");
  }

  return { allowed: true, roleInfo, application: app };
}

/**
 * Non-throwing access checker for query filtering.
 */
export async function canUserAccessOrder(params: {
  orderId: string;
  userId: string;
  admin?: SupabaseClient | any;
}): Promise<boolean> {
  try {
    await assertCanAccessOrder(params);
    return true;
  } catch {
    return false;
  }
}
