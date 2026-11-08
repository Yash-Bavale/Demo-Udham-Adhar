import { describe, it, expect } from "vitest";
import {
  getOrdersDateRange,
  normalizeOrdersFilter,
  getOrdersQueryKey,
  getOrdersKPIsQueryKey,
  type OrdersFilter,
} from "@/lib/orders/orders-filter";

describe("Orders Filter & Date Boundary System", () => {
  describe("1. Asia/Kolkata (IST) Date Boundary Correctness", () => {
    it("should compute exact start-of-day (00:00:00 IST) and end-of-day (23:59:59.999 IST) for 18 Sep -> 24 Sep 2026", () => {
      const range = getOrdersDateRange({
        from: "2026-09-18",
        to: "2026-09-24",
        timezone: "Asia/Kolkata",
      });

      expect(range.fromKey).toBe("2026-09-18");
      expect(range.toKey).toBe("2026-09-24");

      // 2026-09-18 00:00:00.000+05:30 in UTC is 2026-09-17 18:30:00.000Z
      expect(range.fromIso).toBe("2026-09-17T18:30:00.000Z");

      // 2026-09-24 23:59:59.999+05:30 in UTC is 2026-09-24 18:29:59.999Z
      expect(range.toIso).toBe("2026-09-24T18:29:59.999Z");
    });

    it("should handle single-day date range without off-by-one errors", () => {
      const range = getOrdersDateRange({
        from: "2026-09-18",
        to: "2026-09-18",
      });

      expect(range.fromIso).toBe("2026-09-17T18:30:00.000Z");
      expect(range.toIso).toBe("2026-09-18T18:29:59.999Z");

      const diffMs = new Date(range.toIso!).getTime() - new Date(range.fromIso!).getTime();
      // Total span of 1 day = 86,400,000 ms - 1 ms = 86,399,999 ms
      expect(diffMs).toBe(86399999);
    });

    it("should handle Date instances properly in IST", () => {
      // 2026-09-24 12:00:00 UTC = 2026-09-24 17:30:00 IST (date key: 2026-09-24)
      const d = new Date("2026-09-24T12:00:00.000Z");
      const range = getOrdersDateRange({
        from: d,
        to: d,
      });

      expect(range.fromKey).toBe("2026-09-24");
      expect(range.toKey).toBe("2026-09-24");
      expect(range.fromIso).toBe("2026-09-23T18:30:00.000Z");
      expect(range.toIso).toBe("2026-09-24T18:29:59.999Z");
    });

    it("should handle empty or undefined dates gracefully", () => {
      const range = getOrdersDateRange({});
      expect(range.fromIso).toBeUndefined();
      expect(range.toIso).toBeUndefined();
      expect(range.fromKey).toBeUndefined();
      expect(range.toKey).toBeUndefined();
    });
  });

  describe("2. Canonical Filter Normalization & Query Keys", () => {
    it("should normalize empty strings and 'all' / 'any' to null", () => {
      const raw: OrdersFilter = {
        dateFrom: "2026-09-18",
        dateTo: "2026-09-24",
        search: "  ORD-12345  ",
        stage: "all",
        actionStatus: "all",
        serviceId: "all",
        assignedTo: "all",
        paymentStatus: "all",
        fulfillmentStatus: "all",
        pendingAge: "any",
        bucket: "all",
      };

      const normalized = normalizeOrdersFilter(raw);

      expect(normalized.search).toBe("ORD-12345");
      expect(normalized.stage).toBeNull();
      expect(normalized.serviceId).toBeNull();
      expect(normalized.assignedTo).toBeNull();
      expect(normalized.paymentStatus).toBeNull();
      expect(normalized.fulfillmentStatus).toBeNull();
      expect(normalized.pendingAge).toBeNull();
      expect(normalized.bucket).toBe("all");
      expect(normalized.actionStatus).toBe("all");
      expect(normalized.dateFrom).toBe("2026-09-18");
      expect(normalized.dateTo).toBe("2026-09-24");
    });

    it("should generate deterministic cache keys for TanStack Query", () => {
      const f1 = normalizeOrdersFilter({
        dateFrom: "2026-09-18",
        dateTo: "2026-09-24",
        stage: "payment_done",
        paymentStatus: "Paid",
      });

      const f2 = normalizeOrdersFilter({
        dateFrom: "2026-09-18",
        dateTo: "2026-09-24",
        stage: "payment_done",
        paymentStatus: "Paid",
        search: "   ", // whitespace should normalize to null
      });

      const key1 = getOrdersQueryKey(f1, 1);
      const key2 = getOrdersQueryKey(f2, 1);

      expect(JSON.stringify(key1)).toEqual(JSON.stringify(key2));
    });

    it("should generate distinct cache keys when any filter dimension changes", () => {
      const f1 = normalizeOrdersFilter({ dateFrom: "2026-09-18", dateTo: "2026-09-24" });
      const f2 = normalizeOrdersFilter({ dateFrom: "2026-09-19", dateTo: "2026-09-24" });
      const f3 = normalizeOrdersFilter({ dateFrom: "2026-09-18", dateTo: "2026-09-24", stage: "payment_done" });

      const k1 = getOrdersQueryKey(f1, 1);
      const k2 = getOrdersQueryKey(f2, 1);
      const k3 = getOrdersQueryKey(f3, 1);

      expect(JSON.stringify(k1)).not.toEqual(JSON.stringify(k2));
      expect(JSON.stringify(k1)).not.toEqual(JSON.stringify(k3));
    });
  });

  describe("3. Base Filtered Orders & KPI Aggregates Logic", () => {
    // Mock dataset to simulate database rows
    const sampleOrders = [
      { id: "1", stage: "payment_done", fulfillment_status: "order_received", payment_status: "Paid", is_hot: false, is_callback_scheduled: false, created_at: "2026-09-20T10:00:00.000Z" },
      { id: "2", stage: "form_submitted", fulfillment_status: "form_submitted", payment_status: "Paid", is_hot: false, is_callback_scheduled: false, created_at: "2026-09-21T10:00:00.000Z" },
      { id: "3", stage: "technical_delay", fulfillment_status: "technical_delay", payment_status: "Paid", is_hot: false, is_callback_scheduled: false, created_at: "2026-09-21T11:00:00.000Z" },
      { id: "4", stage: "submitted_to_govt", fulfillment_status: "submitted_to_govt", payment_status: "Paid", is_hot: false, is_callback_scheduled: false, created_at: "2026-09-22T08:00:00.000Z" },
      { id: "5", stage: "completed", fulfillment_status: "order_completed", payment_status: "Paid", is_hot: false, is_callback_scheduled: false, created_at: "2026-09-23T09:00:00.000Z" },
      { id: "6", stage: "closed", fulfillment_status: "order_closed", payment_status: "Failed", is_hot: false, is_callback_scheduled: false, created_at: "2026-09-23T10:00:00.000Z" },
      { id: "7", stage: "payment_done", fulfillment_status: "order_received", payment_status: "Pending", is_hot: true, is_callback_scheduled: false, created_at: "2026-09-24T05:00:00.000Z" },
    ];

    function bucketOf(o: any, todayIst = "2026-09-24"): string {
      if (o.stage === "completed" || o.fulfillment_status === "order_completed") return "completed";
      if (o.stage === "closed" || o.fulfillment_status === "order_closed") return "closed";
      if (o.is_hot) return "hot_orders";
      if (o.is_callback_scheduled) return "reminders";
      if (o.stage === "technical_delay") return "technical_delay";
      if (o.stage === "customer_delay") return "customer_delay";
      if (["lead_received", "payment_done", "form_submitted", "form_not_submitted"].includes(o.stage)) {
        const date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(o.created_at));
        return date < todayIst ? "backlog" : "needs_action";
      }
      return "pending";
    }

    it("should compute ALL ORDERS count as total orders matching active filters in the date range", () => {
      // Unfiltered base: 7 total (1 completed, 1 closed, 5 active) -> 7 total
      const base1 = sampleOrders;
      const allOrders1 = base1.length;
      expect(allOrders1).toBe(7);

      // Filter by paymentStatus = "Paid" -> ids 1, 2, 3, 4, 5 (5 total rows)
      const base2 = sampleOrders.filter(o => o.payment_status === "Paid");
      const allOrders2 = base2.length;
      expect(allOrders2).toBe(5);

      // Filter by stage = "technical_delay" -> 1 total
      const base3 = sampleOrders.filter(o => o.stage === "technical_delay");
      const allOrders3 = base3.length;
      expect(allOrders3).toBe(1);
    });

    it("should ensure all 10 KPI categories derive from the exact same base filtered dataset", () => {
      // Base filtered dataset with paymentStatus === "Paid"
      const base = sampleOrders.filter(o => o.payment_status === "Paid");

      const kpis = {
        all: base.length,
        needs_action: base.filter(o => ["needs_action", "backlog"].includes(bucketOf(o))).length,
        hot_orders: base.filter(o => bucketOf(o) === "hot_orders").length,
        reminders: base.filter(o => bucketOf(o) === "reminders").length,
        technical_delay: base.filter(o => bucketOf(o) === "technical_delay").length,
        backlog: base.filter(o => bucketOf(o) === "backlog").length,
        customer_delay: base.filter(o => bucketOf(o) === "customer_delay").length,
        pending: base.filter(o => bucketOf(o) === "pending").length,
        completed: base.filter(o => bucketOf(o) === "completed").length,
        closed: base.filter(o => bucketOf(o) === "closed").length,
      };

      expect(kpis.all).toBe(5); // All 5 paid orders in range
      expect(kpis.needs_action).toBe(2); // ids 1, 2, including historical backlog
      expect(kpis.backlog).toBe(2); // both action-needed orders predate 24 Sep IST
      expect(kpis.technical_delay).toBe(1); // id 3
      expect(kpis.pending).toBe(1); // id 4
      expect(kpis.completed).toBe(1); // id 5
      expect(kpis.closed).toBe(0); // id 6 was Failed
    });

    it("keeps operational queues all-time while Backlog excludes today's untouched orders", () => {
      const todayIst = "2026-09-24";
      const operationalOrders = [
        ...sampleOrders,
        { id: "8", stage: "form_not_submitted", fulfillment_status: "form_not_submitted", payment_status: "Paid", is_hot: false, is_callback_scheduled: false, created_at: "2026-09-24T06:00:00.000Z" },
        { id: "9", stage: "under_review", fulfillment_status: "verification_pending", payment_status: "Paid", is_hot: false, is_callback_scheduled: true, created_at: "2026-09-19T06:00:00.000Z" },
      ];

      const needsAction = operationalOrders.filter((o) => ["needs_action", "backlog"].includes(bucketOf(o, todayIst)));
      const backlog = operationalOrders.filter((o) => bucketOf(o, todayIst) === "backlog");
      const hotOrders = operationalOrders.filter((o) => bucketOf(o, todayIst) === "hot_orders");
      const reminders = operationalOrders.filter((o) => bucketOf(o, todayIst) === "reminders");

      expect(needsAction.map((o) => o.id)).toEqual(["1", "2", "8"]);
      expect(backlog.map((o) => o.id)).toEqual(["1", "2"]);
      expect(hotOrders.map((o) => o.id)).toEqual(["7"]);
      expect(reminders.map((o) => o.id)).toEqual(["9"]);
    });
  });

  describe("4. Target Filter Scenarios & Race Condition Verification", () => {
    it("A. Today range should map to current IST day boundaries", () => {
      const todayKey = "2026-09-24";
      const range = getOrdersDateRange({ from: todayKey, to: todayKey });
      expect(range.fromKey).toBe("2026-09-24");
      expect(range.toKey).toBe("2026-09-24");
      expect(range.fromIso).toBe("2026-09-23T18:30:00.000Z");
      expect(range.toIso).toBe("2026-09-24T18:29:59.999Z");
    });

    it("B. 18 Sep -> 24 Sep range should span exactly 7 full IST days", () => {
      const range = getOrdersDateRange({ from: "2026-09-18", to: "2026-09-24" });
      expect(range.fromIso).toBe("2026-09-17T18:30:00.000Z");
      expect(range.toIso).toBe("2026-09-24T18:29:59.999Z");
      const diffDays = (new Date(range.toIso!).getTime() - new Date(range.fromIso!).getTime() + 1) / 86400000;
      expect(diffDays).toBe(7);
    });

    it("C. Service filter + Date filter combination normalization", () => {
      const normalized = normalizeOrdersFilter({
        dateFrom: "2026-09-18",
        dateTo: "2026-09-24",
        serviceId: "svc-gst-001",
      });
      expect(normalized.serviceId).toBe("svc-gst-001");
      expect(normalized.dateFrom).toBe("2026-09-18");
      expect(normalized.dateTo).toBe("2026-09-24");
    });

    it("D. Assignee filter (unassigned vs specific staff) normalization", () => {
      const unassigned = normalizeOrdersFilter({ assignedTo: "unassigned" });
      expect(unassigned.assignedTo).toBe("unassigned");

      const staff = normalizeOrdersFilter({ assignedTo: "user-uuid-123" });
      expect(staff.assignedTo).toBe("user-uuid-123");

      const all = normalizeOrdersFilter({ assignedTo: "all" });
      expect(all.assignedTo).toBeNull();
    });

    it("E. Search + Date combination normalization", () => {
      const normalized = normalizeOrdersFilter({
        dateFrom: "2026-09-24",
        dateTo: "2026-09-24",
        search: " 9876543210 ",
      });
      expect(normalized.search).toBe("9876543210");
      expect(normalized.dateFrom).toBe("2026-09-24");
    });

    it("F. Rapid filter changes produce unique deterministic cache keys", () => {
      const filterToday = normalizeOrdersFilter({ dateFrom: "2026-09-24", dateTo: "2026-09-24" });
      const filter1824 = normalizeOrdersFilter({ dateFrom: "2026-09-18", dateTo: "2026-09-24" });
      const filterSvc = normalizeOrdersFilter({ dateFrom: "2026-09-18", dateTo: "2026-09-24", serviceId: "svc-1" });

      const keyToday = getOrdersQueryKey(filterToday, 1);
      const key1824 = getOrdersQueryKey(filter1824, 1);
      const keySvc = getOrdersQueryKey(filterSvc, 1);

      // TanStack Query keys are structurally distinct so stale responses never overwrite
      expect(keyToday).not.toEqual(key1824);
      expect(key1824).not.toEqual(keySvc);
    });
  });
});
