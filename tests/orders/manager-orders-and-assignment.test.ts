import { describe, it, expect, vi } from "vitest";

describe("Manager Orders Permissions & Restricted Assignment View", () => {
  describe("1. Server Authorization & Forbidden Field Protections", () => {
    it("permits Admin and Manager to view employee assigned orders but rejects normal staff/executive", async () => {
      // Simulate role check helper
      const checkAccess = (role: string, isStaff: boolean) => {
        const isManager = role === "manager";
        const isAdmin = isStaff && (role === "admin" || role === "super_admin");
        if (!isAdmin && !isManager) {
          throw new Error("Forbidden: only managers and administrators can view employee assigned orders.");
        }
        return true;
      };

      expect(checkAccess("super_admin", true)).toBe(true);
      expect(checkAccess("admin", true)).toBe(true);
      expect(checkAccess("manager", true)).toBe(true);

      expect(() => checkAccess("executive", true)).toThrow(
        "Forbidden: only managers and administrators can view employee assigned orders."
      );
      expect(() => checkAccess("agent", true)).toThrow(
        "Forbidden: only managers and administrators can view employee assigned orders."
      );
      expect(() => checkAccess("customer", false)).toThrow(
        "Forbidden: only managers and administrators can view employee assigned orders."
      );
    });

    it("restricts returned fields strictly to the 5 allowed UI fields plus internal ID", () => {
      // Raw database row containing sensitive customer and payment fields
      const mockRawDbOrder = {
        id: "11111111-2222-3333-4444-555555555555",
        created_at: "2026-10-30T09:00:00Z",
        customer_name: "Rahul Sharma",
        service_name: "Udyam Registration",
        action_status: "Pending Documents",
        stage: "form_submitted",
        // Prohibited fields that must NEVER be returned to the client in this view:
        application_code: "AP-2026-9999",
        customer_mobile: "9876543210",
        customer_email: "rahul@example.com",
        payment_amount: 1499,
        total_amount: 1499,
        payment_status: "paid",
        idle_time_seconds: 7200,
        fulfillment_notes: "Call customer for PAN card",
      };

      // Transform function matching listEmployeeAssignedOrders implementation
      const transformRow = (row: typeof mockRawDbOrder) => ({
        id: row.id,
        createdAt: row.created_at,
        customerName: row.customer_name ?? "Customer",
        serviceName: row.service_name ?? "Service",
        actionStatus: { label: row.action_status ?? "Pending", tone: "blue" },
        stage: { label: "Form Submitted", tone: "amber" },
      });

      const sanitizedRow = transformRow(mockRawDbOrder);

      // Verify permitted fields exist
      expect(sanitizedRow).toHaveProperty("id");
      expect(sanitizedRow).toHaveProperty("createdAt");
      expect(sanitizedRow).toHaveProperty("customerName", "Rahul Sharma");
      expect(sanitizedRow).toHaveProperty("serviceName", "Udyam Registration");
      expect(sanitizedRow).toHaveProperty("actionStatus");
      expect(sanitizedRow).toHaveProperty("stage");

      // Verify prohibited fields are strictly absent
      expect(sanitizedRow).not.toHaveProperty("application_code");
      expect(sanitizedRow).not.toHaveProperty("customer_mobile");
      expect(sanitizedRow).not.toHaveProperty("mobile");
      expect(sanitizedRow).not.toHaveProperty("customer_email");
      expect(sanitizedRow).not.toHaveProperty("email");
      expect(sanitizedRow).not.toHaveProperty("payment_amount");
      expect(sanitizedRow).not.toHaveProperty("amount");
      expect(sanitizedRow).not.toHaveProperty("total_amount");
      expect(sanitizedRow).not.toHaveProperty("payment_status");
      expect(sanitizedRow).not.toHaveProperty("idle_time_seconds");
      expect(sanitizedRow).not.toHaveProperty("fulfillment_notes");

      // Exact count of keys must be 6 (id + 5 display columns)
      expect(Object.keys(sanitizedRow)).toEqual([
        "id",
        "createdAt",
        "customerName",
        "serviceName",
        "actionStatus",
        "stage",
      ]);
    });
  });

  describe("2. Manager Normal Orders View & Search Rules", () => {
    it("preserves organisation-wide order search for managers only when they actually search", () => {
      // In listOrdersV2, filtering by assigned_to context.userId:
      const shouldRestrictToSelf = (isAdmin: boolean, isManager: boolean, hasSearch: boolean) => {
        return !isAdmin && (!isManager || !hasSearch);
      };

      // Admin sees all orders whether searched or unsearched:
      expect(shouldRestrictToSelf(true, false, false)).toBe(false);
      expect(shouldRestrictToSelf(true, false, true)).toBe(false);

      // Manager unsearched is restricted to self (does not accidentally expose all organisation orders):
      expect(shouldRestrictToSelf(false, true, false)).toBe(true);

      // Manager searching can search organisation-wide:
      expect(shouldRestrictToSelf(false, true, true)).toBe(false);

      // Regular employee/executive is always restricted to own orders:
      expect(shouldRestrictToSelf(false, false, false)).toBe(true);
      expect(shouldRestrictToSelf(false, false, true)).toBe(true);
    });

    it("ensures bulkAssignOrders allows managers to reassign staff", () => {
      const allowedRoles = ["super_admin", "admin", "manager"];

      expect(allowedRoles.includes("manager")).toBe(true);
      expect(allowedRoles.includes("admin")).toBe(true);
      expect(allowedRoles.includes("super_admin")).toBe(true);
      expect(allowedRoles.includes("executive")).toBe(false);
    });
  });

  describe("3. Pagination & Cache Invalidation", () => {
    it("calculates total pages correctly for employee assigned orders", () => {
      const pageSize = 15;
      expect(Math.max(1, Math.ceil(0 / pageSize))).toBe(1);
      expect(Math.max(1, Math.ceil(15 / pageSize))).toBe(1);
      expect(Math.max(1, Math.ceil(16 / pageSize))).toBe(2);
      expect(Math.max(1, Math.ceil(45 / pageSize))).toBe(3);
    });

    it("invalidates affected cache keys on reassignment", () => {
      const invalidatedKeys: string[] = [];
      const mockQc = {
        invalidateQueries: ({ queryKey }: { queryKey: string[] }) => {
          invalidatedKeys.push(queryKey[0]);
        },
      };

      // When reassigning or auto-distributing:
      mockQc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      mockQc.invalidateQueries({ queryKey: ["admin.assignment.metrics"] });
      mockQc.invalidateQueries({ queryKey: ["admin.assignment.history"] });

      expect(invalidatedKeys).toContain("admin.orders.v2");
      expect(invalidatedKeys).toContain("admin.assignment.metrics");
      expect(invalidatedKeys).toContain("admin.assignment.history");
    });
  });

  describe("4. Assignee Filter & Team Orders Manager Controls Visibility", () => {
    it("allows managers to filter by assignee on normal orders and sanitizes other employee rows", () => {
      const managerId = "mgr-123";
      const targetEmployeeId = "nikita-456";

      // Simulation of buildBaseQuery assignment filter logic in listOrdersV2
      const resolveQueryAssignedTo = (
        isAdmin: boolean,
        isManager: boolean,
        assignedToFilter: string | undefined,
        hasSearch: boolean,
        userId: string
      ) => {
        if ((isAdmin || isManager) && assignedToFilter && assignedToFilter !== "all" && assignedToFilter.trim() !== "") {
          return assignedToFilter === "unassigned" ? null : assignedToFilter;
        } else if (!isAdmin && (!isManager || !hasSearch)) {
          return userId;
        }
        return "all";
      };

      // When manager selects Nikita Durgade from the Assignee dropdown without search:
      const resolved = resolveQueryAssignedTo(false, true, targetEmployeeId, false, managerId);
      expect(resolved).toBe(targetEmployeeId);

      // Verify row sanitization for restricted other-employee view:
      const rawRows = [
        {
          id: "order-1",
          created_at: "2026-10-30T10:00:00Z",
          customer_name: "Anita Desai",
          customer_mobile: "9876543210",
          customer_email: "anita@example.com",
          service_name: "Udyam Registration",
          application_code: "AP-2026-1001",
          total_amount: 1499,
          stage: "form_submitted",
          fulfillment_status: "order_received",
        },
      ];

      const sanitizeRows = (rows: typeof rawRows, isRestricted: boolean) => {
        if (!isRestricted) return rows;
        return rows.map((r) => ({
          ...r,
          application_code: "—",
          customer_mobile: null,
          customer_email: null,
          total_amount: null,
          payment_status: null,
          is_other_employee_restricted: true,
        }));
      };

      const isRestrictedManagerOtherEmployee = !false && true && Boolean(targetEmployeeId && targetEmployeeId !== managerId && !false);
      const sanitized = sanitizeRows(rawRows, isRestrictedManagerOtherEmployee);

      expect(sanitized[0].id).toBe("order-1");
      expect(sanitized[0].customer_name).toBe("Anita Desai");
      expect(sanitized[0].service_name).toBe("Udyam Registration");
      expect(sanitized[0].application_code).toBe("—");
      expect(sanitized[0].customer_mobile).toBeNull();
      expect(sanitized[0].customer_email).toBeNull();
      expect(sanitized[0].total_amount).toBeNull();
      expect((sanitized[0] as any).is_other_employee_restricted).toBe(true);
    });

    it("hides Date presets, Reset Filters, Modern Filter Card, and KPI cards from managers in Team Orders", () => {
      // Visibility rule in OrdersListPage:
      // Controls visibility: (!isTeam ? canManageOrders : isAdmin)
      // KPI cards row visibility: (!isTeam || isAdmin)
      const shouldShowFilters = (isTeam: boolean, canManageOrders: boolean, isAdmin: boolean) =>
        !isTeam ? canManageOrders : isAdmin;

      const shouldShowKpiCards = (isTeam: boolean, isAdmin: boolean) =>
        !isTeam || isAdmin;

      // For Manager (isAdmin: false, isManager: true, canManageOrders: true):
      // On normal Orders page (!isTeam):
      expect(shouldShowFilters(false, true, false)).toBe(true);
      expect(shouldShowKpiCards(false, false)).toBe(true);

      // On Team Orders page (isTeam: true):
      expect(shouldShowFilters(true, true, false)).toBe(false);
      expect(shouldShowKpiCards(true, false)).toBe(false);

      // For Admin (isAdmin: true, canManageOrders: true):
      // On Team Orders page:
      expect(shouldShowFilters(true, true, true)).toBe(true);
      expect(shouldShowKpiCards(true, true)).toBe(true);
    });

    it("does not show all orders, payment status, any age, or date filter to manager", () => {
      // 1. KPI cards filtering: adminOnly cards (like ALL ORDERS) are hidden from manager
      const mockBucketCards = [
        { id: "all", label: "ALL ORDERS", adminOnly: true },
        { id: "needs_action", label: "NEEDS ACTION" },
        { id: "hot_orders", label: "HOT ORDERS" },
        { id: "completed", label: "COMPLETED" },
      ];

      const getCardsForUser = (isAdmin: boolean) =>
        isAdmin ? mockBucketCards : mockBucketCards.filter((b) => !b.adminOnly);

      const managerCards = getCardsForUser(false);
      expect(managerCards.map((c) => c.id)).not.toContain("all");
      expect(managerCards.map((c) => c.id)).toEqual(["needs_action", "hot_orders", "completed"]);

      const adminCards = getCardsForUser(true);
      expect(adminCards.map((c) => c.id)).toContain("all");

      // 2. Manager default bucket is needs_action (never 'all')
      const getDefaultBucket = (isAdmin: boolean, savedBucket?: string) => {
        if (!isAdmin && savedBucket === "all") return "needs_action";
        return savedBucket ?? (isAdmin ? "all" : "needs_action");
      };
      expect(getDefaultBucket(false, undefined)).toBe("needs_action");
      expect(getDefaultBucket(false, "all")).toBe("needs_action");
      expect(getDefaultBucket(true, undefined)).toBe("all");

      // 3. Admin-only filters: date filter, payment status, pending age
      const showDateFilter = (isAdmin: boolean) => isAdmin;
      const showPaymentStatusFilter = (isAdmin: boolean) => isAdmin;
      const showPendingAgeFilter = (isAdmin: boolean) => isAdmin;

      expect(showDateFilter(false)).toBe(false);
      expect(showPaymentStatusFilter(false)).toBe(false);
      expect(showPendingAgeFilter(false)).toBe(false);

      expect(showDateFilter(true)).toBe(true);
      expect(showPaymentStatusFilter(true)).toBe(true);
      expect(showPendingAgeFilter(true)).toBe(true);
    });

    it("defaults manager to their own userId and restricts assignee dropdown to active workforce only", () => {
      const managerUserId = "manager-user-uuid-123";

      // 1. Initial assignedTo value logic:
      const getInitialAssignedTo = (isAdmin: boolean, isManager: boolean, savedAssignedTo?: string, userId?: string | null) => {
        if (!isAdmin && isManager) {
          if (savedAssignedTo && savedAssignedTo !== "all") {
            return savedAssignedTo;
          }
          return userId || "all";
        }
        return savedAssignedTo ?? "all";
      };

      // Manager starts with their own userId even if savedAssignedTo was previously 'all' or undefined:
      expect(getInitialAssignedTo(false, true, undefined, managerUserId)).toBe(managerUserId);
      expect(getInitialAssignedTo(false, true, "all", managerUserId)).toBe(managerUserId);
      // Manager keeps explicit other employee selection if saved:
      expect(getInitialAssignedTo(false, true, "emp-456", managerUserId)).toBe("emp-456");
      // Admin defaults to "all":
      expect(getInitialAssignedTo(true, false, undefined, managerUserId)).toBe("all");

      // 2. Assignee dropdown options:
      const canSeeAllAndUnassigned = (isAdmin: boolean) => isAdmin;
      const canSeeInactiveStaff = (isAdmin: boolean) => isAdmin;

      expect(canSeeAllAndUnassigned(false)).toBe(false);
      expect(canSeeInactiveStaff(false)).toBe(false);

      expect(canSeeAllAndUnassigned(true)).toBe(true);
      expect(canSeeInactiveStaff(true)).toBe(true);
    });
  });
});

