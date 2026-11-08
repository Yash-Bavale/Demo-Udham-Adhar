// Order Management server functions (Phase 2).
// Built fresh alongside legacy orders.functions.ts. Once /admin/applications
// is fully retired the legacy file can be removed.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUserAdmin } from "@/lib/audit";
import { getUserModulePermission } from "./permissions.functions";
import {
  FULFILLMENT_STAGES,
  FULFILLMENT_LABEL,
  type FulfillmentStatus,
  getAllowedFulfillmentTransitions,
} from "./fulfillment-transitions";
import { computeOrderStage, STAGE_META, type OrderStage } from "./computeOrderStage";
import { istDateKey } from "@/lib/datetime";
import { normalizeOrdersFilter, getOrdersDateRange } from "@/lib/orders/orders-filter";
import { hasCurrentCycleCompletion } from "./callback-cycle";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function assertStaff(_supabase: any, userId?: string) {
  const admin = await getAdmin();
  let query = admin.from("user_roles").select("role");
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  const roles = new Set((data ?? []).map((r: any) => r.role));
  const allowed = ["admin", "super_admin", "operations", "support", "accounts", "finance", "executive", "manager"];
  if (!allowed.some((r) => roles.has(r))) throw new Error("Forbidden");
}

async function getStaff(userId: string) {
  const admin = await getAdmin();
  const [{ data: p }, { data: rr }] = await Promise.all([
    admin.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  return {
    staff_name: (p?.display_name as string) || (p?.email as string) || "Staff",
    staff_role: (rr?.role as string) || "staff",
  };
}

export type OrderPaymentRollup = "Pending" | "Paid" | "Partially Paid" | "Refunded" | "Failed";

function rollupPaymentStatus(payments: Array<{ status: string; amount: number }>, total: number): OrderPaymentRollup {
  if (!payments.length) return "Pending";
  const positives = payments.filter((p) => Number(p.amount || 0) >= 0);
  const refunds = payments.filter((p) => Number(p.amount || 0) < 0 || p.status === "refunded");
  if (refunds.length && positives.every((p) => p.status === "refunded")) return "Refunded";
  const paidSum = positives
    .filter((p) => ["paid", "success", "successful"].includes(p.status))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  if (paidSum <= 0) {
    if (positives.some((p) => ["failed", "cancelled"].includes(p.status))) return "Failed";
    return "Pending";
  }
  if (total > 0 && paidSum < total - 0.01) return "Partially Paid";
  return "Paid";
}

/**
 * Self-healing reconcile helper:
 * Finds any paid payments where application_id is null or where lead status is payment_successful,
 * creates missing applications, links the payments, and triggers finalizePaidPayment.
 */
const RECONCILE_INTERVAL_MS = 10 * 60_000;
let lastReconcileAt = 0;
let reconcileRunning = false;

async function ensurePaidOrdersIntegrated(admin: any) {
  try {
    // 0. Live gateway check for recent payment attempts (created/attempted/failed) to heal any missed webhooks
    const lookbackDate = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const { data: pendingPayments } = await admin
      .from("payments")
      .select("id, lead_id, gateway_name, transaction_id, razorpay_order_id, status")
      .in("status", ["created", "attempted", "failed"])
      .gt("created_at", lookbackDate)
      .limit(50);

    if (pendingPayments && pendingPayments.length > 0) {
      const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
      for (const p of pendingPayments) {
        const txnid = p.transaction_id || p.razorpay_order_id;
        if (!txnid) continue;
        const gw = String(p.gateway_name ?? "payu").toLowerCase();

        if (gw === "payu") {
          try {
            const { verifyPayUPayment } = await import("@/lib/payments/payu.server");
            const verified = await verifyPayUPayment(txnid);
            const status = String(verified?.status ?? "").trim().toLowerCase();
            const unmapped = String(verified?.unmappedstatus ?? "").trim().toLowerCase();
            if (status === "success" || unmapped === "captured") {
              const mihpayid = verified?.mihpayid ? String(verified.mihpayid) : null;
              await admin.from("payments").update({
                status: "paid",
                payment_date: new Date().toISOString(),
                razorpay_payment_id: mihpayid,
                payu_mihpayid: mihpayid,
                raw_response: { verified_payment: verified, source: "ensurePaidOrdersIntegrated" } as any,
              } as any).eq("id", p.id);

              await finalizePaidPayment(p.id, { source: "reconcile", txnid, mihpayid });
            }
          } catch (err) {
            console.error(`[ensurePaidOrdersIntegrated] PayU verify failed for ${txnid}:`, err);
          }
        } else if (gw === "ccavenue") {
          try {
            const { callOrderStatusApi } = await import("@/lib/payments/ccavenue.server");
            const reconciled = await callOrderStatusApi(txnid);
            if (reconciled.status === "paid") {
              await admin.from("payments").update({
                status: "paid",
                payment_date: new Date().toISOString(),
                raw_response: { reconciled: reconciled.raw, source: "ensurePaidOrdersIntegrated" } as any,
              } as any).eq("id", p.id);

              await finalizePaidPayment(p.id, { source: "reconcile", txnid, mihpayid: reconciled.trackingId || null });
            }
          } catch (err) {
            console.error(`[ensurePaidOrdersIntegrated] CCAvenue verify failed for ${txnid}:`, err);
          }
        }
      }
    }

    // 1. Find payments with status paid/success/successful where application_id is NULL
    const { data: unlinkedPayments } = await admin
      .from("payments")
      .select("id, lead_id, application_id, status")
      .in("status", ["paid"])
      .is("application_id", null)
      .limit(100);

    if (unlinkedPayments && unlinkedPayments.length > 0) {
      const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
      for (const p of unlinkedPayments) {
        if (!p.lead_id) continue;
        try {
          await finalizePaidPayment(p.id, { source: "reconcile" });
        } catch (err) {
          console.error(`[self-heal] finalizePaidPayment failed for ${p.id}:`, err);
        }
      }
    }

    // 1B. Sync leads that have active (non-deleted) application rows to payment_successful
    const { data: appsWithLeads } = await admin
      .from("applications")
      .select("lead_id")
      .eq("is_deleted", false)
      .not("lead_id", "is", null)
      .limit(200);

    if (appsWithLeads && appsWithLeads.length > 0) {
      const appLeadIds = Array.from(new Set(appsWithLeads.map((a: any) => a.lead_id)));
      const { data: unsyncedLeads } = await admin
        .from("leads")
        .select("id, status")
        .in("id", appLeadIds)
        .not("status", "in", "(payment_successful,under_process,completed)");

      // Having an order row is NOT proof of payment. Only sync leads that
      // really hold a settled payment AND have no money still outstanding
      // (pending payment link, e.g. a service-change top-up).
      const candidateIds = (unsyncedLeads ?? []).map((l: any) => l.id);
      let unsyncedIds: string[] = [];
      if (candidateIds.length > 0) {
        const { data: paidRows } = await admin
          .from("payments")
          .select("lead_id")
          .in("lead_id", candidateIds)
          .eq("status", "paid");
        const { data: pendingLinks } = await admin
          .from("payment_links")
          .select("lead_id")
          .in("lead_id", candidateIds)
          .eq("status", "pending");
        const pendingSet = new Set((pendingLinks ?? []).map((r: any) => r.lead_id));
        unsyncedIds = Array.from(
          new Set((paidRows ?? []).map((r: any) => r.lead_id).filter((id: string) => !pendingSet.has(id))),
        );
      }

      if (unsyncedIds.length > 0) {
        await admin
          .from("leads")
          .update({
            status: "payment_successful",
            lead_status_v2: "payment_successful",
          } as any)
          .in("id", unsyncedIds);
      }
    }

    // 2. Find leads marked payment_successful that don't have an application row
    const { data: paidLeads } = await admin
      .from("leads")
      .select("id, customer_id, service_id, assigned_to, website_id")
      .in("status", ["payment_successful"])
      .limit(100);

    if (paidLeads && paidLeads.length > 0) {
      const leadIds = paidLeads.map((l: any) => l.id);
      const { data: existingApps } = await admin
        .from("applications")
        .select("lead_id")
        .in("lead_id", leadIds)
        .eq("is_deleted", false);
      const existingLeadIdSet = new Set((existingApps ?? []).map((a: any) => a.lead_id));

      const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
      for (const l of paidLeads) {
        if (!existingLeadIdSet.has(l.id)) {
          // Double-check atomically right before processing to prevent race condition duplicates
          const { data: atomicApp } = await admin
            .from("applications")
            .select("id")
            .eq("lead_id", l.id)
            .eq("is_deleted", false)
            .limit(1)
            .maybeSingle();
          if (atomicApp) continue;
          // Missing application row! Find the paid payment for this lead and run finalizePaidPayment.
          const { data: p } = await admin
            .from("payments")
            .select("id")
            .eq("lead_id", l.id)
            .eq("status", "paid")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (p?.id) {
            try {
              await finalizePaidPayment(p.id, { source: "reconcile" });
            } catch (err) {
              console.error(`[self-heal] finalizePaidPayment failed for lead ${l.id}:`, err);
            }
          } else {
            // If no payment row exists, create the application row directly.
            const { data: createdApp, error: createAppError } = await admin
              .from("applications")
              .insert({
                lead_id: l.id,
                customer_id: l.customer_id ?? null,
                service_id: l.service_id ?? null,
                // Paid orders rotate independently from leads. Leaving this
                // empty lets the order assignment trigger choose the next
                // employee instead of copying the lead owner.
                assigned_to: null,
                website_id: l.website_id ?? null,
                application_status: "payment_received",
                fulfillment_status: "order_received",
              })
              .select("id")
              .maybeSingle();

            if (createdApp?.id) {
              await admin
                .from("payments")
                .update({ application_id: createdApp.id, status: "paid" })
                .eq("lead_id", l.id);
            } else if (createAppError?.code !== "23505") {
              console.error(`[self-heal] order create failed for lead ${l.id}:`, createAppError);
            }
          }
        }
    }
    }

    // 3. Revert leads prematurely marked payment_pending without any payment attempt or payment link
    const { data: pendingLeads } = await admin
      .from("leads")
      .select("id")
      .eq("status", "payment_pending")
      .limit(100);

    if (pendingLeads && pendingLeads.length > 0) {
      const pIds = pendingLeads.map((l: any) => l.id);
      const { data: pmtRows } = await admin.from("payments").select("lead_id").in("lead_id", pIds);
      const { data: linkRows } = await admin.from("payment_links" as any).select("lead_id").in("lead_id", pIds);
      const { data: appRows } = await admin.from("applications").select("lead_id").in("lead_id", pIds).eq("is_deleted", false);

      const activePLeadIds = new Set([
        ...(pmtRows ?? []).map((p: any) => p.lead_id),
        ...(linkRows ?? []).map((l: any) => l.lead_id),
        ...(appRows ?? []).map((a: any) => a.lead_id),
      ].filter(Boolean));

      const orphanedLeadIds = pIds.filter((id: string) => !activePLeadIds.has(id));
      if (orphanedLeadIds.length > 0) {
        await admin
          .from("leads")
          .update({ status: "new_lead", lead_status_v2: "new_lead" } as any)
          .in("id", orphanedLeadIds);
      }
    }

    // 3. Self-heal applications rows where service_id IS NULL but lead has service_id or service text
    const { data: nullSvcApps } = await admin
      .from("applications")
      .select("id, lead_id, service_id")
      .is("service_id", null)
      .not("lead_id", "is", null)
      .eq("is_deleted", false)
      .limit(100);

    if (nullSvcApps && nullSvcApps.length > 0) {
      const leadIds = Array.from(new Set(nullSvcApps.map((a: any) => a.lead_id)));
      const { data: leadsWithSvc } = await admin
        .from("leads")
        .select("id, service_id, service")
        .in("id", leadIds);

      const leadSvcMap = new Map<string, any>(
        (leadsWithSvc ?? []).map((l: any) => [l.id as string, l]),
      );
      const { data: allServices } = await admin
        .from("services")
        .select("id, service_name");

      const svcNameToId = new Map<string, string>();
      for (const s of allServices ?? []) {
        if (s.service_name) {
          svcNameToId.set(s.service_name.trim().toLowerCase(), s.id);
        }
      }

      for (const app of nullSvcApps) {
        const lead = leadSvcMap.get(app.lead_id);
        if (!lead) continue;
        let resolvedServiceId = lead.service_id;
        if (!resolvedServiceId && lead.service) {
          resolvedServiceId = svcNameToId.get(lead.service.trim().toLowerCase()) ?? null;
        }
        if (resolvedServiceId) {
          await admin
            .from("applications")
            .update({ service_id: resolvedServiceId })
            .eq("id", app.id);
          if (!lead.service_id) {
            await admin
              .from("leads")
              .update({ service_id: resolvedServiceId })
              .eq("id", lead.id);
          }
        }
      }
    }

    // Note: Autonomous reassignment for departed/terminated staff is handled by scheduled workforce crons,
    // not inside read query self-healing.
  } catch (err) {
    console.error("[ensurePaidOrdersIntegrated] error:", err);
  }
}

const CLOSED_FS = new Set<string>([
  "application_rejected", "certificate_rejected", "order_closed", "cancelled",
]);
const COMPLETED_FS = new Set<string>([
  "consultation_completed",
  "order_completed",
  "completed",
  "certificate_ready",
  "certificate_delivered",
  "certificate_uploaded",
  "service_completed",
  "application_approved",
  "approved",
]);
const EXCEPTION_STAGES: OrderStage[] = ["refund_requested", "refunded", "uninterested"];
const NEEDS_ACTION_STAGES: OrderStage[] = ["lead_received", "payment_done", "form_submitted", "form_not_submitted", "order_reopened"];

export function isNeedsActionOrder(row: any): boolean {
  if (row.is_terminal) return false;
  if (row.customer_resumed_pending) return true;

  // 1. Exclude orders that already have an active scheduled callback in the future (they belong in Call Back Scheduled)
  if (row.is_callback_scheduled || (row.callback_reminder && !row.callback_reminder.is_due)) return false;

  // Hot = callback came due or order reopened without a future callback → needs staff action now
  if (row.is_hot) return true;
  const fs = String(row.fulfillment_status ?? "").toLowerCase();
  const stage = String(row.stage ?? "").toLowerCase();
  const os = String(row.order_status ?? "").toUpperCase();
  const ws = String(row.workflow_status ?? "").toLowerCase();

  // 2. Exclude terminal states (completed / closed)
  if (stage === "completed" || stage === "closed" || COMPLETED_FS.has(fs) || CLOSED_FS.has(fs)) return false;

  // 3. Exclude Technical Delay and Customer Delay (they belong in their dedicated tabs / Action Taken)
  if (isTechnicalDelayOrder(row) || isCustomerDelayOrder(row)) return false;

  // 4. Exclude Form Not Submitted where form link has already been sent or awaiting customer form (Action Taken)
  // Rule: applying any delay (Customer, Technical, Form Not Submitted) is an
  // action taken — the order leaves Need Action until the customer submits
  // (customer_resumed_pending) or it becomes Hot/reopened (handled above).
  if (
    Boolean(row.form_link_sent_at) ||
    fs === "form_not_submitted" ||
    (stage === "form_not_submitted" && os !== "REOPENED" && fs !== "order_reopened" && ws !== "order_reopened") ||
    fs === "awaiting_customer_form" ||
    fs === "waiting_for_customer_submission" ||
    fs === "form_link_sent" ||
    fs === "form_pending" ||
    (stage === "form_not_submitted" && Boolean(row.form_link_sent_at))
  ) {
    return false;
  }

  // 5. Exclude progressed stages like Certificate Ready, Submitted to Govt, Under Processing, Refunded
  const progressedStages = new Set([
    "submitted_to_govt",
    "under_processing",
    "under_review",
    "certificate_ready",
    "certificate_delivered",
    "certificate_uploaded",
    "consultation_completed",
    "refunded",
    "refund_requested",
    "application_rejected",
    "certificate_rejected",
    "verification_pending",
    "documents_received",
    "government_processing",
  ]);
  if (progressedStages.has(stage) || progressedStages.has(fs)) return false;

  // 6. Exclude orders where qualifying human staff action has already been taken (they belong in Action Taken)
  if (row.in_range_action_taken || (row.action_count && row.action_count > 0)) {
    return false;
  }

  // 7. Actively reopened orders (current state is reopened) and Hot Orders show in Needs Action
  const isCurrentlyReopened =
    stage === "order_reopened" ||
    fs === "order_reopened" ||
    ws === "order_reopened" ||
    os === "REOPENED";

  if (isCurrentlyReopened || row.is_hot) return true;

  // Untouched action-needed stages
  return (
    stage === "lead_received" ||
    stage === "payment_done" ||
    stage === "form_submitted" ||
    stage === "form_not_submitted" ||
    stage === "order_reopened" ||
    fs === "order_received" ||
    fs === "payment_done" ||
    fs === "form_submitted"
  );
}

export function isNeedsActionStage(stage: OrderStage): boolean {
  return NEEDS_ACTION_STAGES.includes(stage);
}

export type Bucket =
  | "all"
  | "needs_action"
  | "hot_orders"
  | "reminders" // Call Back Scheduled (Active only)
  | "technical_delay" // Technical Delay
  | "backlog" // Backlog (Untouched orders from previous days)
  | "customer_delay" // Customer Delay
  | "pending" // Action Taken
  | "completed" // Completed (Count only)
  | "closed" // Closed (Count only)
  | "exception";

export function isCustomerDelayOrder(row: any): boolean {
  const fs = String(row.fulfillment_status ?? "").toLowerCase();
  const stage = String(row.stage ?? "").toLowerCase();
  if (row.is_terminal || stage === "completed" || stage === "closed" || COMPLETED_FS.has(fs) || CLOSED_FS.has(fs)) return false;

  const ws = String(row.workflow_status ?? "").toLowerCase();
  const os = String(row.order_status ?? "").toUpperCase();
  const cbChannel = String(row.callback_reminder?.remarks?.channel ?? "").toLowerCase();
  const cbReason = String(row.callback_reminder?.remarks?.reason ?? "").toLowerCase();
  const cbKind = String(row.callback_reminder?.remarks?.kind ?? "").toLowerCase();
  const schedulerType = String(row.callback_reminder?.scheduler_type ?? "").toLowerCase();
  const reasonCat = String(row.callback_reminder?.remarks?.reasonCategory ?? "").toUpperCase();

  return (
    stage === "customer_delay" ||
    fs === "customer_delay" ||
    fs === "customer_hold" ||
    ws === "customer_delay" ||
    ws === "waiting_for_customer" ||
    ws === "waiting_for_documents" ||
    ws === "customer_non_responsive" ||
    ws === "external_dependency" ||
    os === "CUSTOMER_HOLD" ||
    cbChannel === "customer_delay" ||
    cbReason === "customer_delay" ||
    cbKind === "customer_delay" ||
    cbKind === "external_dependency" ||
    schedulerType === "customer_delay_reminder" ||
    schedulerType === "customer_hold_reminder" ||
    schedulerType === "customer_side_delay" ||
    reasonCat === "A" ||
    Boolean(row.customer_hold_started_at)
  );
}

export function isTechnicalDelayOrder(row: any): boolean {
  const fs = String(row.fulfillment_status ?? "").toLowerCase();
  const stage = String(row.stage ?? "").toLowerCase();
  if (row.is_terminal || stage === "completed" || stage === "closed" || COMPLETED_FS.has(fs) || CLOSED_FS.has(fs)) return false;

  // Safeguard: Customer Delay is NEVER Technical Delay
  if (isCustomerDelayOrder(row)) return false;

  const ws = String(row.workflow_status ?? "").toLowerCase();
  const os = String(row.order_status ?? "").toUpperCase();
  const cbChannel = String(row.callback_reminder?.remarks?.channel ?? "").toLowerCase();
  const cbReason = String(row.callback_reminder?.remarks?.reason ?? "").toLowerCase();
  const cbKind = String(row.callback_reminder?.remarks?.kind ?? "").toLowerCase();
  const schedulerType = String(row.callback_reminder?.scheduler_type ?? "").toLowerCase();
  const reasonCat = String(row.callback_reminder?.remarks?.reasonCategory ?? "").toUpperCase();

  return (
    stage === "technical_delay" ||
    fs === "technical_delay" ||
    fs === "technical_hold" ||
    ws === "technical_delay" ||
    ws === "technical_hold" ||
    ws === "government_portal_pending" ||
    os.includes("TECHNICAL_HOLD") ||
    cbChannel === "technical_delay" ||
    cbReason === "technical_delay" ||
    cbKind === "technical_delay" ||
    schedulerType === "technical_hold_reminder" ||
    schedulerType === "our_side_delay" ||
    reasonCat === "B" ||
    (Boolean(row.technical_hold_started_at) && !Boolean(row.customer_hold_started_at))
  );
}

export function isCallbackScheduledOrder(row: any): boolean {
  const fs = String(row.fulfillment_status ?? "").toLowerCase();
  const stage = String(row.stage ?? "").toLowerCase();
  if (row.is_terminal || row.is_hot || stage === "completed" || stage === "closed" || COMPLETED_FS.has(fs) || CLOSED_FS.has(fs)) return false;
  return Boolean(
    row.is_callback_scheduled ||
    (row.callback_reminder && !row.callback_reminder.is_due)
  );
}

export function isBacklogOrder(row: any, todayIst?: string): boolean {
  const fs = String(row.fulfillment_status ?? "").toLowerCase();
  const stage = String(row.stage ?? "").toLowerCase();
  if (row.is_terminal || stage === "completed" || stage === "closed" || COMPLETED_FS.has(fs) || CLOSED_FS.has(fs)) return false;
  if (isCustomerDelayOrder(row) || isTechnicalDelayOrder(row)) return false;
  const curToday = todayIst || istDateKey(new Date());
  const rowDate = istDateKey(row.created_at);
  return Boolean(rowDate && rowDate < curToday);
}

export function isActionTakenOrder(row: any): boolean {
  const fs = String(row.fulfillment_status ?? "").toLowerCase();
  const stage = String(row.stage ?? "").toLowerCase();
  if (row.is_terminal || stage === "completed" || stage === "closed" || COMPLETED_FS.has(fs) || CLOSED_FS.has(fs)) return false;

  // Never Action Taken if order currently needs action or is hot/reopened
  if (isNeedsActionOrder(row)) return false;

  const actionTakenStatuses = new Set([
    "government_processing",
    "technical_delay",
    "customer_delay",
    "application_rejected",
    "certificate_rejected",
    "under_processing",
    "application_submitted",
    "verification_pending",
    "documents_received",
    "waiting_for_customer_submission",
    "awaiting_customer_form",
    "form_link_sent",
    "form_pending",
  ]);

  const actionTakenStages = new Set([
    "technical_delay",
    "customer_delay",
    "consultation_completed",
    "under_review",
    "in_progress",
    "submitted_to_govt",
    "under_processing",
    "certificate_ready",
  ]);

  return Boolean(
    row.in_range_action_taken ||
    (row.action_count && row.action_count > 0) ||
    isTechnicalDelayOrder(row) ||
    isCustomerDelayOrder(row) ||
    isCallbackScheduledOrder(row) ||
    row.is_callback_scheduled ||
    Boolean(row.form_link_sent_at) ||
    actionTakenStatuses.has(fs) ||
    actionTakenStages.has(stage) ||
    // Any applied delay (incl. Form Not Submitted Delay) = staff action taken.
    fs === "form_not_submitted" ||
    stage === "form_not_submitted"
  );
}

export function bucketOfRow(
  row: {
    fulfillment_status?: string | null;
    stage: OrderStage;
    created_at?: string | null;
    is_hot?: boolean;
    is_callback_scheduled?: boolean;
    callback_reminder?: any;
    workflow_status?: string | null;
    technical_hold_started_at?: string | null;
    is_terminal?: boolean;
    in_range_action_taken?: boolean;
    action_count?: number;
  },
  todayIst?: string,
): Exclude<Bucket, "all"> {
  const fs = String(row.fulfillment_status ?? "").toLowerCase();
  if (EXCEPTION_STAGES.includes(row.stage)) return "exception";
  if (CLOSED_FS.has(fs) || row.stage === "closed") return "closed";
  if (COMPLETED_FS.has(fs) || row.stage === "completed") return "completed";

  // Hot Orders: strictly under Hot Orders ONLY if genuinely hot and untouched by staff
  if (row.is_hot && !row.in_range_action_taken && !((row as any).action_count && (row as any).action_count > 0)) {
    return "hot_orders";
  }

  // Customer submitted the form after Customer Delay / Form Not Submitted Delay → Need Action
  if ((row as any).customer_resumed_pending) return "needs_action";

  // Call Back Scheduled: only active/future callbacks (fires_at > now)
  if (row.is_callback_scheduled || ((row as any).callback_reminder && !(row as any).callback_reminder.is_due)) return "reminders";

  // Customer Delay (evaluated before technical delay to guarantee customer delay is never placed into technical delay)
  if (isCustomerDelayOrder(row)) return "customer_delay";

  // Technical Delay (full name)
  if (isTechnicalDelayOrder(row)) return "technical_delay";

  // Backlog: all active non-delay action-needed orders from yesterday and before all-time
  const curToday = todayIst || istDateKey(new Date());
  const rowDate = istDateKey(row.created_at);
  if (rowDate && rowDate < curToday && isNeedsActionOrder(row)) {
    return "backlog";
  }

  // Today's action-required untouched orders
  if (isNeedsActionOrder(row)) {
    return "needs_action";
  }

  // All other active in-progress stages where action has been taken (e.g. submitted to govt)
  return "pending"; // Action Taken
}

export function isPendingRow(row: {
  fulfillment_status?: string | null;
  stage: OrderStage;
  created_at?: string | null;
  is_hot?: boolean;
  is_callback_scheduled?: boolean;
}): boolean {
  const b = bucketOfRow(row);
  return b === "pending" || b === "needs_action" || b === "backlog";
}

export function getOrderActionStatus(order: {
  fulfillment_status?: string | null;
  stage: OrderStage;
  form_link_sent_at?: string | null;
  is_hot?: boolean;
  is_callback_scheduled?: boolean;
}): { label: string; tone: "red" | "green" | "blue" | "purple" } {
  if (order.is_hot) {
    return { label: "Call Due Now", tone: "red" };
  }
  if (order.is_callback_scheduled) {
    return { label: "Scheduled Callback", tone: "blue" };
  }

  const fs = order.fulfillment_status ?? "order_received";
  const stage = order.stage;

  const greenStatuses = new Set([
    "application_approved",
    "consultation_completed",
    "order_completed",
    "completed",
  ]);
  if (greenStatuses.has(fs) || stage === "completed") {
    return { label: "Order Completed", tone: "green" };
  }

  if (fs === "order_closed" || fs === "cancelled" || stage === "closed") {
    return { label: "Order Closed", tone: "red" };
  }

  const blueStatuses = new Set([
    "government_processing",
    "technical_delay",
    "customer_delay",
    "application_rejected",
    "certificate_rejected",
    "under_processing",
    "application_submitted",
    "verification_pending",
    "documents_received",
    "waiting_for_customer_submission",
    "awaiting_customer_form",
    "form_link_sent",
    "form_pending",
  ]);
  const blueStages = new Set([
    "technical_delay",
    "customer_delay",
    "consultation_completed",
    "under_review",
    "in_progress",
    "submitted_to_govt",
    "under_processing",
    "certificate_ready",
    "refunded",
    "refund_requested",
  ]);

  if (
    Boolean((order as any).in_range_action_taken) ||
    Boolean((order as any).action_count && (order as any).action_count > 0) ||
    blueStatuses.has(fs) ||
    blueStages.has(stage) ||
    Boolean(order.form_link_sent_at)
  ) {
    return { label: "Action Taken", tone: "blue" };
  }

  return { label: "Action Required", tone: "red" };
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function parseDateBounds(dateFrom?: string, dateTo?: string) {
  return getOrdersDateRange({ from: dateFrom, to: dateTo, timezone: "Asia/Kolkata" });
}

/** Reads every row of a query page by page (1,000 per request) so results are never truncated. */
async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

async function fetchInChunks<T>(
  ids: string[],
  chunkSize: number,
  fetchFn: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  if (!ids || ids.length === 0) return [];
  const results: T[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const batchSize = 10;
  for (let b = 0; b < chunks.length; b += batchSize) {
    const currentBatch = chunks.slice(b, b + batchSize);
    const resList = await Promise.all(currentBatch.map((c) => fetchFn(c)));
    for (const res of resList) {
      if (res.error) console.error("[fetchInChunks] error:", res.error);
      if (res.data) results.push(...res.data);
    }
  }
  return results;
}

/* ----------------------------- listOrders ------------------------------- */

export const listOrdersV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        fulfillmentStatus: z.string().optional(),
        serviceId: z.string().optional(),
        assignedTo: z.string().optional(),
        paymentStatus: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        search: z.string().max(120).optional(),
        bucket: z.string().optional().default("all"),
        stage: z.string().optional(),
        actionStatus: z.string().optional().default("all"),
        pendingAge: z.string().optional(),
        customDays: z.string().optional(),
        sortField: z.enum(["created_at", "stage", "stage_journey"]).optional().default("created_at"),
        sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
        viewMode: z.enum(["self", "team"]).optional().default("self"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const admin = await getAdmin();
    const { getStaffRoleInfo } = await import("@/lib/crm/order-auth.server");
    const staffInfo = await getStaffRoleInfo(admin, context.userId);
    const { isAdmin, isManager } = staffInfo;
    const perm = await getUserModulePermission(context.supabase, context.userId, "orders");

    if (!perm.canView) {
      return {
        rows: [],
        total: 0,
        counts: { all: 0, needs_action: 0, pending: 0, completed: 0, closed: 0, exception: 0, actionRequired: 0, processed: 0, reminders: 0, hot_orders: 0, technical_delay: 0, customer_delay: 0, totalAll: 0 },
        ageBuckets: { d1: 0, d2: 0, d3: 0, d7: 0, older: 0 },
        page: data.page,
        pageSize: data.pageSize,
        teamBreakdown: [],
      };
    }

    // Self-healing gateway check, throttled: runs at most once every 10 minutes
    // per server instance instead of on every Orders refresh. Webhooks and the
    // payu-reconcile cron remain the primary paths.
    const nowMs = Date.now();
    if (!reconcileRunning && nowMs - lastReconcileAt > RECONCILE_INTERVAL_MS) {
      lastReconcileAt = nowMs;
      reconcileRunning = true;
      ensurePaidOrdersIntegrated(admin)
        .catch((err) => {
          console.error("[listOrdersV2] background reconciliation error:", err);
        })
        .finally(() => {
          reconcileRunning = false;
        });
    }

    if (!isAdmin && !isManager) {
      // Regular employees can only see current situation (today in IST)
      const todayKey = istDateKey(new Date());
      data.dateFrom = todayKey;
      data.dateTo = todayKey;
    }

    const normalized = normalizeOrdersFilter(data);

    let matchingLeadIds: string[] | null = null;
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      const { data: matchedLeads } = await admin
        .from("leads")
        .select("id")
        .or(`name.ilike.${s},mobile.ilike.${s},email.ilike.${s},lead_code.ilike.${s}`)
        .limit(200);
      matchingLeadIds = (matchedLeads ?? []).map((l: any) => l.id);
    }

    function buildBaseQuery() {
      let query = admin
        .from("applications")
        .select(
          "id, application_code, fulfillment_status, application_status, order_status, created_at, assigned_to, lead_id, customer_id, service_id, form_submitted_at, certificate_uploaded_at, fulfilled_at, updated_at, reopened_at, workflow_status, closure_stage, closure_reason_code, refund_approved_at, refund_processed_at, technical_hold_started_at, technical_hold_kind, customer_hold_started_at, active_reason_text, workflow_delay_reason",
        )
        .eq("is_deleted", false);

      if (data.serviceId && data.serviceId !== "all" && data.serviceId.trim() !== "") {
        query = query.eq("service_id", data.serviceId);
      }

      const hasSearch = Boolean(data.search && data.search.trim());
      const isTeamMode = data.viewMode === "team";

      if (isTeamMode) {
        if (data.assignedTo && data.assignedTo !== "all" && data.assignedTo.trim() !== "") {
          if (data.assignedTo === "unassigned") {
            query = query.is("assigned_to", null);
          } else {
            query = query.eq("assigned_to", data.assignedTo);
          }
        } else if (!isAdmin) {
          // In team view without a specific assignee, exclude self orders so manager views other employees' metrics
          query = query.neq("assigned_to", context.userId);
        }
      } else {
        // Normal orders mode
        if ((isAdmin || isManager) && data.assignedTo && data.assignedTo !== "all" && data.assignedTo.trim() !== "") {
          if (data.assignedTo === "unassigned") {
            query = query.is("assigned_to", null);
          } else {
            query = query.eq("assigned_to", data.assignedTo);
          }
        } else if (!isAdmin && (!isManager || !hasSearch)) {
          query = query.eq("assigned_to", context.userId);
        }
      }

      if (data.search && data.search.trim()) {
        const term = `%${data.search.trim()}%`;
        if (matchingLeadIds && matchingLeadIds.length > 0) {
          query = query.or(`application_code.ilike.${term},lead_id.in.(${matchingLeadIds.join(",")})`);
        } else {
          query = query.ilike("application_code", term);
        }
      }
      return query;
    }

    // Fetch in-range applications by creation date, update date, fulfilled date, certificate date, delay dates, action logs, events, schedulers, and active portfolio
    const [
      inRangeCreatedRes,
      inRangeUpdatedRes,
      inRangeFulfilledRes,
      inRangeCertRes,
      inRangeTechHoldRes,
      inRangeCustHoldRes,
      inRangeEventsRes,
      inRangeCertificatesTableRes,
      inRangeActionLogsRes,
      inRangeSchedulersRes,
      activePortfolioRes,
    ] = await Promise.all([
      (() => {
        let q = buildBaseQuery();
        if (normalized.fromIso) q = q.gte("created_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("created_at", normalized.toIso);
        return q.order("created_at", { ascending: false }).limit(5000);
      })(),
      (() => {
        let q = buildBaseQuery();
        if (normalized.fromIso) q = q.gte("updated_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("updated_at", normalized.toIso);
        return q.order("updated_at", { ascending: false }).limit(5000);
      })(),
      (() => {
        let q = buildBaseQuery();
        if (normalized.fromIso) q = q.gte("fulfilled_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("fulfilled_at", normalized.toIso);
        return q.order("fulfilled_at", { ascending: false }).limit(5000);
      })(),
      (() => {
        let q = buildBaseQuery();
        if (normalized.fromIso) q = q.gte("certificate_uploaded_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("certificate_uploaded_at", normalized.toIso);
        return q.order("certificate_uploaded_at", { ascending: false }).limit(5000);
      })(),
      (() => {
        let q = buildBaseQuery();
        if (normalized.fromIso) q = q.gte("technical_hold_started_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("technical_hold_started_at", normalized.toIso);
        return q.order("technical_hold_started_at", { ascending: false }).limit(5000);
      })(),
      (() => {
        let q = buildBaseQuery();
        if (normalized.fromIso) q = q.gte("customer_hold_started_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("customer_hold_started_at", normalized.toIso);
        return q.order("customer_hold_started_at", { ascending: false }).limit(5000);
      })(),
      (() => {
        let q = admin
          .from("application_events")
          .select("id, application_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role, created_at");
        if (normalized.fromIso) q = q.gte("created_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("created_at", normalized.toIso);
        return q.order("created_at", { ascending: false }).limit(10000);
      })(),
      (() => {
        let q = admin
          .from("certificates")
          .select("id, application_id, certificate_number, uploaded_by, issued_at, delivered_at, created_at");
        if (normalized.fromIso) q = q.gte("created_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("created_at", normalized.toIso);
        return q.order("created_at", { ascending: false }).limit(5000);
      })(),
      (() => {
        let q = (admin
          .from("order_action_logs" as any) as any)
          .select("id, order_id, action_type, new_status, new_stage, employee_id, employee_name, notes, created_at");
        if (normalized.fromIso) q = q.gte("created_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("created_at", normalized.toIso);
        return q.order("created_at", { ascending: false }).limit(10000);
      })(),
      (() => {
        let q = admin
          .from("order_schedulers")
          .select("id, application_id, status, scheduler_type, fires_at, remarks, created_at, created_by");
        if (normalized.fromIso) q = q.gte("created_at", normalized.fromIso);
        if (normalized.toIso) q = q.lte("created_at", normalized.toIso);
        return q.order("created_at", { ascending: false }).limit(5000);
      })(),
      buildBaseQuery()
        .or("closure_stage.is.null,closure_stage.eq.none")
        .not("fulfillment_status", "in", "(completed,order_completed,order_closed,cancelled,application_rejected,certificate_rejected,consultation_completed)")
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    if (inRangeCreatedRes.error) throw new Error(inRangeCreatedRes.error.message);

    const mergedAppMap = new Map<string, any>();
    (activePortfolioRes.data ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));
    (inRangeCreatedRes.data ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));
    (inRangeUpdatedRes.data ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));
    (inRangeFulfilledRes.data ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));
    (inRangeCertRes.data ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));
    (inRangeTechHoldRes.data ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));
    (inRangeCustHoldRes.data ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));

    // For any application_id returned from in-range events/certificates/action_logs/schedulers not yet in mergedAppMap, fetch those applications
    const inRangeEventAppIds = Array.from(
      new Set([
        ...(inRangeEventsRes.data ?? []).map((e: any) => e.application_id),
        ...(inRangeCertificatesTableRes.data ?? []).map((c: any) => c.application_id),
        ...(inRangeActionLogsRes.data ?? []).map((l: any) => l.order_id),
        ...(inRangeSchedulersRes.data ?? []).map((s: any) => s.application_id),
      ].filter((id: string) => id && !mergedAppMap.has(id)))
    );

    if (inRangeEventAppIds.length > 0) {
      const extraApps = await fetchInChunks<any>(inRangeEventAppIds, 200, (chunk) =>
        buildBaseQuery().in("id", chunk)
      );
      (extraApps ?? []).forEach((a: any) => mergedAppMap.set(a.id, a));
    }

    const appList = Array.from(mergedAppMap.values());

    if (appList.length === 0) {
      return {
        rows: [],
        total: 0,
        counts: { all: 0, needs_action: 0, pending: 0, completed: 0, closed: 0, exception: 0, actionRequired: 0, processed: 0, reminders: 0, hot_orders: 0, technical_delay: 0, customer_delay: 0, totalAll: 0, pending_orders: 0 },
        ageBuckets: { d1: 0, d2: 0, d3: 0, d7: 0, older: 0 },
        page: data.page,
        pageSize: data.pageSize,
        teamBreakdown: [],
      };
    }

    const ids = appList.map((a) => a.id);

    // Chunked: a single .in() with thousands of ids exceeds URL limits and
    // silently returns nothing (no callbacks → no Hot / Call Back counts).
    const [eventsData, certsData, actionLogsData, globalActiveSchedulers] = await Promise.all([
      // Events: only the selected date range (what the counts need), plus the few
      // all-time state markers used for live Hot / reopen / resumed status.
      // Every query is paged so nothing is silently dropped at the 1,000-row API limit.
      (async () => {
        const cols = "id, application_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role, created_at";
        const STATE_TYPES = ["hot_priority_escalated", "order_reopened", "customer_form_resumed", "callback_completed", "consultation_completed", "callback_scheduled"];
        const ranged = await fetchInChunks<any>(ids, 200, (chunk) =>
          fetchAllPages((from, to) => {
            let q = admin.from("application_events").select(cols).in("application_id", chunk);
            if (normalized.fromIso) q = q.gte("created_at", normalized.fromIso);
            if (normalized.toIso) q = q.lte("created_at", normalized.toIso);
            return q.order("created_at", { ascending: false }).order("id").range(from, to);
          }),
        );
        if (!normalized.fromIso && !normalized.toIso) return ranged;
        const state = await fetchInChunks<any>(ids, 200, (chunk) =>
          fetchAllPages((from, to) =>
            admin.from("application_events").select(cols)
              .in("application_id", chunk).in("event_type", STATE_TYPES)
              .order("created_at", { ascending: false }).order("id").range(from, to),
          ),
        );
        const seen = new Set(ranged.map((e: any) => e.id));
        return [...ranged, ...state.filter((e: any) => !seen.has(e.id))];
      })(),
      fetchInChunks<any>(ids, 200, (chunk) =>
        admin
          .from("certificates")
          .select("id, application_id, certificate_number, uploaded_by, issued_at, delivered_at, created_at")
          .in("application_id", chunk)
          .order("created_at", { ascending: false }),
      ),
      fetchInChunks<any>(ids, 200, (chunk) =>
        (admin.from("order_action_logs" as any) as any)
          .select("id, order_id, action_type, new_status, new_stage, employee_id, employee_name, notes, created_at")
          .in("order_id", chunk)
          .order("created_at", { ascending: false })
          .limit(10000),
      ),
      fetchInChunks<any>(ids, 200, (chunk) =>
        admin
          .from("order_schedulers")
          .select("id, application_id, status, scheduler_type, fires_at, remarks, created_at, created_by")
          .in("application_id", chunk)
          .order("created_at", { ascending: false })
          .limit(5000),
      ),
    ]);
    const eventsRes = { data: eventsData };
    const certsTableRes = { data: certsData };
    const actionLogsRes = { data: actionLogsData };

    // Index all action logs, events, schedulers, and certificates per application
    // The in-range and per-order log queries overlap; index each log id once.
    const appActionLogsMap = new Map<string, any[]>();
    const seenActionLogIds = new Set<string>();
    for (const l of [...((inRangeActionLogsRes.data as any[]) ?? []), ...((actionLogsRes.data as any[]) ?? [])]) {
      if (l && l.order_id) {
        if (l.id) {
          if (seenActionLogIds.has(l.id)) continue;
          seenActionLogIds.add(l.id);
        }
        const arr = appActionLogsMap.get(l.order_id) ?? [];
        arr.push(l);
        appActionLogsMap.set(l.order_id, arr);
      }
    }

    const appEventsMap = new Map<string, any[]>();
    for (const ev of [...(inRangeEventsRes.data ?? []), ...(eventsRes.data ?? [])]) {
      if (ev && ev.application_id) {
        const arr = appEventsMap.get(ev.application_id) ?? [];
        arr.push(ev);
        appEventsMap.set(ev.application_id, arr);
      }
    }

    const appSchedulersMap = new Map<string, any[]>();
    for (const s of [...(inRangeSchedulersRes.data ?? []), ...(globalActiveSchedulers ?? [])]) {
      if (s && s.application_id) {
        const arr = appSchedulersMap.get(s.application_id) ?? [];
        arr.push(s);
        appSchedulersMap.set(s.application_id, arr);
      }
    }

    const appCertsMap = new Map<string, any[]>();
    for (const c of [...(inRangeCertificatesTableRes.data ?? []), ...(certsTableRes.data ?? [])]) {
      if (c && c.application_id) {
        const arr = appCertsMap.get(c.application_id) ?? [];
        arr.push(c);
        appCertsMap.set(c.application_id, arr);
      }
    }

    const leadIds = Array.from(new Set(appList.map((a) => a.lead_id).filter(Boolean))) as string[];
    const customerIds = Array.from(new Set(appList.map((a) => a.customer_id).filter(Boolean))) as string[];
    const serviceIds = Array.from(new Set(appList.map((a) => a.service_id).filter(Boolean))) as string[];
    const staffIds = Array.from(new Set([
      ...appList.map((a) => a.assigned_to),
      ...Array.from(appEventsMap.values()).flat().map((e) => e.created_by),
      ...Array.from(appSchedulersMap.values()).flat().map((s) => s.created_by),
      ...Array.from(appCertsMap.values()).flat().map((c) => c.uploaded_by),
    ].filter(Boolean))) as string[];

    const [leadsData, custsData, paysByApp, paysByLead, staffData] = await Promise.all([
      fetchInChunks<any>(leadIds, 200, (chunk) =>
        admin.from("leads").select("id, name, email, mobile, total_amount, lead_status_v2, lead_code, status, lead_source, service, service_id").in("id", chunk)
      ),
      fetchInChunks<any>(customerIds, 200, (chunk) =>
        admin.from("customers").select("id, name, primary_mobile, primary_email").in("id", chunk)
      ),
      fetchInChunks<any>(ids, 200, (chunk) =>
        admin.from("payments").select("id, application_id, lead_id, status, amount, payment_date").in("application_id", chunk)
      ),
      fetchInChunks<any>(leadIds, 200, (chunk) =>
        admin.from("payments").select("id, application_id, lead_id, status, amount, payment_date").in("lead_id", chunk)
      ),
      fetchInChunks<any>(staffIds, 200, (chunk) =>
        admin.from("profiles").select("id, full_name, display_name, email, is_active, employment_status").in("id", chunk)
      ),
    ]);

    const leadMap = new Map((leadsData ?? []).map((l: any) => [l.id, l]));
    const activeSchedulers = (globalActiveSchedulers ?? []).filter((s: any) => s.status === "active");
    const sortedSchedulers = [...activeSchedulers].sort((a: any, b: any) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });
    const callbackMap = new Map<string, any>();
    for (const s of sortedSchedulers) {
      if (s && s.application_id && !callbackMap.has(s.application_id)) {
        callbackMap.set(s.application_id, s);
      }
    }

    const allServiceIds = Array.from(
      new Set([...serviceIds, ...(leadsData ?? []).map((l: any) => l.service_id)].filter(Boolean))
    ) as string[];

    const svcsData = await fetchInChunks<any>(allServiceIds, 200, (chunk) =>
      admin.from("services").select("id, service_name").in("id", chunk)
    );

    const custMap = new Map((custsData ?? []).map((c: any) => [c.id, c]));
    const svcMap  = new Map((svcsData ?? []).map((s: any) => [s.id, s]));
    const staffMap = new Map((staffData ?? []).map((s: any) => [s.id, s]));

    const payByApp = new Map<string, Array<{ status: string; amount: number }>>();
    const paidAtByApp = new Map<string, string>();
    const allPaymentsMap = new Map<string, any>();
    for (const p of [...paysByApp, ...paysByLead]) {
      if (p && p.id) allPaymentsMap.set(p.id, p);
    }

    const leadToAppMap = new Map<string, string>();
    for (const a of appList) {
      if (a.lead_id) leadToAppMap.set(a.lead_id, a.id);
    }

    for (const p of allPaymentsMap.values()) {
      const appId = p.application_id || (p.lead_id ? leadToAppMap.get(p.lead_id) : null);
      if (appId) {
        const arr = payByApp.get(appId) ?? [];
        arr.push({ status: p.status as string, amount: Number(p.amount || 0) });
        payByApp.set(appId, arr);
        if (["paid", "success", "successful"].includes(String(p.status)) && p.payment_date) {
          const prev = paidAtByApp.get(appId);
          const cur = p.payment_date as string;
          if (!prev || cur < prev) paidAtByApp.set(appId, cur);
        }
      }
    }

    const now = Date.now();
    const fromTime = normalized.fromIso ? new Date(normalized.fromIso).getTime() : -Infinity;
    const toTime = normalized.toIso ? new Date(normalized.toIso).getTime() : Infinity;
    const hasDateFilter = Boolean(normalized.fromIso || normalized.toIso);

    const allRows = appList.map((a) => {
      const lead = leadMap.get(a.lead_id);
      const cust = a.customer_id ? custMap.get(a.customer_id) : null;
      const effectiveSvcId = a.service_id || lead?.service_id || null;
      const svc = effectiveSvcId ? svcMap.get(effectiveSvcId) : null;
      const staff = a.assigned_to ? staffMap.get(a.assigned_to) : null;
      const payments = payByApp.get(a.id) ?? [];
      const paidSum = payments
        .filter((p) => ["paid", "success", "successful"].includes(String(p.status)))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const totalAmount = paidSum > 0 ? paidSum : Number(lead?.total_amount || 0);
      const payment_status = rollupPaymentStatus(payments, totalAmount);

      const thisAppActionLogs = appActionLogsMap.get(a.id) ?? [];
      const thisAppEvents = appEventsMap.get(a.id) ?? [];
      const thisAppSchedulers = appSchedulersMap.get(a.id) ?? [];
      const thisAppCerts = appCertsMap.get(a.id) ?? [];

      const cb = callbackMap.get(a.id);
      let parsedRemarks = null;
      if (cb?.remarks) {
        try {
          parsedRemarks = typeof cb.remarks === "string" ? JSON.parse(cb.remarks) : cb.remarks;
        } catch {
          parsedRemarks = { reason: "custom", reasonLabel: cb.remarks };
        }
      }
      const firesAtTime = cb?.fires_at ? new Date(cb.fires_at).getTime() : 0;
      const is_due = firesAtTime > 0 && firesAtTime <= now;

      const hasCompletedCallback = hasCurrentCycleCompletion(
        a.reopened_at, cb, thisAppEvents, thisAppSchedulers,
      );

      // A completed/closed order is final even if an old reopen flag lingers
      // (e.g. workflow_status left as "processing_resumed" after completion).
      const finalNow =
        ["completed", "closed", "cancelled"].includes(String(a.fulfillment_status ?? "").toLowerCase()) ||
        ["COMPLETED", "CLOSED", "CANCELLED"].includes(String((a as any).order_status ?? "").toUpperCase());
      const rawIsReopened = !finalNow && (
        (a.fulfillment_status as any) === "order_reopened" ||
        (a as any).application_status === "order_reopened" ||
        (a as any).order_status === "REOPENED" ||
        (a as any).workflow_status === "order_reopened" ||
        (a as any).workflow_status === "processing_resumed");

      // Reopening is actionable even without a callback. Reads must never
      // overwrite an explicit reopen because of old completion history.
      const is_reopened = rawIsReopened && !hasCompletedCallback;

      const effectiveOrderStatus = is_reopened
        ? (a as any).order_status
        : ((a as any).order_status === "REOPENED" ? (a.form_submitted_at ? "IN_PROCESSING" : "FORM_PENDING") : (a as any).order_status);
      const effectiveFulfillmentStatus = is_reopened
        ? a.fulfillment_status
        : (a.fulfillment_status === "order_reopened" ? (a.form_submitted_at ? "form_submitted" : "form_not_submitted") : a.fulfillment_status);
      const effectiveWorkflowStatus = is_reopened
        ? (a as any).workflow_status
        : (((a as any).workflow_status === "order_reopened" || (a as any).workflow_status === "processing_resumed") ? "processing" : (a as any).workflow_status);

      const stage = computeOrderStage(
        { lead_status_v2: lead?.lead_status_v2, status: lead?.status, payment_successful_at: paidAtByApp.get(a.id) ?? null },
        {
          form_submitted_at: a.form_submitted_at,
          certificate_uploaded_at: a.certificate_uploaded_at,
          fulfillment_status: effectiveFulfillmentStatus,
          application_status: is_reopened ? a.application_status : (a.application_status === "order_reopened" ? "under_process" : a.application_status),
          workflow_status: effectiveWorkflowStatus,
          closure_stage: (a as any).closure_stage,
          refund_approved_at: (a as any).refund_approved_at,
          refund_processed_at: (a as any).refund_processed_at,
          order_status: effectiveOrderStatus,
          technical_hold_started_at: (a as any).technical_hold_started_at,
        },
      );

      const fsLower = String(effectiveFulfillmentStatus ?? "").toLowerCase();
      const isTerminal =
        !is_reopened && (
          stage === "completed" ||
          stage === "closed" ||
          CLOSED_FS.has(fsLower) ||
          COMPLETED_FS.has(fsLower) ||
          ["completed", "closed", "cancelled"].includes(String(a.application_status ?? "").toLowerCase()) ||
          ["completed", "closed", "cancelled"].includes(String((a as any).order_status ?? "").toLowerCase()) ||
          ["completed", "closed", "cancelled"].includes(String((a as any).workflow_status ?? "").toLowerCase()) ||
          (Boolean((a as any).closure_stage) && (a as any).closure_stage !== "none")
        );

      const has_future_callback = !isTerminal && Boolean(cb && firesAtTime > now);
      // A real staff action taken after the order became hot (callback due time,
      // or reopen time) resolves it, even if that action didn't stop the reminder.
      const hotSinceMs = is_due ? firesAtTime : (is_reopened ? Date.parse((a as any).reopened_at || "") || 0 : 0);
      const actedSinceHot = hotSinceMs > 0 && thisAppActionLogs.some((l: any) => {
        if (!l?.employee_id) return false;
        const t = String(l.action_type ?? "").toUpperCase();
        if (["ORDER_OPENED", "ORDER_REOPENED", "HOT_ORDER_ADDED", "ORDER_ASSIGNED", "ORDER_REASSIGNED"].includes(t)) return false;
        const ts = Date.parse(l.created_at || "");
        return Number.isFinite(ts) && ts > hotSinceMs;
      });
      const is_hot = !isTerminal && !hasCompletedCallback && !actedSinceHot && (is_due || (is_reopened && !has_future_callback));
      let hot_started_at: string | null = null;
      if (is_hot) {
        if (is_reopened) {
          hot_started_at = (a as any).reopened_at || a.updated_at || a.created_at;
        } else if (cb) {
          // A scheduled callback becomes HOT when it fires (due time), not when it was scheduled.
          hot_started_at = (cb.fires_at ? new Date(cb.fires_at).toISOString() : null) || cb.created_at || a.updated_at || a.created_at;
        } else {
          hot_started_at = a.updated_at || a.created_at;
        }
      }

      const is_callback_scheduled = has_future_callback;
      const callback_reminder = !isTerminal && cb
        ? {
            id: cb.id,
            fires_at: cb.fires_at,
            is_due,
            remarks: parsedRemarks,
            scheduler_type: cb.scheduler_type,
            created_at: cb.created_at,
          }
        : null;

      const createdTime = new Date(a.created_at).getTime();
      const inRangeCreated = (!hasDateFilter || (createdTime >= fromTime && createdTime <= toTime));

      const appStatusLower = String(a.application_status ?? "").toLowerCase();
      const isCompletedStage =
        stage === "completed" ||
        stage === "certificate_ready" ||
        stage === "consultation_completed" ||
        COMPLETED_FS.has(fsLower) ||
        COMPLETED_FS.has(appStatusLower) ||
        COMPLETED_FS.has(String((a as any).order_status ?? "").toLowerCase()) ||
        COMPLETED_FS.has(String((a as any).workflow_status ?? "").toLowerCase()) ||
        String((a as any).order_status ?? "").toUpperCase() === "COMPLETED";

      const isClosedStage =
        stage === "closed" ||
        CLOSED_FS.has(fsLower) ||
        CLOSED_FS.has(appStatusLower) ||
        CLOSED_FS.has(String((a as any).order_status ?? "").toLowerCase()) ||
        CLOSED_FS.has(String((a as any).workflow_status ?? "").toLowerCase()) ||
        (Boolean((a as any).closure_stage) && (a as any).closure_stage !== "none");

      // ── 1. Determine exact completion timestamp & in_range_completed ──
      let compTimestamp: number | null = null;
      if (a.fulfilled_at) {
        const t = new Date(a.fulfilled_at).getTime();
        if (!isNaN(t)) compTimestamp = t;
      }
      if (!compTimestamp && a.certificate_uploaded_at) {
        const t = new Date(a.certificate_uploaded_at).getTime();
        if (!isNaN(t)) compTimestamp = t;
      }
      for (const c of thisAppCerts) {
        const t = new Date(c.delivered_at || c.issued_at || c.created_at).getTime();
        if (!isNaN(t) && (!compTimestamp || t > compTimestamp)) compTimestamp = t;
      }
      for (const l of thisAppActionLogs) {
        const at = String(l.action_type || "").toUpperCase();
        const ns = String(l.new_status || "").toUpperCase();
        const nst = String(l.new_stage || "").toUpperCase();
        if (
          at === "ORDER_COMPLETED" ||
          at === "APPLICATION_COMPLETED" ||
          at === "CERTIFICATE_GENERATED" ||
          at === "CERTIFICATE_DELIVERED" ||
          ns.includes("COMPLET") ||
          nst.includes("COMPLET")
        ) {
          const t = new Date(l.created_at).getTime();
          if (!isNaN(t) && (!compTimestamp || t > compTimestamp)) compTimestamp = t;
        }
      }
      for (const ev of thisAppEvents) {
        const et = String(ev.event_type || "").toLowerCase();
        const nv = String(ev.new_value || "").toLowerCase();
        if (
          nv.includes("complete") ||
          et.includes("complete") ||
          et.includes("cert") ||
          et === "certificate_uploaded" ||
          et === "certificate_issued" ||
          et === "application_approved" ||
          et === "consultation_completed" ||
          nv === "application_approved"
        ) {
          const t = new Date(ev.created_at).getTime();
          if (!isNaN(t) && (!compTimestamp || t > compTimestamp)) compTimestamp = t;
        }
      }
      if (!compTimestamp && isCompletedStage) {
        if (a.updated_at) {
          const t = new Date(a.updated_at).getTime();
          if (!isNaN(t)) compTimestamp = t;
        } else {
          compTimestamp = createdTime;
        }
      }
      const inRangeCompleted = Boolean(
        isCompletedStage &&
        compTimestamp !== null &&
        (!hasDateFilter || (compTimestamp >= fromTime && compTimestamp <= toTime))
      );

      // ── 2. Determine exact close timestamp & in_range_closed ──
      let closeTimestamp: number | null = null;
      for (const l of thisAppActionLogs) {
        const at = String(l.action_type || "").toUpperCase();
        const ns = String(l.new_status || "").toUpperCase();
        const nst = String(l.new_stage || "").toUpperCase();
        if (
          at === "ORDER_CLOSED" ||
          at === "SYSTEM_CLOSE" ||
          ns.includes("CLOSE") ||
          ns.includes("CANCEL") ||
          nst.includes("CLOSE") ||
          nst.includes("CANCEL")
        ) {
          const t = new Date(l.created_at).getTime();
          if (!isNaN(t) && (!closeTimestamp || t > closeTimestamp)) closeTimestamp = t;
        }
      }
      for (const ev of thisAppEvents) {
        const et = String(ev.event_type || "").toLowerCase();
        const nv = String(ev.new_value || "").toLowerCase();
        if (
          nv.includes("close") ||
          nv.includes("cancel") ||
          et.includes("close") ||
          et.includes("cancel") ||
          et === "workflow_closed" ||
          et === "order_closed"
        ) {
          const t = new Date(ev.created_at).getTime();
          if (!isNaN(t) && (!closeTimestamp || t > closeTimestamp)) closeTimestamp = t;
        }
      }
      if (!closeTimestamp && isClosedStage) {
        if (a.updated_at) {
          const t = new Date(a.updated_at).getTime();
          if (!isNaN(t)) closeTimestamp = t;
        } else {
          closeTimestamp = createdTime;
        }
      }
      const inRangeClosed = Boolean(
        isClosedStage &&
        closeTimestamp !== null &&
        (!hasDateFilter || (closeTimestamp >= fromTime && closeTimestamp <= toTime))
      );

      // ── 3. Determine Customer Delay In Range ──
      let hasCustDelayInRange = false;
      if (a.customer_hold_started_at) {
        const t = new Date(a.customer_hold_started_at).getTime();
        if (t >= fromTime && t <= toTime) hasCustDelayInRange = true;
      }
      for (const s of thisAppSchedulers) {
        const st = String(s.scheduler_type || "").toLowerCase();
        if (st.includes("customer_side_delay") || st.includes("customer_delay")) {
          const t = new Date(s.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasCustDelayInRange = true;
        }
      }
      for (const l of thisAppActionLogs) {
        const at = String(l.action_type || "").toUpperCase();
        if (at === "CUSTOMER_DELAY_ADDED" || at === "CUSTOMER_DELAY") {
          const t = new Date(l.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasCustDelayInRange = true;
        }
      }
      for (const ev of thisAppEvents) {
        const et = String(ev.event_type || "").toLowerCase();
        const nv = String(ev.new_value || "").toLowerCase();
        if (et.includes("customer_delay") || nv.includes("customer_delay")) {
          const t = new Date(ev.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasCustDelayInRange = true;
        }
      }
      const inRangeCustomerDelay = (!isCompletedStage && !isClosedStage && !inRangeCompleted && !inRangeClosed && !isTerminal)
        ? (hasDateFilter ? hasCustDelayInRange : isCustomerDelayOrder(a))
        : false;

      // ── 4. Determine Technical Delay In Range ──
      let hasTechDelayInRange = false;
      if (a.technical_hold_started_at) {
        const t = new Date(a.technical_hold_started_at).getTime();
        if (t >= fromTime && t <= toTime) hasTechDelayInRange = true;
      }
      for (const s of thisAppSchedulers) {
        const st = String(s.scheduler_type || "").toLowerCase();
        if (st.includes("technical_delay") || st.includes("our_side_delay")) {
          const t = new Date(s.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasTechDelayInRange = true;
        }
      }
      for (const l of thisAppActionLogs) {
        const at = String(l.action_type || "").toUpperCase();
        if (at === "TECHNICAL_DELAY_ADDED" || at === "TECHNICAL_DELAY") {
          const t = new Date(l.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasTechDelayInRange = true;
        }
      }
      for (const ev of thisAppEvents) {
        const et = String(ev.event_type || "").toLowerCase();
        const nv = String(ev.new_value || "").toLowerCase();
        if (et.includes("technical_delay") || nv.includes("technical_delay")) {
          const t = new Date(ev.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasTechDelayInRange = true;
        }
      }
      const inRangeTechnicalDelay = (!isCompletedStage && !isClosedStage && !inRangeCompleted && !inRangeClosed && !isTerminal && !inRangeCustomerDelay)
        ? (hasDateFilter ? hasTechDelayInRange : isTechnicalDelayOrder(a))
        : false;

      // ── 5. Determine Callback Scheduled In Range ──
      let hasCallbackInRange = false;
      for (const s of thisAppSchedulers) {
        const st = String(s.scheduler_type || "").toLowerCase();
        if (st.includes("callback") || st.includes("consultation")) {
          const t = new Date(s.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasCallbackInRange = true;
        }
      }
      for (const l of thisAppActionLogs) {
        const at = String(l.action_type || "").toUpperCase();
        if (at === "CALLBACK_SCHEDULED") {
          const t = new Date(l.created_at).getTime();
          if (t >= fromTime && t <= toTime) hasCallbackInRange = true;
        }
      }
      const inRangeCallbackScheduled = (!isCompletedStage && !isClosedStage && !inRangeCompleted && !inRangeClosed && !isTerminal)
        ? (hasDateFilter ? hasCallbackInRange : isCallbackScheduledOrder(a))
        : false;

      // ── 6. Collect All Distinct Manual Actions in Range (Strictly by human staff, NEVER System) ──
      const actionHistoryList: Array<{
        id: string;
        action_type: string;
        title: string;
        staff_name: string;
        actor_id?: string | null;
        created_at: string;
        note?: string | null;
      }> = [];

      const isHumanStaff = (name?: string | null): boolean => {
        if (!name) return false;
        const n = String(name).trim().toLowerCase();
        return n.length > 0 && !["system", "automated", "bot", "auto", "auto-assign", "cron", "webhook", "system_job"].includes(n);
      };

      // Action Logs (only if created by a human staff member, never automated cron/timeout)
      for (const l of thisAppActionLogs) {
        const staffName = l.employee_name || l.staff_name || null;
        if (!isHumanStaff(staffName)) continue;

        const at = String(l.action_type || "").toUpperCase();
        const note = String(l.note || l.remarks || "").toLowerCase();

        // Exclude system events, automated closures, form submissions
        if (
          at === "FORM_SUBMITTED" ||
          at === "ORDER_CREATED" ||
          at === "PAYMENT_RECEIVED" ||
          at === "ORDER_REOPENED" ||
          note.includes("customer delay closed") ||
          note.includes("auto closed") ||
          note.includes("timeout") ||
          note.includes("system")
        ) {
          continue;
        }

        const t = new Date(l.created_at).getTime();
        if (!hasDateFilter || (t >= fromTime && t <= toTime)) {
          let title = "Staff Action";
          if (at.includes("COMPLET")) title = "Order Completed";
          else if (at.includes("CUSTOMER_DELAY")) title = "Customer Delay Added";
          else if (at.includes("TECHNICAL_DELAY")) title = "Technical Delay Added";
          else if (at.includes("CALLBACK")) title = "Callback Scheduled";
          else if (at.includes("CLOSE")) title = "Order Closed";
          else if (at.includes("FORM")) title = "Form Link Sent";
          else if (l.action_type) title = l.action_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

          actionHistoryList.push({
            id: `log-${l.id}`,
            action_type: l.action_type || "ACTION",
            title,
            staff_name: staffName,
            actor_id: l.employee_id ?? null,
            created_at: l.created_at,
            note: l.note || l.remarks || null,
          });
        }
      }

      // Certificates count only when the uploader is a known employee, not the current assignee.
      for (const c of thisAppCerts) {
        const uploader = c.uploaded_by ? staffMap.get(c.uploaded_by) : null;
        const staffName = uploader?.display_name || uploader?.full_name || null;
        if (!isHumanStaff(staffName)) continue;

        const ts = c.delivered_at || c.issued_at || c.created_at;
        const t = new Date(ts).getTime();
        if (!hasDateFilter || (t >= fromTime && t <= toTime)) {
          const exists = actionHistoryList.some(
            (x) =>
              (x.action_type.toLowerCase().includes("complet") || x.action_type.toLowerCase().includes("cert")) &&
              Math.abs(new Date(x.created_at).getTime() - t) < 300000
          );
          if (!exists) {
            actionHistoryList.push({
              id: `cert-${c.id}`,
              action_type: "ORDER_COMPLETED",
              title: "Order Completed",
              staff_name: staffName,
              actor_id: c.uploaded_by ?? null,
              created_at: ts,
              note: c.certificate_number ? `Certificate delivered (Cert #${c.certificate_number})` : "Order fulfilled and certificate delivered",
            });
          }
        }
      }

      // Schedulers (only those created by a known employee)
      for (const s of thisAppSchedulers) {
        const creator = s.created_by ? staffMap.get(s.created_by) : null;
        const staffName = creator?.display_name || creator?.full_name || null;
        if (!isHumanStaff(staffName)) continue;

        const t = new Date(s.created_at).getTime();
        if (!hasDateFilter || (t >= fromTime && t <= toTime)) {
          const st = String(s.scheduler_type || "").toLowerCase();
          let parsedRemarks: any = null;
          if (typeof s.remarks === "object" && s.remarks) {
            parsedRemarks = s.remarks;
          } else if (typeof s.remarks === "string" && s.remarks) {
            try {
              parsedRemarks = JSON.parse(s.remarks);
            } catch {
              parsedRemarks = { reasonLabel: s.remarks };
            }
          }

          // Reopen / ticket hot-priority triggers mean work is needed, not work done.
          const schedReason = String(parsedRemarks?.reason || s.reason || "").toLowerCase();
          if (schedReason === "order_reopened" || schedReason === "ticket_hot_priority" || schedReason === "reopened") continue;

          let title = "Workflow Scheduler";
          if (st.includes("customer_delay") || st.includes("customer_side")) {
            title = "Customer Delay Added";
          } else if (st.includes("technical_delay") || st.includes("our_side_delay")) {
            title = "Technical Delay Added";
          } else if (
            st.includes("our_side_reminder") ||
            st.includes("callback") ||
            st.includes("reminder") ||
            st.includes("consultation")
          ) {
            title = "Callback Scheduled";
          }

          const note = parsedRemarks?.reasonLabel
            ? (parsedRemarks.note ? `${parsedRemarks.reasonLabel} (${parsedRemarks.note})` : parsedRemarks.reasonLabel)
            : (s.reason || parsedRemarks?.note || null);

          const exists = actionHistoryList.some((x) => Math.abs(new Date(x.created_at).getTime() - t) < 60000);
          if (!exists) {
            actionHistoryList.push({
              id: `sched-${s.id}`,
              action_type: s.scheduler_type || "SCHEDULER",
              title,
              staff_name: staffName!,
              actor_id: s.created_by ?? null,
              created_at: s.created_at,
              note,
            });
          }
        }
      }

      // Events: require an actual employee actor; displayed names alone can say Auto-Assign.
      for (const ev of thisAppEvents) {
        const et = String(ev.event_type || "").toLowerCase();
        const nv = String(ev.new_value || "").toLowerCase();
        const note = String(ev.note || "").toLowerCase();
        const actor = ev.created_by ? staffMap.get(ev.created_by) : null;
        const staffName = actor?.display_name || actor?.full_name || null;
        if (!isHumanStaff(staffName) || String(ev.staff_role || "").toLowerCase() === "system") continue;

        if (
          et === "assignment_change" ||
          et === "auto_assignment" ||
          et === "pool_assignment" ||
          et === "reassignment" ||
          et === "unassignment" ||
          et === "order_assigned" ||
          et === "order_reassigned" ||
          et.startsWith("auto_") ||
          et === "order_created" ||
          et === "lead_created" ||
          et === "payment_received" ||
          et === "assignee_updated" ||
          et === "order_reopened" ||
          et === "hot_priority_escalated" ||
          nv === "order_reopened" ||
          nv === "reopened" ||
          note.includes("reopened") ||
          et === "followup_email_sent" ||
          et === "email_sent" ||
          et === "email_failed" ||
          et === "email_skipped" ||
          et === "internal_review_due" ||
          et === "form_submitted" ||
          et === "order_closed" ||
          et === "workflow_closed" ||
          et === "certificate_uploaded" ||
          et === "certificate_delivered" ||
          et === "order_completed" ||
          et === "application_completed" ||
          nv === "form_submitted" ||
          nv === "order_received" ||
          nv === "lead_received" ||
          nv === "payment_done" ||
          nv === "payment_pending" ||
          note.includes("customer submitted") ||
          note.includes("form submitted") ||
          note.includes("customer delay closed") ||
          note.includes("auto closed") ||
          note.includes("timeout")
        ) {
          continue;
        }

        const t = new Date(ev.created_at).getTime();
        if (!hasDateFilter || (t >= fromTime && t <= toTime)) {
          const exists = actionHistoryList.some((x) => Math.abs(new Date(x.created_at).getTime() - t) < 60000);
          if (!exists) {
            let title = ev.event_type ? ev.event_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Staff Action";
            if (et.includes("callback_completed")) title = "Callback Completed";
            else if (et.includes("callback_scheduled")) title = "Callback Scheduled";
            else if (et.includes("consultation")) title = "Consultation Completed";
            else if (et.includes("resumed")) title = "Order Resumed / Re-served";

            actionHistoryList.push({
              id: `ev-${ev.id}`,
              action_type: ev.event_type || "EVENT",
              title,
              staff_name: staffName!,
              actor_id: ev.created_by ?? null,
              created_at: ev.created_at,
              note: ev.note || ev.new_value || null,
            });
          }
        }
      }

      // Sort actionHistoryList newest to oldest
      actionHistoryList.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());

      const inRangeActionTaken = actionHistoryList.length > 0;
      const actionCount = actionHistoryList.length;

      return {
        id: a.id,
        application_code: a.application_code,
        fulfillment_status: (effectiveFulfillmentStatus ?? "order_received") as FulfillmentStatus,
        lead_status_v2: lead?.lead_status_v2 ?? null,
        created_at: a.created_at,
        completed_at: compTimestamp ? new Date(compTimestamp).toISOString() : null,
        closed_at: closeTimestamp ? new Date(closeTimestamp).toISOString() : null,
        lead_id: a.lead_id,
        lead_code: lead?.lead_code ?? null,
        customer_id: a.customer_id,
        customer_name: lead?.name ?? cust?.name ?? "—",
        customer_mobile: lead?.mobile ?? cust?.primary_mobile ?? null,
        customer_email: lead?.email ?? cust?.primary_email ?? null,
        service_id: effectiveSvcId,
        service_name: svc?.service_name ?? lead?.service ?? null,
        total_amount: totalAmount,
        payment_status,
        assigned_to: a.assigned_to,
        assigned_name: staff ? (staff.display_name || staff.full_name || staff.email?.split("@")[0] || "Staff") : null,
        stage,
        is_hot,
        hot_started_at,
        is_callback_scheduled,
        callback_reminder,
        ticket_source: (parsedRemarks?.reason === "ticket_hot_priority" || parsedRemarks?.ticketNumber || (cb as any)?.ticket_id)
          ? {
              isHotFromTicket: true,
              ticketNumber: parsedRemarks?.ticketNumber || null,
              ticketId: parsedRemarks?.ticketId || (cb as any)?.ticket_id || null,
              note: parsedRemarks?.note || null,
            }
          : (thisAppEvents.find((e) => (e.event_type === "hot_priority_escalated" || e.event_type === "order_reopened") && (e.note?.includes("Ticket") || e.note?.includes("ticket"))))
          ? {
              isReopenedFromTicket: true,
              ticketNumber: (thisAppEvents.find((e) => (e.event_type === "hot_priority_escalated" || e.event_type === "order_reopened") && (e.note?.includes("Ticket") || e.note?.includes("ticket")))?.note?.match(/#([A-Za-z0-9\-]+)/)?.[1]) || null,
              note: thisAppEvents.find((e) => (e.event_type === "hot_priority_escalated" || e.event_type === "order_reopened") && (e.note?.includes("Ticket") || e.note?.includes("ticket")))?.note || null,
            }
          : null,
        order_status: effectiveOrderStatus ?? (a as any).application_status ?? null,
        workflow_status: effectiveWorkflowStatus,
        technical_hold_started_at: (a as any).technical_hold_started_at,
        customer_hold_started_at: (a as any).customer_hold_started_at,
        form_link_sent_at: (a as any).form_link_sent_at ?? null,
        is_terminal: isTerminal,
        in_range: inRangeCreated,
        in_range_created: inRangeCreated,
        in_range_completed: inRangeCompleted,
        in_range_closed: inRangeClosed,
        in_range_customer_delay: inRangeCustomerDelay,
        in_range_technical_delay: inRangeTechnicalDelay,
        in_range_callback_scheduled: inRangeCallbackScheduled,
        in_range_action_taken: inRangeActionTaken,
        latest_action_at: actionHistoryList[0]?.created_at ?? null,
        // Who actually did each action — workforce credit is per actor, never the assignee.
        action_actors: actionHistoryList.map((x) => ({ actor_id: x.actor_id ?? null, created_at: x.created_at })),
        action_count: actionCount,
        // Customer submitted the form after a delay; stays in Need Action until staff act on it.
        customer_resumed_pending: (() => {
          if (isTerminal) return false;
          const ev = thisAppEvents.find((e: any) => e.event_type === "customer_form_resumed");
          if (!ev || String(a.fulfillment_status ?? "") !== "form_submitted") return false;
          const resumedAt = new Date(ev.created_at).getTime();
          const lastAction = actionHistoryList[0]?.created_at ? new Date(actionHistoryList[0].created_at).getTime() : 0;
          return lastAction <= resumedAt;
        })(),
        action_history: actionHistoryList,
      };
    });

    const todayIst = istDateKey(new Date());

    // 1. Filter dimensions (Stage, Fulfillment, Action Status, Payment, Pending Age)
    let baseFilteredRows = allRows;

    if (normalized.stage) {
      baseFilteredRows = baseFilteredRows.filter((r) => r.stage === normalized.stage);
    }
    if (normalized.fulfillmentStatus) {
      baseFilteredRows = baseFilteredRows.filter((r) => r.fulfillment_status === normalized.fulfillmentStatus);
    }
    if (normalized.actionStatus && normalized.actionStatus !== "all") {
      if (normalized.actionStatus === "action_required") {
        baseFilteredRows = baseFilteredRows.filter((r) => {
          const b = bucketOfRow(r, todayIst);
          return b === "needs_action" || b === "backlog";
        });
      } else if (normalized.actionStatus === "processed" || normalized.actionStatus === "action_taken") {
        baseFilteredRows = baseFilteredRows.filter((r) => r.in_range_action_taken);
      } else if (normalized.actionStatus === "hot_orders") {
        baseFilteredRows = baseFilteredRows.filter((r) => r.is_hot);
      } else if (normalized.actionStatus === "scheduled_callback") {
        baseFilteredRows = baseFilteredRows.filter((r) => r.in_range_callback_scheduled);
      }
    }
    if (isAdmin && normalized.paymentStatus) {
      baseFilteredRows = baseFilteredRows.filter((r) => r.payment_status === normalized.paymentStatus);
    }
    if (isAdmin && normalized.pendingAge) {
      let days = 0;
      if (normalized.pendingAge === "custom" && normalized.customDays) {
        days = normalized.customDays || 0;
      } else {
        days = parseInt(normalized.pendingAge, 10) || 0;
      }
      if (days > 0) {
        const thresholdMs = Date.now() - days * 86_400_000;
        baseFilteredRows = baseFilteredRows.filter((r) => new Date(r.created_at).getTime() <= thresholdMs);
      }
    }

    // 2. Compute KPI counts: In-Range Volume + Action-based Range Metrics + All-Time Operational Queues
    const counts = {
      all: 0,
      needs_action: 0,
      hot_orders: 0,
      reminders: 0, // Call Back Scheduled
      technical_delay: 0,
      backlog: 0,
      customer_delay: 0,
      pending: 0, // Action Taken (Unique Orders)
      pending_actions_total: 0, // Total Manual Actions Count
      completed: 0,
      closed: 0,
      exception: 0,
      actionRequired: 0,
      processed: 0,
      totalAll: 0,
      pending_orders: 0,
    };
    const ageBuckets = { d1: 0, d2: 0, d3: 0, d7: 0, older: 0 };

    for (const r of baseFilteredRows) {
      const b = bucketOfRow(r, todayIst);
      const isActionStage = isNeedsActionStage(r.stage);

      if (r.in_range_created) {
        counts.totalAll++;
        counts.all++;
        if (b === "exception") {
          counts.exception++;
        }
      }

      // Action Taken (Pending): orders with qualifying employee action in selected date range
      if (r.in_range_action_taken) {
        counts.pending++;
        counts.pending_actions_total += (r.action_count || 1);
      }

      if (r.in_range_completed) {
        counts.completed++;
        counts.processed++;
      } else if (r.in_range_closed) {
        counts.closed++;
        counts.processed++;
      }

      // Operational Queues (Live all-time active portfolio)
      if (isNeedsActionOrder(r)) {
        counts.needs_action++;
        counts.actionRequired++;
      }

      if (r.is_hot) {
        counts.hot_orders++;
      } else if (isCallbackScheduledOrder(r)) {
        counts.reminders++;
      }

      if (isTechnicalDelayOrder(r)) {
        counts.technical_delay++;
      }
      if (isCustomerDelayOrder(r)) {
        counts.customer_delay++;
      }

      if (b === "pending" || b === "needs_action" || b === "backlog") {
        const d = Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000));
        if (d < 1) ageBuckets.d1++;
        else if (d === 1) ageBuckets.d2++;
        else if (d === 2) ageBuckets.d3++;
        else if (d >= 3 && d < 7) ageBuckets.d7++;
        else if (d >= 7) ageBuckets.older++;
      }
    }

    // Backlog: all active non-delay action-needed orders from yesterday and before (all-time)
    counts.backlog = baseFilteredRows.filter((r) => {
      const rowDate = istDateKey(r.created_at);
      return isNeedsActionOrder(r) && Boolean(rowDate && rowDate < todayIst);
    }).length;

    // Pending Orders: combined total of Needs Action + Callback Scheduled + Technical Delay
    counts.pending_orders = baseFilteredRows.filter((r) =>
      isNeedsActionOrder(r) || isCallbackScheduledOrder(r) || isTechnicalDelayOrder(r)
    ).length;

    // 3. Apply bucket tab filter to obtain the table rows (guarantee 100% exact match with counts)
    let filtered = baseFilteredRows;
    const rawBucket = normalized.bucket || "all";
    const bucket = (!isAdmin && rawBucket === "all") ? "needs_action" : rawBucket;

    if (bucket === "needs_action") {
      filtered = filtered.filter((r) => isNeedsActionOrder(r));
    } else if (bucket === "pending_orders") {
      filtered = filtered.filter((r) =>
        isNeedsActionOrder(r) || isCallbackScheduledOrder(r) || isTechnicalDelayOrder(r)
      );
    } else if (bucket === "hot_orders") {
      filtered = filtered.filter((r) => r.is_hot);
    } else if (bucket === "reminders") {
      filtered = filtered.filter((r) => isCallbackScheduledOrder(r));
    } else if (bucket === "backlog") {
      filtered = filtered.filter((r) => {
        const rowDate = istDateKey(r.created_at);
        return isNeedsActionOrder(r) && Boolean(rowDate && rowDate < todayIst);
      });
    } else if (bucket === "technical_delay") {
      filtered = filtered.filter((r) => isTechnicalDelayOrder(r));
    } else if (bucket === "customer_delay") {
      filtered = filtered.filter((r) => isCustomerDelayOrder(r));
    } else if (bucket === "pending" || bucket === "idle_time") {
      filtered = filtered.filter((r) => r.in_range_action_taken);
    } else if (bucket === "completed") {
      filtered = filtered.filter((r) => r.in_range_completed);
    } else if (bucket === "closed") {
      filtered = filtered.filter((r) => r.in_range_closed);
    } else if (bucket === "exception") {
      filtered = filtered.filter((r) => r.in_range_created && bucketOfRow(r, todayIst) === "exception");
    } else {
      // Default 'all' (ALL ORDERS): ALL orders in the period/range of ANY stage (Payment Done, Form Submitted, Customer Delay, Technical Delay, Completed, Closed, etc.)
      filtered = filtered.filter((r) => r.in_range_created);
    }

    if ((bucket === "needs_action" || bucket === "pending_orders") && (!normalized.sortField || normalized.sortField === "created_at")) {
      // Hot orders on TOP (oldest hot first), then regular orders (newest created first)
      filtered.sort((a, b) => {
        if (a.is_hot && !b.is_hot) return -1;
        if (!a.is_hot && b.is_hot) return 1;
        if (a.is_hot && b.is_hot) {
          const hA = a.hot_started_at ? new Date(a.hot_started_at).getTime() : new Date(a.created_at).getTime();
          const hB = b.hot_started_at ? new Date(b.hot_started_at).getTime() : new Date(b.created_at).getTime();
          if (hA !== hB) return hA - hB;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        return normalized.sortOrder === "asc" ? tA - tB : tB - tA;
      });
    } else if (bucket === "backlog" && (!normalized.sortField || normalized.sortField === "created_at")) {
      // Oldest created order first in backlog
      filtered.sort((a, b) => {
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        return tA - tB;
      });
    } else if (bucket === "hot_orders" && (!normalized.sortField || normalized.sortField === "created_at")) {
      // Oldest HOT order first (the order waiting longest as HOT)
      filtered.sort((a, b) => {
        const hA = a.hot_started_at ? new Date(a.hot_started_at).getTime() : new Date(a.created_at).getTime();
        const hB = b.hot_started_at ? new Date(b.hot_started_at).getTime() : new Date(b.created_at).getTime();
        if (hA !== hB) return hA - hB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    } else if (bucket === "completed" && (!normalized.sortField || normalized.sortField === "created_at")) {
      filtered.sort((a, b) => {
        const tA = a.completed_at ? new Date(a.completed_at).getTime() : new Date(a.created_at).getTime();
        const tB = b.completed_at ? new Date(b.completed_at).getTime() : new Date(b.created_at).getTime();
        return normalized.sortOrder === "asc" ? tA - tB : tB - tA;
      });
    } else if (bucket === "closed" && (!normalized.sortField || normalized.sortField === "created_at")) {
      filtered.sort((a, b) => {
        const tA = a.closed_at ? new Date(a.closed_at).getTime() : new Date(a.created_at).getTime();
        const tB = b.closed_at ? new Date(b.closed_at).getTime() : new Date(b.created_at).getTime();
        return normalized.sortOrder === "asc" ? tA - tB : tB - tA;
      });
    } else if (
      (bucket === "pending" ||
        bucket === "customer_delay" ||
        bucket === "technical_delay" ||
        normalized.actionStatus === "processed" ||
        normalized.actionStatus === "action_taken") &&
      (!normalized.sortField || normalized.sortField === "created_at")
    ) {
      filtered.sort((a, b) => {
        const tA = a.latest_action_at
          ? new Date(a.latest_action_at).getTime()
          : a.customer_hold_started_at
            ? new Date(a.customer_hold_started_at).getTime()
            : a.technical_hold_started_at
              ? new Date(a.technical_hold_started_at).getTime()
              : new Date(a.created_at).getTime();
        const tB = b.latest_action_at
          ? new Date(b.latest_action_at).getTime()
          : b.customer_hold_started_at
            ? new Date(b.customer_hold_started_at).getTime()
            : b.technical_hold_started_at
              ? new Date(b.technical_hold_started_at).getTime()
              : new Date(b.created_at).getTime();
        return normalized.sortOrder === "asc" ? tA - tB : tB - tA;
      });
    } else if (normalized.sortField === "stage") {
      filtered.sort((a, b) => {
        const cmp = a.stage.localeCompare(b.stage);
        return normalized.sortOrder === "asc" ? cmp : -cmp;
      });
    } else {
      filtered.sort((a, b) => {
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        return normalized.sortOrder === "asc" ? tA - tB : tB - tA;
      });
    }

    const total = filtered.length;
    const maxPage = Math.max(1, Math.ceil(total / data.pageSize));
    const page = Math.min(Math.max(1, data.page), maxPage);
    const start = (page - 1) * data.pageSize;
    // In team mode: counts only are returned, individual rows are withheld.
    // In self mode: staff and managers can view their assigned order rows.
    const rawRows = data.viewMode === "team" ? [] : filtered.slice(start, start + data.pageSize);

    const hasSearch = Boolean(data.search && data.search.trim());
    const isRestrictedManagerOtherEmployee =
      !isAdmin &&
      isManager &&
      Boolean(data.assignedTo && data.assignedTo !== "all" && data.assignedTo !== context.userId && !hasSearch);

    const rows = isRestrictedManagerOtherEmployee
      ? rawRows.map((r: any) => ({
          ...r,
          application_code: "—",
          customer_mobile: null,
          customer_email: null,
          total_amount: null,
          payment_status: null,
          is_other_employee_restricted: true,
        }))
      : rawRows;

    // Compute team-level breakdown for team mode (Active Workforce only)
    const teamBreakdownMap = new Map<string, {
      employeeId: string;
      name: string;
      email?: string;
      needsAction: number;
      pendingOrders: number;
      latestActionAt: string | null;
      presenceAt: string | null;
      hotOrders: number;
      backlog: number;
      technicalDelay: number;
      callbackScheduled: number;
      customerDelay: number;
      actionTaken: number;
      completed: number;
      closed: number;
      total: number;
    }>();

    if (data.viewMode === "team") {
      const [{ data: profs }, { data: superAdminRoles }, { data: sessions }] = await Promise.all([
        admin.from("profiles").select("id, full_name, display_name, email, is_active, employment_status"),
        admin.from("user_roles").select("user_id").eq("role", "super_admin"),
        admin
          .from("employee_sessions")
          .select("employee_id, last_activity_at, last_heartbeat_at, login_at, status, is_active")
          .order("last_activity_at", { ascending: false }),
      ]);

      const superAdminIds = new Set((superAdminRoles ?? []).map((r: any) => String(r.user_id)));
      const employeeSessionsMap = new Map<string, any>();
      for (const s of sessions ?? []) {
        const empId = String(s.employee_id);
        if (!employeeSessionsMap.has(empId)) {
          employeeSessionsMap.set(empId, s);
        }
      }

      // 1. Pre-populate all ACTIVE workforce employees (strictly excluding deactivated/archived staff and manager self)
      for (const p of profs ?? []) {
        const uid = String(p.id);
        if (uid === context.userId) continue; // Exclude manager self
        if (superAdminIds.has(uid)) continue; // Exclude super admin accounts
        const isAct =
          p.is_active !== false &&
          p.employment_status !== "ARCHIVED" &&
          p.employment_status !== "TERMINATED" &&
          p.employment_status !== "INACTIVE";
        if (!isAct) continue; // Exclude deactivated/archived employees

        const name = p.display_name || p.full_name || p.email?.split("@")[0] || "Staff";
        const sess = employeeSessionsMap.get(uid);
        // Presence (CRM tab heartbeat) is kept separate; Last Action comes only from order actions.
        const presenceAt = sess?.last_activity_at || sess?.last_heartbeat_at || sess?.login_at || null;

        teamBreakdownMap.set(uid, {
          employeeId: uid,
          name,
          email: p.email ?? undefined,
          needsAction: 0,
          pendingOrders: 0,
          latestActionAt: null,
          presenceAt,
          hotOrders: 0,
          backlog: 0,
          technicalDelay: 0,
          callbackScheduled: 0,
          customerDelay: 0,
          actionTaken: 0,
          completed: 0,
          closed: 0,
          total: 0,
        });
      }

      // 2. Aggregate order metrics for active team members
      for (const r of baseFilteredRows) {
        if (!r.assigned_to) continue;
        const empId = String(r.assigned_to);
        const entry = teamBreakdownMap.get(empId);
        // If entry is not in active workforce map (e.g., archived staff or self), skip
        if (!entry) continue;

        entry.total++;
        if (isNeedsActionOrder(r)) entry.needsAction++;
        if (isNeedsActionOrder(r) || isCallbackScheduledOrder(r) || isTechnicalDelayOrder(r)) entry.pendingOrders++;
        if (r.is_hot) entry.hotOrders++;
        const rowDate = istDateKey(r.created_at);
        if (isNeedsActionOrder(r) && Boolean(rowDate && rowDate < todayIst)) entry.backlog++;
        if (isTechnicalDelayOrder(r)) entry.technicalDelay++;
        if (isCallbackScheduledOrder(r)) entry.callbackScheduled++;
        if (isCustomerDelayOrder(r)) entry.customerDelay++;
        if (r.in_range_completed) entry.completed++;
        if (r.in_range_closed) entry.closed++;
      }

      // 3. Credit actions strictly to the staff member who performed them.
      // Superadmin/support interventions on an order never count for, or wake up, the assignee.
      for (const r of baseFilteredRows) {
        const byActor = new Map<string, string>();
        for (const a of ((r as any).action_actors ?? []) as Array<{ actor_id: string | null; created_at: string }>) {
          if (!a.actor_id) continue;
          const prev = byActor.get(a.actor_id);
          if (!prev || new Date(a.created_at).getTime() > new Date(prev).getTime()) byActor.set(a.actor_id, a.created_at);
        }
        for (const [actorId, latest] of byActor) {
          const entry = teamBreakdownMap.get(actorId);
          if (!entry) continue;
          entry.actionTaken++;
          const tCurr = entry.latestActionAt ? new Date(entry.latestActionAt).getTime() : 0;
          if (new Date(latest).getTime() > tCurr) entry.latestActionAt = latest;
        }
      }
    }

    const teamBreakdown = Array.from(teamBreakdownMap.values()).sort((a, b) => {
      if (b.needsAction !== a.needsAction) return b.needsAction - a.needsAction;
      if (b.hotOrders !== a.hotOrders) return b.hotOrders - a.hotOrders;
      if (b.backlog !== a.backlog) return b.backlog - a.backlog;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    return {
      rows,
      total,
      counts,
      ageBuckets,
      page,
      pageSize: data.pageSize,
      teamBreakdown,
    };
  });

export type EmployeeAssignedOrderRow = {
  id: string;
  createdAt: string;
  customerName: string;
  serviceName: string;
  actionStatus: {
    label: string;
    tone: "red" | "green" | "blue" | "purple";
  };
  stage: {
    label: string;
    tone: string;
  };
};

/* ----------------------------- listEmployeeAssignedOrders --------------------------- */

export const listEmployeeAssignedOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { getStaffRoleInfo } = await import("@/lib/crm/order-auth.server");
    const staffInfo = await getStaffRoleInfo(admin, context.userId);
    if (!staffInfo.isAdmin && !staffInfo.isManager) {
      throw new Error("Forbidden: Only managers and administrators can view employee orders");
    }

    const offset = (data.page - 1) * data.pageSize;

    const countRes = await admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", data.employeeId)
      .eq("is_deleted", false);

    const total = countRes.count ?? 0;

    const { data: apps, error } = await admin
      .from("applications")
      .select(`
        id,
        created_at,
        application_status,
        fulfillment_status,
        order_status,
        closure_stage,
        closure_reason_code,
        workflow_status,
        technical_hold_started_at,
        customer_hold_started_at,
        form_submitted_at,
        form_link_sent_at,
        certificate_uploaded_at,
        fulfilled_at,
        reopened_at,
        lead_id,
        customer_id,
        services(service_name)
      `)
      .eq("assigned_to", data.employeeId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + data.pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const appList = apps ?? [];
    const leadIds = Array.from(new Set(appList.map((a: any) => a.lead_id).filter(Boolean)));
    const customerIds = Array.from(new Set(appList.map((a: any) => a.customer_id).filter(Boolean)));

    const [leadsRes, custsRes] = await Promise.all([
      leadIds.length > 0
        ? admin.from("leads").select("id, name").in("id", leadIds)
        : Promise.resolve({ data: [] }),
      customerIds.length > 0
        ? admin.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const leadNameMap = new Map<string, string>();
    for (const l of (leadsRes.data ?? []) as any[]) {
      if (l.name) leadNameMap.set(l.id, l.name);
    }

    const custNameMap = new Map<string, string>();
    for (const c of (custsRes.data ?? []) as any[]) {
      if (c.name) custNameMap.set(c.id, c.name);
    }

    const rows: EmployeeAssignedOrderRow[] = appList.map((a: any) => {
      const stageKey = computeOrderStage(null, a);
      const stageMeta = STAGE_META[stageKey];
      const stage = {
        label: stageMeta?.label ?? stageKey,
        tone: stageMeta?.tone ?? "emerald",
      };

      const actionStatus = getOrderActionStatus({
        fulfillment_status: a.fulfillment_status,
        stage: stageKey,
        form_link_sent_at: a.form_link_sent_at,
      });

      const customerName =
        (a.customer_id && custNameMap.get(a.customer_id)) ||
        (a.lead_id && leadNameMap.get(a.lead_id)) ||
        "—";

      const serviceName = (a.services as any)?.service_name || "—";

      return {
        id: a.id,
        createdAt: a.created_at,
        customerName,
        serviceName,
        actionStatus,
        stage,
      };
    });

    return {
      orders: rows,
      rows,
      total,
      page: data.page,
      pageSize: data.pageSize,
      hasMore: offset + rows.length < total,
    };
  });

/* ----------------------------- getOrderDetail (Core Data) --------------------------- */

export const getOrderDetailV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const { data: app, error } = await admin
      .from("applications")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !app) throw new Error("Order not found");

    // Core Data: Load essential display & workflow data concurrently in parallel
    const [leadRes, custRes, svcRes, paysRes, docsRes, statusEventsRes, staffRes, refundRes, schedRes, appEvRes, userRolesRes] = await Promise.all([
      app.lead_id
        ? admin.from("leads").select("id, lead_code, name, email, mobile, total_amount, base_amount, gst_amount, lead_status_v2, status, lead_source, service, language, state").eq("id", app.lead_id).maybeSingle()
        : Promise.resolve({ data: null }),
      app.customer_id
        ? admin.from("customers").select("id, customer_code, name, primary_email, primary_mobile").eq("id", app.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
      app.service_id
        ? admin.from("services").select("id, service_code, service_name, govt_portal_url").eq("id", app.service_id).maybeSingle()
        : Promise.resolve({ data: null }),
      app.lead_id
        ? admin
            .from("payments")
            .select("id, status, amount, gateway_name, transaction_id, payment_date, created_at, parent_payment_id, refund_reason, currency")
            .or(`application_id.eq.${data.orderId},lead_id.eq.${app.lead_id}`)
            .order("created_at", { ascending: false })
        : admin
            .from("payments")
            .select("id, status, amount, gateway_name, transaction_id, payment_date, created_at, parent_payment_id, refund_reason, currency")
            .eq("application_id", data.orderId)
            .order("created_at", { ascending: false }),
      admin
        .from("documents")
        .select("id, doc_type, file_path, file_name, mime_type, size_bytes, status, uploaded_at, created_at")
        .eq("application_id", data.orderId)
        .order("created_at", { ascending: false }),
      admin
        .from("application_events")
        .select("id, event_type, old_value, new_value, note, staff_name, staff_role, created_at")
        .eq("application_id", data.orderId)
        .eq("event_type", "status_change")
        .order("created_at", { ascending: false })
        .limit(50),
      app.assigned_to
        ? admin.from("profiles").select("id, display_name, full_name, email").eq("id", app.assigned_to).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("refund_requests")
        .select("id, status, refund_amount, refund_mode, deduction_amount, decided_at, created_at, reason")
        .eq("application_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("order_schedulers")
        .select("id, scheduler_type, status, started_at, fires_at, remarks, ticket_id, created_at")
        .eq("application_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("application_events")
        .select("id, event_type, old_value, new_value, note, staff_name, staff_role, created_at")
        .eq("application_id", data.orderId)
        .in("event_type", ["hot_priority_escalated", "order_reopened", "status_change"])
        .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId),
    ]);

    const refundReq = (refundRes as any)?.data;
    if (refundReq?.status) {
      (app as any).refund_status = refundReq.status;
      if (refundReq.status === "approved") {
        (app as any).refund_approved_at = (app as any).refund_approved_at || refundReq.decided_at || refundReq.created_at;
        (app as any).closure_stage = "refund_approved";
      }
    }

    const svcData = (svcRes as any)?.data;
    let workflowStages: string[] = FULFILLMENT_STAGES;
    const workflowPromise = svcData?.service_code
      ? admin.from("service_workflows").select("application_statuses").eq("service_code", svcData.service_code).maybeSingle()
      : Promise.resolve({ data: null });

    let payments = (paysRes.data ?? []) as any[];
    const payIds = payments.map((p) => p.id);
    const invoicePromise = payIds.length > 0
      ? admin.from("invoices").select("id, payment_id, invoice_number, pdf_path, issued_at, last_emailed_at, email_attempts, last_email_status, delivery_status, replaced_at, customer_gstin_snapshot").in("payment_id", payIds).is("cancelled_at", null)
      : Promise.resolve({ data: [] });

    const [wfRes, invsRes] = await Promise.all([workflowPromise, invoicePromise]);

    const arr = ((wfRes as any)?.data?.application_statuses as any[] | null) ?? null;
    if (Array.isArray(arr) && arr.length) {
      workflowStages = arr.map((s) => (typeof s === "string" ? s : s?.code ?? s?.id ?? "")).filter(Boolean);
    }

    const lead = (leadRes as any).data;
    const paidSum = payments
      .filter((p: any) => ["paid", "success", "successful"].includes(String(p.status)))
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const total = paidSum > 0 ? paidSum : Number(lead?.total_amount || 0);

    if (payments.length > 0) {
      const invs = (invsRes as any)?.data ?? [];
      const map = new Map((invs ?? []).map((i: any) => [i.payment_id, i]));
      payments = payments.map((p) => {
        const inv: any = map.get(p.id);
        return {
          ...p,
          invoice_id: inv?.id ?? null,
          invoice_number: inv?.invoice_number ?? null,
          invoice_issued_at: inv?.issued_at ?? null,
          invoice_last_emailed_at: inv?.last_emailed_at ?? null,
          invoice_email_attempts: inv?.email_attempts ?? 0,
          invoice_last_email_status: inv?.last_email_status ?? null,
          invoice_delivery_status: inv?.delivery_status ?? null,
          invoice_replaced_at: inv?.replaced_at ?? null,
          invoice_gstin: inv?.customer_gstin_snapshot ?? null,
          has_pdf: !!inv?.pdf_path,
        };
      });
    }

    const paymentStatus = rollupPaymentStatus(
      payments.map((p) => ({ status: String(p.status), amount: Number(p.amount || 0) })),
      total,
    );

    const stageEvents = (statusEventsRes.data ?? []);
    const stageMeta: Record<string, { at: string; staff_name: string | null }> = {};
    for (const ev of stageEvents) {
      const key = ev.new_value as string;
      if (key && !stageMeta[key]) stageMeta[key] = { at: (ev.created_at as string) ?? "", staff_name: ev.staff_name ?? null };
    }
    if (!stageMeta["order_received"]) {
      stageMeta["order_received"] = { at: app.created_at as string, staff_name: null };
    }

    const paymentSuccessfulAt = payments
      .filter((p: any) => ["paid", "success", "successful"].includes(String(p.status)) && p.payment_date)
      .map((p: any) => p.payment_date as string)
      .sort()[0] ?? null;

    const schedulers = (schedRes as any)?.data ?? [];
    const appEvents = (appEvRes as any)?.data ?? [];

    const activeHotSched = schedulers.find((s: any) => ["active", "paused"].includes(s.status) && (s.scheduler_type === "our_side_reminder" || s.ticket_id));
    const schedRemarks = activeHotSched?.remarks
      ? (typeof activeHotSched.remarks === "string" ? (() => { try { return JSON.parse(activeHotSched.remarks); } catch { return null; } })() : activeHotSched.remarks)
      : null;

    const ticketEvent = appEvents.find((e: any) =>
      (e.event_type === "hot_priority_escalated" || e.event_type === "order_reopened") &&
      (e.note?.includes("Ticket") || e.note?.includes("ticket"))
    );

    const isFromTicket = Boolean(
      schedRemarks?.reason === "ticket_hot_priority" ||
      schedRemarks?.ticketNumber ||
      activeHotSched?.ticket_id ||
      ticketEvent
    );

    const rawIsReopened =
      app.order_status === "REOPENED" ||
      (app.fulfillment_status as any) === "order_reopened" ||
      (app.workflow_status as any) === "order_reopened" ||
      app.workflow_status === "processing_resumed";

    if (rawIsReopened && (!activeHotSched || activeHotSched.status !== "active")) {
      const nextOs = app.form_submitted_at ? "IN_PROCESSING" : "FORM_PENDING";
      const nextFs = app.form_submitted_at ? "form_submitted" : "form_not_submitted";
      app.order_status = nextOs;
      app.fulfillment_status = nextFs;
      app.workflow_status = "processing";
      app.application_status = "under_process";
      (app as any).is_hot = false;

      admin
        .from("applications")
        .update({
          order_status: nextOs,
          fulfillment_status: nextFs,
          workflow_status: "processing",
          application_status: "under_process",
          is_hot: false,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", app.id)
        .then(() => {});
    }

    // Ticket created / order reopened timestamps for the escalation banner.
    let ticketCreatedAt: string | null = null;
    let ticketReopenedAt: string | null = null;
    if (isFromTicket) {
      const tId = schedRemarks?.ticketId || activeHotSched?.ticket_id || null;
      const tNum = schedRemarks?.ticketNumber || (ticketEvent?.note?.match(/#([A-Za-z0-9\-]+)/)?.[1]) || null;
      if (tId || tNum) {
        const q = admin.from("support_tickets").select("created_at").limit(1);
        const { data: t } = await (tId ? q.eq("id", tId) : q.eq("ticket_number", tNum)).maybeSingle();
        ticketCreatedAt = (t as any)?.created_at ?? null;
      }
      ticketReopenedAt = ticketEvent?.created_at || activeHotSched?.started_at || app.reopened_at || null;
    }

    const ticketEscalation = isFromTicket
      ? {
          ticketCreatedAt,
          ticketReopenedAt,
          isEscalated: true,
          ticketNumber: schedRemarks?.ticketNumber || (ticketEvent?.note?.match(/#([A-Za-z0-9\-]+)/)?.[1]) || null,
          ticketId: schedRemarks?.ticketId || activeHotSched?.ticket_id || null,
          note: schedRemarks?.note || ticketEvent?.note || null,
          isHot: Boolean(activeHotSched?.status === "active"),
          isReopened: Boolean(
            (app.order_status === "REOPENED" || (app.fulfillment_status as any) === "order_reopened") &&
            activeHotSched?.status === "active"
          ),
          escalatedAt: activeHotSched?.started_at || ticketEvent?.created_at || app.reopened_at || null,
        }
      : null;

    const userRoleList = ((userRolesRes as any)?.data ?? []).map((r: any) => r.role);
    const isSuperAdmin = userRoleList.includes("super_admin") || userRoleList.includes("admin");

    return {
      application: app,
      lead,
      customer: (custRes as any).data,
      service: (svcRes as any).data,
      payments,
      paymentStatus,
      paymentSuccessfulAt,
      total,
      documents: docsRes.data ?? [],
      assignedStaff: (staffRes as any).data ?? null,
      workflowStages,
      stageMeta,
      ticketEscalation,
      isSuperAdmin,
      // Backward compatibility fields initialized empty, populated on-demand
      events: [],
      emailLogs: [],
      orderTickets: [],
      customerTickets: [],
    };
  });

/* ----------------------------- Lazy Secondary Data Server Functions --------------------------- */

export const getOrderTimelineEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const [eventsRes, emailLogRows, templateRows] = await Promise.all([
      admin
        .from("application_events")
        .select("id, event_type, old_value, new_value, note, staff_name, staff_role, created_at")
        .eq("application_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("email_logs")
        .select("id, subject, template_code, status, to_email, error_message, created_at, sent_at")
        .eq("application_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(200),
      admin.from("email_templates").select("code"),
    ]);

    const templateSet = new Set(((templateRows?.data ?? []) as any[]).map((t) => t.code));
    const emailLogs = ((emailLogRows?.data ?? []) as any[]).map((l) => ({
      ...l,
      template_exists: Boolean(l.template_code && templateSet.has(l.template_code)),
    }));

    return {
      events: eventsRes.data ?? [],
      emailLogs,
    };
  });

export const getOrderTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid(), customerId: z.string().uuid().nullable().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const [orderTicketsRes, customerTicketsRes] = await Promise.all([
      admin
        .from("support_tickets")
        .select("id, ticket_number, subject, status, priority, created_at, updated_at")
        .eq("application_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(50),
      data.customerId
        ? admin
            .from("support_tickets")
            .select("id, ticket_number, subject, status, priority, application_id, created_at")
            .eq("customer_id", data.customerId)
            .neq("application_id", data.orderId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    return {
      orderTickets: (orderTicketsRes as any)?.data ?? [],
      customerTickets: (customerTicketsRes as any)?.data ?? [],
    };
  });

/* ----------------------------- updateOrderAssignee ---------------------- */

export const updateOrderAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orderId: z.string().uuid(), assignedTo: z.string().uuid().nullable() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { getStaffRoleInfo } = await import("@/lib/crm/order-auth.server");
    const roleInfo = await getStaffRoleInfo(admin, context.userId);
    if (!roleInfo.isAdmin && !roleInfo.isManager) {
      throw new Error("Forbidden: Only Admin and Manager can reassign orders");
    }
    const { assignOrderCanonical } = await import("./assignment-engine.server");

    const res = await assignOrderCanonical({
      orderId: data.orderId,
      newEmployeeId: data.assignedTo,
      changeType: "MANUAL",
      reason: "Manual reassignment by operator/admin",
      source: "manual",
      actorId: context.userId,
    });

    if (!res.success && res.error) {
      throw new Error(res.error);
    }

    return { ok: true };
  });

/* ----------------------------- updateFulfillmentStatus ------------------ */

export const updateFulfillmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        toStatus: z.string(),
        note: z.string().max(2000).optional(),
        // Allow a single-step backward move (revert). One stage only,
        // never from `completed` or `cancelled`.
        allowBackward: z.boolean().optional(),
        // Admin/super-admin override: skip the strict stepwise map so any
        // stage can be set. Verified server-side against the caller's role.
        adminOverride: z.boolean().optional(),
        // Required when transitioning to `completed`
        certificateDocumentId: z.string().uuid().optional(),
        certificateNumber: z.string().trim().min(1).max(120).optional(),
        completionNotes: z.string().trim().max(2000).optional(),
        ccEmail: z
          .string()
          .trim()
          .optional()
          .refine(
            (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
            { message: "Please provide a valid CC email address." }
          ),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const { data: app } = await admin
      .from("applications")
      .select("id, application_code, fulfillment_status, lead_id, customer_id, service_id, order_status, reopened_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!app) throw new Error("Order not found");

    const current = (app.fulfillment_status ?? "order_received") as FulfillmentStatus;
    const target = data.toStatus as FulfillmentStatus;
    const isCertUpload = (target === "completed" || target === "order_completed") && Boolean(data.certificateDocumentId);

    // If already at target status, return no-op UNLESS this is an explicit certificate upload / deliver action.
    if (current === target && !isCertUpload) return { ok: true, noop: true };

    // Verify admin override request against the caller's actual role.
    let isAdminOverride = false;
    if (data.adminOverride) {
      const { data: roles } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      isAdminOverride = (roles ?? []).some(
        (r: any) => r.role === "admin" || r.role === "super_admin",
      );
    }

    const isReopened =
      app.order_status === "REOPENED" ||
      app.reopened_at != null ||
      current === "order_reopened";

    const allowed = getAllowedFulfillmentTransitions(current);
    const curIdx = FULFILLMENT_STAGES.indexOf(current);
    const tgtIdx = FULFILLMENT_STAGES.indexOf(target);
    const isOneStepBack =
      data.allowBackward === true &&
      curIdx > 0 &&
      tgtIdx === curIdx - 1 &&
      current !== "completed" &&
      current !== "cancelled" &&
      target !== "cancelled";

    // Completing an order (with certificate) is allowed from any active stage,
    // when admin override is active, when the order has been reopened,
    // or when staff explicitly provides a certificate to complete / re-issue.
    const isCompleteWithCert =
      (target === "completed" || target === "order_completed") &&
      (isAdminOverride || isReopened || isCertUpload || (current !== "cancelled" && current !== "completed"));

    // B06 "Consultation Completed" is an intentional jump the operator can
    // trigger from any active stage — do not force it through the stepwise map.
    const isConsultationJump =
      target === "consultation_completed" &&
      current !== "cancelled" &&
      current !== "completed" &&
      current !== "order_closed";

    if (!isAdminOverride && !allowed.includes(target) && !isOneStepBack && !isCompleteWithCert && !isConsultationJump) {
      const allowedLabel = allowed.length ? allowed.join(", ") : "none";
      throw new Error(
        `Cannot move order from "${FULFILLMENT_LABEL[current] ?? current}" to "${FULFILLMENT_LABEL[target] ?? target}". Allowed next stages: ${allowedLabel}.`,
      );
    }

    const isCompletionAction = target === "completed" || (target === "order_completed" && Boolean(data.certificateDocumentId));

    if (isCompletionAction) {
      if (!data.certificateDocumentId) {
        throw new Error("Please upload the certificate PDF before marking this order complete.");
      }
      if (!data.certificateNumber || !data.certificateNumber.trim()) {
        throw new Error("Please enter the certificate / document number before completing this order.");
      }
    }

    // Update normal stage changes immediately. Completion is handled below only
    // after the certificate email has actually been accepted by SMTP.
    if (!isCompletionAction) {
      const upd: Record<string, unknown> = { fulfillment_status: target };
      const { error: upErr } = await admin.from("applications").update(upd as never).eq("id", data.orderId);
      if (upErr) throw new Error(upErr.message);
    }

    const { staff_name, staff_role } = await getStaff(context.userId);

    if (data.note) {
      await admin.from("application_events").insert({
        application_id: data.orderId,
        lead_id: app.lead_id,
        customer_id: app.customer_id ?? null,
        event_type: "note_added",
        note: data.note,
        created_by: context.userId,
        staff_name,
        staff_role,
      } as never);
    }

    if (isCompletionAction) {
      const certNumber = data.certificateNumber!.trim();
      const completionNotes = data.completionNotes?.trim() || null;
      const now = new Date().toISOString();

      // Lookup the uploaded certificate document so we can mirror it into
      // the `certificates` table (single source of truth for history & resend).
      const { data: certDoc } = await admin
        .from("documents")
        .select("id, file_path, file_name, mime_type")
        .eq("id", data.certificateDocumentId!)
        .maybeSingle();

      let certificateId: string | null = null;
      if (certDoc) {
        const { data: certRow, error: certErr } = await admin
          .from("certificates")
          .insert({
            application_id: data.orderId,
            lead_id: app.lead_id,
            customer_id: app.customer_id ?? null,
            certificate_number: certNumber,
            file_path: certDoc.file_path,
            file_name: certDoc.file_name,
            mime_type: certDoc.mime_type,
            issued_at: now,
            uploaded_by: context.userId,
          } as never)
          .select("id")
          .single();
        if (certErr) {
          console.error("[fulfillment.complete] certificate insert failed:", certErr);
        } else {
          certificateId = (certRow as { id: string }).id;
        }
      }

      // Build certificate delivery email — signed URL valid 7 days.
      const [{ data: lead }, { data: customer }, { data: service }] = await Promise.all([
        app.lead_id
          ? admin.from("leads").select("name, email, mobile, service").eq("id", app.lead_id).maybeSingle()
          : Promise.resolve({ data: null as null | { name: string | null; email: string | null; mobile: string | null; service: string | null } }),
        app.customer_id
          ? admin.from("customers").select("name, primary_email, primary_mobile").eq("id", app.customer_id).maybeSingle()
          : Promise.resolve({ data: null as null | { name: string | null; primary_email: string | null; primary_mobile: string | null } }),
        app.service_id
          ? admin.from("services").select("service_name, service_code").eq("id", app.service_id).maybeSingle()
          : Promise.resolve({ data: null as null | { service_name: string | null; service_code: string | null } }),
      ]);

      const recipientEmail = (customer?.primary_email ?? "").trim() || (lead?.email ?? "").trim() || null;
      const recipientName = lead?.name || customer?.name || "Customer";
      const serviceName = service?.service_name || lead?.service || "Service";

      let certificateUrl: string | null = null;
      let certAttachment: { filename: string; content_type: string; content_base64: string } | null = null;
      if (certDoc?.file_path) {
        const { data: signed } = await admin.storage
          .from("documents")
          .createSignedUrl(certDoc.file_path, 60 * 60 * 24 * 7);
        certificateUrl = signed?.signedUrl ?? null;

        try {
          const { data: blob, error: dlErr } = await admin.storage
            .from("documents")
            .download(certDoc.file_path);
          if (dlErr) throw dlErr;
          if (blob) {
            const buf = Buffer.from(await blob.arrayBuffer());
            if (buf.byteLength <= 9 * 1024 * 1024) {
              const ext = (certDoc.file_name?.split(".").pop() || "pdf").toLowerCase();
              certAttachment = {
                filename: `${certNumber || app.application_code || "certificate"}.${ext}`,
                content_type: certDoc.mime_type || "application/octet-stream",
                content_base64: buf.toString("base64"),
              };
            } else {
              console.warn("[certificate] attachment skipped: file >9MB", buf.byteLength);
            }
          }
        } catch (e) {
          console.warn("[certificate] attachment skipped: download failed", e);
        }
      }

      if (!recipientEmail) {
        throw new Error("Customer has no email on file — certificate email was not sent and order was not completed.");
      }
      if (!certificateUrl) {
        throw new Error("Could not generate certificate download link — certificate email was not sent and order was not completed.");
      }

      const normalizedCc = data.ccEmail?.trim() ? data.ccEmail.trim().toLowerCase() : undefined;

      if (recipientEmail && certificateUrl) {
        const completedDateFormatted = new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
        });
        const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
        try {
          await enqueueFromTemplateInternal("order_completed", recipientEmail, {
              customer_name: recipientName,
              service_name: serviceName,
              order_number: app.application_code ?? "",
              certificate_number: certNumber,
              certificate_url: certificateUrl,
              completion_notes: completionNotes ?? "",
              document_name: certAttachment?.filename ?? "Certificate",
              order_code: app.application_code ?? "",
              order_completion_date_time: completedDateFormatted,
              order_completion_date: completedDateFormatted,
              order_completed_date_time: completedDateFormatted,
              order_completed_date: completedDateFormatted,
              order_completed_at: completedDateFormatted,
              completed_date_time: completedDateFormatted,
              completed_date: completedDateFormatted,
              completed_at: completedDateFormatted,
              completion_date_time: completedDateFormatted,
              completion_date: completedDateFormatted,
              completion_at: completedDateFormatted,
            }, {
              toName: recipientName,
              leadId: app.lead_id,
              applicationId: data.orderId,
              cc: normalizedCc,
              attachments: certAttachment
                ? [{ filename: certAttachment.filename, content_type: certAttachment.content_type, content_base64: certAttachment.content_base64 }]
                : undefined,
              requireImmediateSuccess: true,
              allowDuplicate: true,
              trigger: "manual",
            });
        } catch (sendErr: any) {
          const failMessage = sendErr?.message || "Failed to submit certificate email";
          console.error("[orders-v2.updateFulfillmentStatus] Certificate email sending failed:", sendErr);
          await admin.from("application_events").insert({
            application_id: data.orderId,
            lead_id: app.lead_id,
            customer_id: app.customer_id ?? null,
            event_type: "certificate_send_failed",
            new_value: "failed",
            note: `Certificate email submission failed for registered email ${recipientEmail}${normalizedCc ? `, with CC to ${normalizedCc}` : ""}. Error: ${failMessage}`,
            created_by: context.userId,
            staff_name,
            staff_role,
          } as never);
          throw new Error(`Certificate email submission failed: ${failMessage}. The order was not marked completed.`);
        }
      }

      // Mark application completed only after certificate email send succeeds.
      // S11 · Order Completed.
      await admin
        .from("applications")
        .update({
          fulfillment_status: "order_completed",
          application_status: "completed",
          order_status: "COMPLETED",
          fulfilled_at: now,
          certificate_uploaded_at: now,
          certificate_number: certNumber,
          documents_deleted_at: now,
          documents_deleted_reason: "completed",
          reopened_at: null,
        } as never)
        .eq("id", data.orderId);

      // Stop any active callback reminder schedulers for this completed order
      await admin
        .from("order_schedulers")
        .update({
          status: "stopped",
          stopped_at: now,
          stop_reason: "order_completed",
          stop_triggered_by: context.userId,
        })
        .eq("application_id", data.orderId)
        .in("status", ["active", "paused"]);

      if (certificateId) {
        await admin
          .from("certificates")
          .update({ delivered_at: now } as never)
          .eq("id", certificateId);
      }

      // Wipe other docs, but never delete the just-uploaded certificate file.
      // This is intentionally done here instead of relying on the Edge
      // Function deployment, so completion cannot accidentally remove the
      // certificate before/after delivery.
      try {
        const { data: docs } = await admin
          .from("documents")
          .select("id, file_path, doc_type")
          .eq("application_id", data.orderId);
        const removable = (docs ?? []).filter((d: any) => {
          if (d.id === data.certificateDocumentId) return false;
          if (String(d.doc_type ?? "").toLowerCase() === "certificate") return false;
          return true;
        });
        const paths = removable.map((d: any) => d.file_path).filter(Boolean);
        if (paths.length) await admin.storage.from("documents").remove(paths);
        const ids = removable.map((d: any) => d.id).filter(Boolean);
        if (ids.length) await admin.from("documents").delete().in("id", ids);
      } catch (e) {
        console.error("completed order document cleanup failed:", e);
      }

      // Close the parent lead (trigger logs lead_status_change automatically).
      if (app.lead_id) {
        await admin
          .from("leads")
          .update({ lead_status_v2: "closed" } as never)
          .eq("id", app.lead_id);
      }


      const isReissue = current === "completed" || current === "order_completed" || isReopened;
      const historyNote = normalizedCc
        ? `Certificate email sent successfully to the registered email ${recipientEmail}, with CC to ${normalizedCc}.${completionNotes ? ` Notes: ${completionNotes}` : ""}`
        : ((isReissue ? "Certificate re-issued / resent. " : "Application completed. ") +
          `Certificate ${certNumber}` +
          ` sent to ${recipientEmail}` +
          (completionNotes ? `. Notes: ${completionNotes}` : "."));

      await admin.from("application_events").insert({
        application_id: data.orderId,
        lead_id: app.lead_id,
        customer_id: app.customer_id ?? null,
        event_type: isReissue ? "certificate_reissued" : "application_completed",
        new_value: "completed",
        note: historyNote,
        created_by: context.userId,
        staff_name,
        staff_role,
      } as never);

      // Automatically complete any active callback / Hot Order on order completion
      try {
        const { completeHotOrderOnQualifyingAction } = await import("@/lib/orders/actions/callback-reminder.functions");
        await completeHotOrderOnQualifyingAction({
          orderId: data.orderId,
          actorId: context.userId,
          actorName: staff_name,
          actorRole: staff_role,
          actionName: "Application Accepted",
          actionReason: `Completed with certificate ${certNumber}`,
          supabase: admin,
        });
      } catch (hotErr) {
        console.warn("[updateFulfillmentStatus.completed] completeHotOrderOnQualifyingAction warning:", hotErr);
      }

      return {
        ok: true,
        certificateId,
        certificateNumber: certNumber,
        emailQueuedTo: recipientEmail,
      };
    }

    // Automatically complete any active callback / Hot Order on qualifying fulfillment transition
    try {
      const { completeHotOrderOnQualifyingAction } = await import("@/lib/orders/actions/callback-reminder.functions");
      await completeHotOrderOnQualifyingAction({
        orderId: data.orderId,
        actorId: context.userId,
        actorName: staff_name,
        actorRole: staff_role,
        actionName: FULFILLMENT_LABEL[target] || target,
        actionReason: data.note || `Fulfillment stage changed to ${FULFILLMENT_LABEL[target] || target}`,
        supabase: admin,
      });
    } catch (hotErr) {
      console.warn("[updateFulfillmentStatus] completeHotOrderOnQualifyingAction warning:", hotErr);
    }

    return { ok: true };
  });

/** Resend the latest certificate for an order. Generates a fresh 7-day signed URL. */
export const resendOrderCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      ccEmail: z.string().trim().email("Invalid CC email address").optional().or(z.literal("")).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const normalizedCc = data.ccEmail?.trim() ? data.ccEmail.trim().toLowerCase() : undefined;
    const { staff_name, staff_role } = await getStaff(context.userId);

    const { data: cert, error: certErr } = await admin
      .from("certificates")
      .select("id, file_path, file_name, mime_type, certificate_number, lead_id, customer_id, application_id")
      .eq("application_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (certErr) throw new Error(certErr.message);
    if (!cert) throw new Error("No certificate has been issued for this order yet.");
    if (!cert.file_path) throw new Error("Certificate file is missing — cannot resend.");

    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(cert.file_path, 60 * 60 * 24 * 7);
    if (!signed?.signedUrl) throw new Error("Could not generate a fresh download link.");

    let resendAttachment: { filename: string; content_type: string; content_base64: string } | null = null;
    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from("documents")
        .download(cert.file_path);
      if (dlErr) throw dlErr;
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        if (buf.byteLength <= 9 * 1024 * 1024) {
          const ext = ((cert as any).file_name?.split(".").pop() || "pdf").toLowerCase();
          resendAttachment = {
            filename: `${cert.certificate_number || "certificate"}.${ext}`,
            content_type: (cert as any).mime_type || "application/octet-stream",
            content_base64: buf.toString("base64"),
          };
        } else {
          console.warn("[certificate.resend] attachment skipped: file >9MB", buf.byteLength);
        }
      }
    } catch (e) {
      console.warn("[certificate.resend] attachment skipped: download failed", e);
    }


    const [{ data: app }, { data: customer }, { data: lead }] = await Promise.all([
      admin.from("applications").select("application_code, service_id, lead_id, customer_id").eq("id", data.orderId).maybeSingle(),
      cert.customer_id
        ? admin.from("customers").select("name, primary_email").eq("id", cert.customer_id).maybeSingle()
        : Promise.resolve({ data: null as null | { name: string | null; primary_email: string | null } }),
      cert.lead_id
        ? admin.from("leads").select("name, email, service").eq("id", cert.lead_id).maybeSingle()
        : Promise.resolve({ data: null as null | { name: string | null; email: string | null; service: string | null } }),
    ]);

    const serviceRow = app?.service_id
      ? (await admin.from("services").select("service_name").eq("id", app.service_id).maybeSingle()).data
      : null;

    const recipientEmail = (customer?.primary_email ?? "").trim() || (lead?.email ?? "").trim() || null;
    const recipientName = lead?.name || customer?.name || "Customer";
    const serviceName = serviceRow?.service_name || lead?.service || "Service";

    if (!recipientEmail) {
      throw new Error("No email address on file for this customer — cannot resend certificate.");
    }

    try {
      const appAny = app as any;
      const completedDateFormatted = new Date(appAny?.fulfilled_at ?? appAny?.updated_at ?? new Date()).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
      const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
      await enqueueFromTemplateInternal("order_completed", recipientEmail, {
          customer_name: recipientName,
          service_name: serviceName,
          order_number: app?.application_code ?? "",
          certificate_number: cert.certificate_number,
          certificate_url: signed.signedUrl,
          document_name: resendAttachment?.filename ?? "Certificate",
          resend: true,
          order_completion_date_time: completedDateFormatted,
          order_completion_date: completedDateFormatted,
          order_completion_time: completedDateFormatted,
          order_completed_date_time: completedDateFormatted,
          order_completed_date: completedDateFormatted,
          order_completed_at: completedDateFormatted,
          completed_date_time: completedDateFormatted,
          completed_date: completedDateFormatted,
          completed_at: completedDateFormatted,
          completion_date_time: completedDateFormatted,
          completion_date: completedDateFormatted,
          completion_at: completedDateFormatted,
        }, {
          toName: recipientName,
          leadId: cert.lead_id,
          applicationId: data.orderId,
          cc: normalizedCc,
          attachments: resendAttachment
            ? [{ filename: resendAttachment.filename, content_type: resendAttachment.content_type, content_base64: resendAttachment.content_base64 }]
            : undefined,
          requireImmediateSuccess: true,
          allowDuplicate: true,
          trigger: "manual",
        });
    } catch (sendErr: any) {
      const failMessage = sendErr?.message || "Failed to submit certificate email";
      console.error("[orders-v2.resendOrderCertificate] Certificate email sending failed:", sendErr);
      await admin.from("application_events").insert({
        application_id: data.orderId,
        lead_id: cert.lead_id,
        customer_id: cert.customer_id ?? null,
        event_type: "certificate_resend_failed",
        new_value: "failed",
        note: `Certificate email resend submission failed for registered email ${recipientEmail}${normalizedCc ? `, with CC to ${normalizedCc}` : ""}. Error: ${failMessage}`,
        created_by: context.userId,
        staff_name,
        staff_role,
      } as never);
      throw new Error(`Failed to resend certificate email: ${failMessage}`);
    }

    await admin
      .from("certificates")
      .update({ delivered_at: new Date().toISOString() } as never)
      .eq("id", cert.id);

    const historyNote = normalizedCc
      ? `Certificate email sent successfully to the registered email ${recipientEmail}, with CC to ${normalizedCc}.`
      : `Certificate ${cert.certificate_number ?? ""} resent to ${recipientEmail}.`;

    await admin.from("application_events").insert({
      application_id: data.orderId,
      lead_id: cert.lead_id,
      customer_id: cert.customer_id ?? null,
      event_type: "certificate_resent",
      note: historyNote,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);

    return { ok: true, resentTo: recipientEmail };
  });

function buildCertificateEmailHtml(opts: {
  recipientName: string;
  serviceName: string;
  certificateNumber: string;
  certificateUrl: string;
  completionNotes: string | null;
  orderCode: string;
  resend?: boolean;
}): string {
  const orderId = escapeHtml(opts.orderCode || "—");
  const customerName = escapeHtml(opts.recipientName);
  const resendBanner = opts.resend
    ? `<tr><td style="padding:0 32px 12px 32px">
         <div style="padding:10px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;color:#92400e;font-size:12px;font-family:Arial,sans-serif">
           This is a fresh copy of your certificate, sent again at your request.
         </div>
       </td></tr>`
    : "";
  const notesBlock = opts.completionNotes
    ? `<tr><td style="padding:0 32px 16px 32px">
         <div style="padding:12px 14px;background:#f8fafc;border-left:3px solid #0f3460;color:#334155;font-size:13px;font-family:Arial,sans-serif;line-height:1.55">
           <strong>Note from our team:</strong><br/>${escapeHtml(opts.completionNotes)}
         </div>
       </td></tr>`
    : "";

  const completedDate = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Order Completed</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08)">
        <tr><td style="background:#0f3460;color:#ffffff;padding:22px 32px;font-size:20px;font-weight:700;letter-spacing:0.2px">
          Order Completed
        </td></tr>
        ${resendBanner}
        <tr><td style="padding:24px 32px 8px 32px;font-size:14px;line-height:1.65;color:#0f172a">
          <p style="margin:0 0 12px 0">Dear ${customerName},</p>
          <p style="margin:0 0 12px 0">Greetings from Business Help Services.</p>
          <p style="margin:0 0 12px 0">
            We are pleased to inform you that your <strong>Order/Application No. ${orderId}</strong>
            for UDYAM-related consultancy and assistance services has been processed/completed.
          </p>

          <!-- Order Summary Card -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:13px;color:#0f172a">
            <tr>
              <td style="padding:4px 0;color:#64748b;width:160px">Order Number:</td>
              <td style="padding:4px 0;font-weight:600;color:#0f172a">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b">Service Selected:</td>
              <td style="padding:4px 0;font-weight:600;color:#0f172a">${escapeHtml(opts.serviceName || "UDYAM Consultancy Service")}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b">Order Completed Date:</td>
              <td style="padding:4px 0;font-weight:700;color:#0f3460">${completedDate} IST</td>
            </tr>
          </table>

          <p style="margin:0 0 12px 0">
            Please find the relevant document/certificate attached to this email for your reference and records.
          </p>
          <p style="margin:0 0 12px 0">
            Kindly review the attached document carefully and contact us through written communication in case any clarification or assistance is required.
          </p>
          <p style="margin:0 0 6px 0">For any support regarding this order, please contact:</p>
          <p style="margin:0 0 12px 0"><strong>Team Business Help Services</strong></p>
          <p style="margin:0 0 12px 0">
            Kindly mention your <strong>Order/Application Number</strong> in all future communications for quicker assistance and verification.
          </p>
          <p style="margin:0 0 12px 0;color:#475569;font-size:13px">
            In case no response, objection, or discrepancy is reported by the User within a reasonable period after this communication, the service/delivery may be treated as completed for operational and record purposes.
          </p>
          <p style="margin:0 0 16px 0">We thank you for choosing our services and appreciate the opportunity to assist you.</p>
          <p style="margin:0 0 4px 0">Warm Regards,</p>
          <p style="margin:0 0 16px 0"><strong>Team Business Help Services</strong></p>
        </td></tr>
        ${notesBlock}
        <tr><td style="padding:0 32px 24px 32px">
          <div style="text-align:center;margin:8px 0 4px 0">
            <a href="${opts.certificateUrl}"
               style="background:#0f3460;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;font-size:14px">
              Download Certificate
            </a>
          </div>
          <p style="margin:10px 0 0 0;font-size:11px;color:#94a3b8;text-align:center">
            The download link is valid for 7 days. The certificate is also attached to this email.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;font-size:12px;color:#475569;line-height:1.6">
          📧 <a href="mailto:help@businesshelpservices.com" style="color:#0f3460;text-decoration:none">help@businesshelpservices.com</a><br/>
          🌐 <a href="https://udyamadhar.in" style="color:#0f3460;text-decoration:none">https://udyamadhar.in</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


/* ----------------------------- Document upload (cert + internal) -------- */

const MAX_DOC_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp",
];

export const requestOrderDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        docType: z.string().trim().min(1).max(60),
        fileName: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().min(1).max(120),
        sizeBytes: z.number().int().min(1).max(MAX_DOC_BYTES),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    if (!ALLOWED_MIME.includes(data.mimeType.toLowerCase())) {
      throw new Error("Unsupported file type. Use PDF, JPG, PNG or WEBP.");
    }
    const ext = (data.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "bin";
    const safe = data.docType.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
    const path = `orders/${data.orderId}/${safe}-${Date.now()}.${ext}`;
    const { data: signed, error } = await admin.storage.from("documents").createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Could not start upload.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const confirmOrderDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        docType: z.string().trim().min(1).max(60),
        filePath: z.string().min(1).max(400),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(120),
        sizeBytes: z.number().int().min(1).max(MAX_DOC_BYTES),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const { data: app } = await admin
      .from("applications")
      .select("lead_id")
      .eq("id", data.orderId)
      .maybeSingle();

    const { data: row, error } = await admin
      .from("documents")
      .insert({
        application_id: data.orderId,
        lead_id: app?.lead_id ?? null,
        doc_type: data.docType,
        file_path: data.filePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        status: "uploaded",
        uploaded_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { staff_name, staff_role } = await getStaff(context.userId);
    await admin.from("application_events").insert({
      application_id: data.orderId,
      lead_id: app?.lead_id ?? null,
      event_type: "document_uploaded",
      note: `${data.docType}: ${data.fileName}`,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);

    return { documentId: (row as any).id as string };
  });

export const getOrderDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { getStaffRoleInfo, assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    const roleInfo = await getStaffRoleInfo(admin, context.userId);
    if (!roleInfo.isStaff) throw new Error("Forbidden: Staff access required");

    // Normalise legacy paths: full storage URLs or "documents/..." prefixes.
    let path = data.path.trim();
    const m = path.match(/\/object\/(?:public|sign|authenticated)\/documents\/([^?]+)/);
    if (m) path = decodeURIComponent(m[1]);
    path = path.replace(/^\/+/, "").replace(/^documents\//, "");

    // If regular employee, verify that the document belongs to an application assigned to this user
    if (!roleInfo.isAdmin && !roleInfo.isManager) {
      const { data: docRow } = await admin
        .from("documents")
        .select("application_id")
        .or(`file_path.eq.${path},file_path.ilike.%${path}%`)
        .limit(1)
        .maybeSingle();

      if (docRow?.application_id) {
        await assertCanAccessOrder({ orderId: docRow.application_id, userId: context.userId, admin });
      }
    }

    try {
      const { data: signed, error } = await admin.storage.from("documents").createSignedUrl(path, 600);
      if (error || !signed?.signedUrl) {
        console.error("[getOrderDocumentSignedUrl] sign failed:", error?.message);
        return { url: null as string | null, error: "File not found in storage" };
      }
      return { url: signed.signedUrl as string | null, error: null as string | null };
    } catch (e) {
      console.error("[getOrderDocumentSignedUrl] unexpected:", e);
      return { url: null as string | null, error: "Could not open document" };
    }
  });

export const addOrderNoteV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orderId: z.string().uuid(), note: z.string().trim().min(1).max(2000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const { data: app } = await admin
      .from("applications")
      .select("lead_id, customer_id")
      .eq("id", data.orderId)
      .maybeSingle();
    const { staff_name, staff_role } = await getStaff(context.userId);
    const { error } = await admin.from("application_events").insert({
      application_id: data.orderId,
      lead_id: app?.lead_id ?? null,
      customer_id: app?.customer_id ?? null,
      event_type: "note_added",
      note: data.note,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Change Service (allowed until form submitted / S04) ─────────────────
// Swaps the order's service to a different one and adjusts lead pricing to
// the new service's totals. If the customer already paid more than the new
// total, no automatic refund is triggered (per business rule). If they paid
// less, a `payment_links` row is created for the delta as a supplementary
// top-up record for staff to share; the supplementary invoice is issued when
// that top-up payment is finalized (uses the existing finalize pipeline).
const ChangeServiceInput = z.object({
  orderId: z.string().uuid(),
  newServiceId: z.string().uuid(),
});

const CHANGE_SERVICE_ALLOWED_STAGES = new Set<string>([
  "order_received",
  "awaiting_customer_form",
  "waiting_for_customer_submission",
  "waiting_customer_submission",
  // legacy fallbacks
  "S01", "S02", "S03",
]);

export const changeOrderService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ChangeServiceInput.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    if (!isAdmin) {
      const { data: roleRows } = await context.supabase
        .from("user_roles").select("role").eq("user_id", context.userId);
      // Staff roles with full order access may change the service too
      // (matches roles.ts ACCESS_MATRIX: manager/executive/operations have orders: "full").
      const ok = (roleRows ?? []).some((r: any) => ["manager", "operations", "executive", "support"].includes(r.role));
      if (!ok) throw new Error("Forbidden");
    }

    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id, lead_id, customer_id, service_id, fulfillment_status, application_status, form_submitted_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (appErr) throw new Error(appErr.message);
    if (!app) throw new Error("Order not found");

    const stage = String((app as any).fulfillment_status ?? "");
    if (["completed", "order_completed", "order_closed", "cancelled"].includes(stage)) {
      throw new Error("Service cannot be changed on completed or closed orders.");
    }

    const { data: newSvc, error: svcErr } = await admin
      .from("services")
      .select("id, service_code, service_name, base_amount, gst_amount, total_amount, govt_portal_url")
      .eq("id", data.newServiceId)
      .maybeSingle();
    if (svcErr) throw new Error(svcErr.message);
    if (!newSvc) throw new Error("Selected service not found");
    if (newSvc.id === app.service_id) throw new Error("This is already the selected service.");

    // Compute total paid so far (successful payments only).
    const { data: paidRows } = await admin
      .from("payments")
      .select("amount, status")
      .eq("lead_id", app.lead_id)
      .eq("status", "paid");
    const paidSum = (paidRows ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    const newTotal = Number(newSvc.total_amount) || 0;
    const delta = Math.round((newTotal - paidSum) * 100) / 100;

    // Snapshot old service label for the timeline.
    const { data: oldSvc } = app.service_id
      ? await admin.from("services").select("service_name").eq("id", app.service_id).maybeSingle()
      : { data: null as any };

    // Swap on lead + application (+ pricing on lead if not paid yet).
    const leadUpdate: Record<string, any> = {
      service: newSvc.service_name,
      service_id: newSvc.id,
    };
    if (paidSum <= 0) {
      leadUpdate.base_amount = newSvc.base_amount;
      leadUpdate.gst_amount = newSvc.gst_amount;
      leadUpdate.total_amount = newSvc.total_amount;
    }

    const { error: leadUpdErr } = await admin
      .from("leads")
      .update(leadUpdate as never)
      .eq("id", app.lead_id);
    if (leadUpdErr) throw new Error(leadUpdErr.message);

    const { SERVICE_CHANGE_STAGE_RESET, syncSubmissionForOrder } = await import("@/lib/crm/submission-sync.server");
    // A new service starts from scratch: the order returns to Incomplete Form.
    const { error: appUpdErr } = await admin
      .from("applications")
      .update({ service_id: newSvc.id, ...SERVICE_CHANGE_STAGE_RESET } as never)
      .eq("id", app.id);
    if (appUpdErr) throw new Error(appUpdErr.message);

    // Restart the onboarding form as a draft for the new service (common contact fields kept)
    try {
      await syncSubmissionForOrder({
        admin,
        applicationId: app.id,
        leadId: app.lead_id,
        targetServiceId: newSvc.id,
        targetServiceCode: (newSvc as any).service_code,
        resetToDraft: true,
      });
    } catch (syncErr) {
      console.warn("Failed to synchronize submission on service change:", syncErr);
    }

    // If a top-up is needed, record a supplementary payment_links row (staff
    // shares this with the customer). Actual charge amount handling for the
    // delta uses the standard lead payment page.
    let topUpLinkId: string | null = null;
    if (delta > 0.01) {
      const { data: leadRow } = await admin
        .from("leads").select("lead_code").eq("id", app.lead_id).maybeSingle();
      const leadCode = leadRow?.lead_code as string | undefined;
      if (leadCode) {
        // Supersede previous pending payment links
        await admin
          .from("payment_links" as any)
          .update({ status: "cancelled" } as never)
          .eq("lead_id", app.lead_id)
          .eq("status", "pending");

        // Mark lead as payment_pending so system knows a balance is due
        await admin
          .from("leads")
          .update({
            status: "payment_pending",
            lead_status_v2: "payment_pending",
          } as never)
          .eq("id", app.lead_id);

        const origin = process.env.APP_BASE_URL || "https://udyamadhar.in";
        const txnid = `TOPUP-${leadCode}-${Date.now().toString(36)}`.toUpperCase();
        const { data: link } = await admin
          .from("payment_links" as any)
          .insert({
            lead_id: app.lead_id,
            amount: delta,
            txnid,
            payment_url: `${origin}/payment/${encodeURIComponent(leadCode)}`,
            status: "pending",
            expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
          } as never)
          .select("id")
          .single();
        topUpLinkId = (link as any)?.id ?? null;
      }
    }

    // Timeline entry.
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      admin.from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    await admin.from("application_events").insert({
      application_id: app.id,
      lead_id: app.lead_id,
      customer_id: app.customer_id,
      event_type: "service_changed",
      old_value: (oldSvc as any)?.service_name ?? null,
      new_value: newSvc.service_name,
      note: (delta > 0.01
        ? `Service changed. Top-up of ₹${delta.toFixed(2)} required.`
        : delta < -0.01
          ? `Service changed. Customer overpaid by ₹${Math.abs(delta).toFixed(2)} (no refund per policy).`
          : `Service changed. Amount unchanged.`)
        + ` Order reset to Incomplete Form (was ${stage || "unknown"}); customer must submit the new service form.`,
      created_by: context.userId,
      staff_name: profile?.display_name || profile?.email || "Staff",
      staff_role: (roleRows?.[0] as any)?.role ?? "staff",
    } as never);

    // Send the "Service Changed" email (E012) with mode-specific content.
    // Only regenerate the invoice for downgrades (nothing to pay, existing
    // invoice can be reissued with the new service name). For upgrades the
    // final invoice is regenerated after the top-up payment webhook fires.
    let invoiceRegenerated = false;
    let emailSent = false;
    let emailError: string | null = null;
    let topUpUrl: string | null = null;

    const mode: "same" | "downgrade" | "upgrade" =
      delta > 0.01 ? "upgrade" : delta < -0.01 ? "downgrade" : "same";

    try {
      const { data: leadRow } = await admin
        .from("leads")
        .select("lead_code, name, email, mobile")
        .eq("id", app.lead_id)
        .maybeSingle();
      const { data: appRow } = await admin
        .from("applications")
        .select("application_code")
        .eq("id", app.id)
        .maybeSingle();

      if (!leadRow?.email || !leadRow.lead_code) {
        return {
          ok: true, newService: newSvc, paidSum, newTotal, delta, mode,
          topUpLinkId, topUpUrl, invoiceRegenerated, emailSent, emailError: "No customer email on file",
        };
      }

      const origin = process.env.APP_BASE_URL || "https://udyamadhar.in";
      const onboardingUrl = `${origin}/onboarding/${encodeURIComponent(leadRow.lead_code)}`;
      const paymentUrl = `${origin}/payment/${encodeURIComponent(leadRow.lead_code)}`;
      topUpUrl = mode === "upgrade" ? paymentUrl : null;

      // Attach revised invoice on downgrade / same, but ONLY if a paid payment exists.
      let attachment: any = null;
      if (mode !== "upgrade") {
        const { data: paidPayments } = await admin
          .from("payments")
          .select("id")
          .eq("lead_id", app.lead_id)
          .eq("status", "paid")
          .order("created_at", { ascending: false })
          .limit(1);
        const latestPayment = paidPayments?.[0];
        if (latestPayment?.id) {
          const { generateAndStore, loadInvoiceAttachmentByPayment } = await import("@/lib/crm/invoices.functions");
          const actorLabel = profile?.display_name || profile?.email || "staff";
          await generateAndStore(latestPayment.id, { id: context.userId, label: actorLabel });
          invoiceRegenerated = true;
          attachment = await loadInvoiceAttachmentByPayment(latestPayment.id);
        }
      }

      const fmt = (n: number) => n.toFixed(2);
      const modeMessage =
        mode === "same"
          ? "Your order has been updated to the new service. There is no change in the amount payable — you can continue with the onboarding form using the button below."
          : mode === "downgrade"
            ? `The new service costs less than what you have already paid. As per our policy, no refund is issued for the difference; the amount you have already paid is retained in full for this order. You can continue with the onboarding form using the button below.`
            : `The new service has a higher total than the amount currently paid. Please complete the balance payment using the button below so we can proceed with processing your order.`;

      const balanceRowHtml =
        mode === "upgrade"
          ? `<tr>
              <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; color:#B54708; font-weight:700; border-top:2px solid #C9A227;">Balance Due Now</td>
              <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; color:#B54708; font-weight:700; border-top:2px solid #C9A227;">&#8377;${fmt(delta)}</td>
            </tr>`
          : mode === "downgrade"
            ? `<tr>
                <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270;">Overpayment (retained, no refund)</td>
                <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600;">&#8377;${fmt(Math.abs(delta))}</td>
              </tr>`
            : "";

      const upgradeNoteHtml =
        mode === "upgrade"
          ? `<tr><td style="padding:16px 30px 0 30px;">
              <div style="background:#FFF7E6; border:1px solid #F5D08A; border-radius:6px; padding:12px 14px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; color:#7A4E00; line-height:1.6;">
                <strong>Note:</strong> The onboarding form link for the new service will be shared once the balance payment of &#8377;${fmt(delta)} is received.
              </div>
            </td></tr>`
          : "";

      const ctaLabel = mode === "upgrade" ? `Pay Balance ₹${fmt(delta)}` : "Continue to Onboarding Form";
      const ctaUrl = mode === "upgrade" ? paymentUrl : onboardingUrl;
      const ctaNote = mode === "upgrade"
        ? "Secure payment powered by our payment partner."
        : "This link is unique to your order — please do not share it.";

      const vars: Record<string, unknown> = {
        customer_name: leadRow.name ?? "",
        order_number: appRow?.application_code ?? leadRow.lead_code,
        previous_service: (oldSvc as any)?.service_name ?? "—",
        new_service: newSvc.service_name,
        amount_paid: fmt(paidSum),
        new_total: fmt(newTotal),
        balance_due: fmt(Math.max(0, delta)),
        mode_message: modeMessage,
        cta_url: ctaUrl,
        cta_label: ctaLabel,
        cta_note: ctaNote,
        balance_row_html: balanceRowHtml,
        upgrade_note_html: upgradeNoteHtml,
        support_email: "help@businesshelpservices.com",
      };

      const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
      await enqueueFromTemplateInternal("service_changed", leadRow.email, vars, {
        toName: leadRow.name ?? undefined,
        leadId: app.lead_id,
        applicationId: app.id,
        attachments: attachment ? [attachment] : undefined,
        trigger: "manual",
        requireImmediateSuccess: false,
      });
      emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      console.error("[changeOrderService] service-changed email failed", e);
    }

    return {
      ok: true,
      newService: newSvc,
      paidSum,
      newTotal,
      delta,
      mode,
      topUpLinkId,
      topUpUrl,
      invoiceRegenerated,
      emailSent,
      emailError,
    };
  });

export const resendServiceChangeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { assertCanAccessOrder } = await import("@/lib/crm/order-auth.server");
    await assertCanAccessOrder({ orderId: data.orderId, userId: context.userId, admin });

    const { data: app } = await admin
      .from("applications")
      .select("id, lead_id, customer_id, service_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!app) throw new Error("Order not found");

    const { data: lead } = await admin
      .from("leads")
      .select("lead_code, name, email, service, base_amount, gst_amount, total_amount")
      .eq("id", app.lead_id)
      .maybeSingle();
    if (!lead?.email || !lead.lead_code) throw new Error("No customer email on file");

    const { data: svc } = app.service_id
      ? await admin.from("services").select("service_name, total_amount").eq("id", app.service_id).maybeSingle()
      : { data: null as any };

    const { data: paidRows } = await admin
      .from("payments")
      .select("amount, status")
      .eq("lead_id", app.lead_id)
      .eq("status", "paid");
    const paidSum = (paidRows ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    const newTotal = Number(svc?.total_amount ?? lead.total_amount ?? 0);
    const delta = Math.round((newTotal - paidSum) * 100) / 100;
    const mode = delta > 0.01 ? "upgrade" : delta < -0.01 ? "downgrade" : "same";

    const origin = process.env.APP_BASE_URL || "https://udyamadhar.in";
    const onboardingUrl = `${origin}/onboarding/${encodeURIComponent(lead.lead_code)}`;
    const paymentUrl = `${origin}/payment/${encodeURIComponent(lead.lead_code)}`;

    const fmt = (n: number) => n.toFixed(2);
    const modeMessage =
      mode === "same"
        ? "Your order has been updated to the new service. There is no change in the amount payable — you can continue with the onboarding form using the button below."
        : mode === "downgrade"
          ? `The new service costs less than what you have already paid. As per our policy, no refund is issued for the difference; the amount you have already paid is retained in full for this order. You can continue with the onboarding form using the button below.`
          : `The new service has a higher total than the amount currently paid. Please complete the balance payment using the button below so we can proceed with processing your order.`;

    const balanceRowHtml =
      mode === "upgrade"
        ? `<tr>
            <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; color:#B54708; font-weight:700; border-top:2px solid #C9A227;">Balance Due Now</td>
            <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; color:#B54708; font-weight:700; border-top:2px solid #C9A227;">&#8377;${fmt(delta)}</td>
          </tr>`
        : mode === "downgrade"
          ? `<tr>
              <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270;">Overpayment (retained, no refund)</td>
              <td style="padding:10px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600;">&#8377;${fmt(Math.abs(delta))}</td>
            </tr>`
          : "";

    const upgradeNoteHtml =
      mode === "upgrade"
        ? `<tr><td style="padding:16px 30px 0 30px;">
            <div style="background:#FFF7E6; border:1px solid #F5D08A; border-radius:6px; padding:12px 14px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; color:#7A4E00; line-height:1.6;">
              <strong>Note:</strong> The onboarding form link for the new service will be shared once the balance payment of &#8377;${fmt(delta)} is received.
            </div>
          </td></tr>`
        : "";

    const ctaLabel = mode === "upgrade" ? `Pay Balance ₹${fmt(delta)}` : "Continue to Onboarding Form";
    const ctaUrl = mode === "upgrade" ? paymentUrl : onboardingUrl;
    const ctaNote = mode === "upgrade"
      ? "Secure payment powered by our payment partner."
      : "This link is unique to your order — please do not share it.";

    const vars: Record<string, unknown> = {
      customer_name: lead.name ?? "",
      order_number: lead.lead_code,
      previous_service: "—",
      new_service: svc?.service_name ?? lead.service,
      amount_paid: fmt(paidSum),
      new_total: fmt(newTotal),
      balance_due: fmt(Math.max(0, delta)),
      mode_message: modeMessage,
      cta_url: ctaUrl,
      cta_label: ctaLabel,
      cta_note: ctaNote,
      balance_row_html: balanceRowHtml,
      upgrade_note_html: upgradeNoteHtml,
      support_email: "help@businesshelpservices.com",
    };

    const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
    await enqueueFromTemplateInternal("service_changed", lead.email, vars, {
      toName: lead.name ?? undefined,
      leadId: app.lead_id,
      applicationId: app.id,
      trigger: "manual",
      requireImmediateSuccess: false,
    });

    return { ok: true, recipient: lead.email };
  });
