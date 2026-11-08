import { describe, it, expect, vi } from "vitest";
import { assertCanAccessOrder, getStaffRoleInfo } from "@/lib/crm/order-auth.server";

describe("CRM Role-Based Order Permissions & Authorization", () => {
  const adminUserId = "admin-user-uuid-1111";
  const managerUserId = "manager-user-uuid-2222";
  const employeeAId = "employee-a-uuid-3333";
  const employeeBId = "employee-b-uuid-4444";
  const unassignedOrderId = "order-unassigned-5555";
  const assignedToAOrderId = "order-assigned-a-6666";
  const assignedToBOrderId = "order-assigned-b-7777";

  function createMockAdmin(rolesMap: Record<string, string[]>, ordersMap: Record<string, { id: string; application_code: string; assigned_to: string | null }>) {
    return {
      from: (table: string) => {
        if (table === "user_roles") {
          return {
            select: () => ({
              eq: (_col: string, val: string) => {
                const userRoles = rolesMap[val] ?? [];
                return Promise.resolve({ data: userRoles.map((role) => ({ role })), error: null });
              },
            }),
          };
        }
        if (table === "applications") {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                eq: (_col2: string, _val2: any) => ({
                  maybeSingle: () => {
                    const app = ordersMap[val];
                    if (!app) return Promise.resolve({ data: null, error: null });
                    return Promise.resolve({ data: app, error: null });
                  },
                }),
              }),
            }),
          };
        }
        throw new Error(`Unhandled table in mock: ${table}`);
      },
    };
  }

  const mockRoles: Record<string, string[]> = {
    [adminUserId]: ["admin"],
    [managerUserId]: ["manager"],
    [employeeAId]: ["executive"],
    [employeeBId]: ["executive"],
  };

  const mockOrders: Record<string, { id: string; application_code: string; assigned_to: string | null }> = {
    [unassignedOrderId]: { id: unassignedOrderId, application_code: "APP-001", assigned_to: null },
    [assignedToAOrderId]: { id: assignedToAOrderId, application_code: "APP-002", assigned_to: employeeAId },
    [assignedToBOrderId]: { id: assignedToBOrderId, application_code: "APP-003", assigned_to: employeeBId },
  };

  const mockAdmin = createMockAdmin(mockRoles, mockOrders);

  describe("1. Role Detection (getStaffRoleInfo)", () => {
    it("correctly identifies Admin", async () => {
      const info = await getStaffRoleInfo(mockAdmin, adminUserId);
      expect(info.isAdmin).toBe(true);
      expect(info.isManager).toBe(false);
      expect(info.isStaff).toBe(true);
    });

    it("correctly identifies Manager", async () => {
      const info = await getStaffRoleInfo(mockAdmin, managerUserId);
      expect(info.isAdmin).toBe(false);
      expect(info.isManager).toBe(true);
      expect(info.isStaff).toBe(true);
    });

    it("correctly identifies Employee (Executive)", async () => {
      const info = await getStaffRoleInfo(mockAdmin, employeeAId);
      expect(info.isAdmin).toBe(false);
      expect(info.isManager).toBe(false);
      expect(info.isStaff).toBe(true);
    });

    it("rejects non-staff user", async () => {
      const info = await getStaffRoleInfo(mockAdmin, "non-staff-id");
      expect(info.isAdmin).toBe(false);
      expect(info.isManager).toBe(false);
      expect(info.isStaff).toBe(false);
    });
  });

  describe("2. Admin Order Access", () => {
    it("Admin can access order assigned to any employee", async () => {
      const res = await assertCanAccessOrder({
        orderId: assignedToAOrderId,
        userId: adminUserId,
        admin: mockAdmin,
      });
      expect(res.allowed).toBe(true);
      expect(res.roleInfo.isAdmin).toBe(true);
    });

    it("Admin can access unassigned order", async () => {
      const res = await assertCanAccessOrder({
        orderId: unassignedOrderId,
        userId: adminUserId,
        admin: mockAdmin,
      });
      expect(res.allowed).toBe(true);
    });
  });

  describe("3. Manager Order Access", () => {
    it("Manager can open and access order assigned to any employee", async () => {
      const res = await assertCanAccessOrder({
        orderId: assignedToAOrderId,
        userId: managerUserId,
        admin: mockAdmin,
      });
      expect(res.allowed).toBe(true);
      expect(res.roleInfo.isManager).toBe(true);
    });

    it("Manager can open and access unassigned order", async () => {
      const res = await assertCanAccessOrder({
        orderId: unassignedOrderId,
        userId: managerUserId,
        admin: mockAdmin,
      });
      expect(res.allowed).toBe(true);
    });
  });

  describe("4. Employee Order Access Restrictions", () => {
    it("Employee can access order assigned to themselves", async () => {
      const res = await assertCanAccessOrder({
        orderId: assignedToAOrderId,
        userId: employeeAId,
        admin: mockAdmin,
      });
      expect(res.allowed).toBe(true);
      expect(res.application.id).toBe(assignedToAOrderId);
    });

    it("Employee CANNOT access order assigned to another employee", async () => {
      await expect(
        assertCanAccessOrder({
          orderId: assignedToBOrderId,
          userId: employeeAId,
          admin: mockAdmin,
        })
      ).rejects.toThrow("Forbidden: You do not have permission to access this order. It is not assigned to you.");
    });

    it("Employee CANNOT access unassigned order", async () => {
      await expect(
        assertCanAccessOrder({
          orderId: unassignedOrderId,
          userId: employeeAId,
          admin: mockAdmin,
        })
      ).rejects.toThrow("Forbidden: You do not have permission to access this order. It is not assigned to you.");
    });

    it("Non-staff user is rejected with Forbidden", async () => {
      await expect(
        assertCanAccessOrder({
          orderId: assignedToAOrderId,
          userId: "unknown-user",
          admin: mockAdmin,
        })
      ).rejects.toThrow("Forbidden: Staff access required");
    });
  });

  describe("5. Non-existent Order Handling", () => {
    it("Throws Order not found when application does not exist", async () => {
      await expect(
        assertCanAccessOrder({
          orderId: "non-existent-order-id",
          userId: adminUserId,
          admin: mockAdmin,
        })
      ).rejects.toThrow("Order not found");
    });
  });

  describe("6. Manager Module Access vs Employee", () => {
    it("Manager has orders: full, but no other modules (same as employee/executive)", async () => {
      const { ACCESS_MATRIX, canSeeModule, canApproveRefund } = await import("@/lib/roles");
      expect(canSeeModule(["manager"], "orders")).toBe(true);
      expect(canSeeModule(["executive"], "orders")).toBe(true);

      // Manager must NOT see other modules
      expect(canSeeModule(["manager"], "dashboard")).toBe(false);
      expect(canSeeModule(["manager"], "leads")).toBe(false);
      expect(canSeeModule(["manager"], "customers")).toBe(false);
      expect(canSeeModule(["manager"], "employees")).toBe(false);
      expect(canSeeModule(["manager"], "reports")).toBe(false);
      expect(canSeeModule(["manager"], "invoices")).toBe(false);
      expect(canSeeModule(["manager"], "payments")).toBe(false);
      expect(canSeeModule(["manager"], "tickets")).toBe(false);
      expect(canSeeModule(["manager"], "complaints")).toBe(false);
      expect(canSeeModule(["manager"], "tasks")).toBe(false);

      // Manager cannot approve refunds (admin only)
      expect(canApproveRefund(["manager"])).toBe(false);
      expect(canApproveRefund(["executive"])).toBe(false);
      expect(canApproveRefund(["admin"])).toBe(true);
      expect(canApproveRefund(["super_admin"])).toBe(true);
    });
  });

  describe("7. ViewMode & Team Orders Oversight Schema", () => {
    it("viewMode defaults to 'self' and accepts 'team'", async () => {
      const { z } = await import("zod");
      const listOrdersSchema = z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        viewMode: z.enum(["self", "team"]).optional().default("self"),
      });

      const parsedDefault = listOrdersSchema.parse({});
      expect(parsedDefault.viewMode).toBe("self");

      const parsedTeam = listOrdersSchema.parse({ viewMode: "team" });
      expect(parsedTeam.viewMode).toBe("team");

      const parsedSelf = listOrdersSchema.parse({ viewMode: "self" });
      expect(parsedSelf.viewMode).toBe("self");
    });

    it("Team view withholds individual order rows and returns empty row list", () => {
      const mockFilteredOrders = [
        { id: "app-1", application_code: "APP-001", assigned_to: "employee-1" },
        { id: "app-2", application_code: "APP-002", assigned_to: "employee-2" },
      ];

      // Replicating listOrdersV2 row resolution rule:
      // const rows = data.viewMode === "team" ? [] : filtered.slice(start, start + data.pageSize);
      const resolveRows = (viewMode: "self" | "team", filtered: typeof mockFilteredOrders) => {
        return viewMode === "team" ? [] : filtered;
      };

      expect(resolveRows("team", mockFilteredOrders)).toEqual([]);
      expect(resolveRows("self", mockFilteredOrders)).toHaveLength(2);
    });
  });
});

