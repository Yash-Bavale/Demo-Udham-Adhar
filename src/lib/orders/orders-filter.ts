/**
 * Canonical Orders Filter & Date Boundary System
 * Guarantees consistent date boundaries in Asia/Kolkata (IST) across all KPI cards,
 * table listings, and background pagination queries.
 */

import { istDateKey } from "@/lib/datetime";

export type OrdersFilter = {
  dateFrom?: string;
  dateTo?: string;
  timezone?: "Asia/Kolkata";
  search?: string;
  bucket?: string;
  stage?: string;
  actionStatus?: string;
  serviceId?: string;
  assignedTo?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  pendingAge?: string;
  customDays?: string;
  sortField?: "created_at" | "stage" | "stage_journey";
  sortOrder?: "asc" | "desc";
  viewMode?: "self" | "team";
};

export type NormalizedOrdersFilter = {
  dateFrom: string | null;
  dateTo: string | null;
  fromIso: string | null;
  toIso: string | null;
  timezone: "Asia/Kolkata";
  search: string | null;
  bucket: string;
  stage: string | null;
  actionStatus: string;
  serviceId: string | null;
  assignedTo: string | null;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  pendingAge: string | null;
  customDays: number | null;
  sortField: "created_at" | "stage" | "stage_journey";
  sortOrder: "asc" | "desc";
  viewMode: "self" | "team";
};

/**
 * Returns exact start-of-day and end-of-day ISO strings in Asia/Kolkata (IST).
 * 
 * Example:
 * 18 Sep 2026 -> 24 Sep 2026
 * fromIso: 2026-09-18T00:00:00.000+05:30 (2026-09-17T18:30:00.000Z)
 * toIso:   2026-09-24T23:59:59.999+05:30 (2026-09-24T18:29:59.999Z)
 */
export function getOrdersDateRange(input: {
  from?: string | Date | null;
  to?: string | Date | null;
  timezone?: string;
}): { fromIso?: string; toIso?: string; fromKey?: string; toKey?: string } {
  let fromIso: string | undefined;
  let toIso: string | undefined;
  let fromKey: string | undefined;
  let toKey: string | undefined;

  if (input.from) {
    if (input.from instanceof Date) {
      fromKey = istDateKey(input.from);
    } else {
      const s = String(input.from).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        fromKey = s;
      } else if (s) {
        fromKey = istDateKey(s) || s.slice(0, 10);
      }
    }
    if (fromKey && /^\d{4}-\d{2}-\d{2}$/.test(fromKey)) {
      fromIso = new Date(`${fromKey}T00:00:00.000+05:30`).toISOString();
    } else if (input.from) {
      fromIso = new Date(input.from).toISOString();
    }
  }

  if (input.to) {
    if (input.to instanceof Date) {
      toKey = istDateKey(input.to);
    } else {
      const s = String(input.to).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        toKey = s;
      } else if (s) {
        toKey = istDateKey(s) || s.slice(0, 10);
      }
    }
    if (toKey && /^\d{4}-\d{2}-\d{2}$/.test(toKey)) {
      toIso = new Date(`${toKey}T23:59:59.999+05:30`).toISOString();
    } else if (input.to) {
      toIso = new Date(input.to).toISOString();
    }
  }

  return { fromIso, toIso, fromKey, toKey };
}

/**
 * Normalizes filter inputs so semantically identical filters yield identical cache keys
 * and queries. Converts empty strings/"all" to null, trims search, parses numbers.
 */
export function normalizeOrdersFilter(raw: OrdersFilter): NormalizedOrdersFilter {
  const { fromIso, toIso, fromKey, toKey } = getOrdersDateRange({
    from: raw.dateFrom,
    to: raw.dateTo,
    timezone: "Asia/Kolkata",
  });

  const search = raw.search?.trim() || null;
  const bucket = raw.bucket || "all";
  const stage = raw.stage && raw.stage !== "all" ? raw.stage.trim() : null;
  const actionStatus = raw.actionStatus || "all";
  const serviceId = raw.serviceId && raw.serviceId !== "all" ? raw.serviceId.trim() : null;
  const assignedTo = raw.assignedTo && raw.assignedTo !== "all" ? raw.assignedTo.trim() : null;
  const paymentStatus = raw.paymentStatus && raw.paymentStatus !== "all" ? raw.paymentStatus.trim() : null;
  const fulfillmentStatus = raw.fulfillmentStatus && raw.fulfillmentStatus !== "all" ? raw.fulfillmentStatus.trim() : null;
  const pendingAge = raw.pendingAge && raw.pendingAge !== "any" ? raw.pendingAge.trim() : null;
  const customDays = raw.customDays ? parseInt(raw.customDays, 10) || null : null;
  const sortField = raw.sortField || "created_at";
  const sortOrder = raw.sortOrder || "desc";

  return {
    dateFrom: fromKey || null,
    dateTo: toKey || null,
    fromIso: fromIso || null,
    toIso: toIso || null,
    timezone: "Asia/Kolkata",
    search,
    bucket,
    stage,
    actionStatus,
    serviceId,
    assignedTo,
    paymentStatus,
    fulfillmentStatus,
    pendingAge,
    customDays,
    sortField,
    sortOrder,
    viewMode: raw.viewMode || "self",
  };
}

/**
 * Builds a deterministic TanStack Query cache key for orders.
 */
export function getOrdersQueryKey(normalized: NormalizedOrdersFilter, page: number): readonly unknown[] {
  return [
    "admin.orders.v2",
    page,
    normalized.viewMode,
    normalized.fromIso,
    normalized.toIso,
    normalized.search,
    normalized.bucket,
    normalized.stage,
    normalized.actionStatus,
    normalized.serviceId,
    normalized.assignedTo,
    normalized.paymentStatus,
    normalized.fulfillmentStatus,
    normalized.pendingAge,
    normalized.customDays,
    normalized.sortField,
    normalized.sortOrder,
  ] as const;
}

/**
 * Builds a deterministic TanStack Query cache key for KPI aggregates.
 */
export function getOrdersKPIsQueryKey(normalized: NormalizedOrdersFilter): readonly unknown[] {
  return [
    "admin.orders.kpis",
    normalized.fromIso,
    normalized.toIso,
    normalized.search,
    normalized.stage,
    normalized.actionStatus,
    normalized.serviceId,
    normalized.assignedTo,
    normalized.paymentStatus,
    normalized.fulfillmentStatus,
    normalized.pendingAge,
    normalized.customDays,
  ] as const;
}
