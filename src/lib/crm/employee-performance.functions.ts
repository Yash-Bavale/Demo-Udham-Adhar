import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeOrderStage } from "./computeOrderStage";
import { getEmployeePresenceState } from "./employee-presence.functions";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function getAdminAny(): Promise<any> {
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

export type DatePeriodFilter =
  | "today"
  | "yesterday"
  | "7d"
  | "15d"
  | "30d"
  | "this_month"
  | "custom";

export function formatTimeIST(val: string | Date | null | undefined): string {
  if (!val) return "—";
  try {
    const d = typeof val === "string" ? new Date(val) : val;
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

export function formatTimeISTShort(val: string | Date | null | undefined): string {
  if (!val) return "—";
  try {
    const d = typeof val === "string" ? new Date(val) : val;
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

export function resolveDateRange(
  filter: DatePeriodFilter,
  customStart?: string,
  customEnd?: string,
) {
  const getIstTodayString = (date: Date) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date); // YYYY-MM-DD
  };

  const now = new Date();
  const todayIstStr = getIstTodayString(now);

  const getDayBounds = (dateStr: string) => {
    const start = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
    const end = new Date(`${dateStr}T23:59:59.999+05:30`).toISOString();
    return { start, end };
  };

  let currentBounds = getDayBounds(todayIstStr);
  const yestDate = new Date(now.getTime() - 86_400_000);
  const yestIstStr = getIstTodayString(yestDate);
  let prevBounds = getDayBounds(yestIstStr);

  if (filter === "today") {
    currentBounds = getDayBounds(todayIstStr);
    prevBounds = getDayBounds(yestIstStr);
  } else if (filter === "yesterday") {
    currentBounds = getDayBounds(yestIstStr);
    const dayBefore = new Date(now.getTime() - 2 * 86_400_000);
    prevBounds = getDayBounds(getIstTodayString(dayBefore));
  } else if (filter === "7d") {
    const start7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const end = now.toISOString();
    const startPrev = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    currentBounds = { start: start7, end };
    prevBounds = { start: startPrev, end: start7 };
  } else if (filter === "15d") {
    const start15 = new Date(now.getTime() - 15 * 86_400_000).toISOString();
    const end = now.toISOString();
    const startPrev = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    currentBounds = { start: start15, end };
    prevBounds = { start: startPrev, end: start15 };
  } else if (filter === "30d") {
    const start30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const end = now.toISOString();
    const startPrev = new Date(now.getTime() - 60 * 86_400_000).toISOString();
    currentBounds = { start: start30, end };
    prevBounds = { start: startPrev, end: start30 };
  } else if (filter === "this_month") {
    const monthStartStr = `${todayIstStr.slice(0, 8)}01`;
    currentBounds = {
      start: new Date(`${monthStartStr}T00:00:00+05:30`).toISOString(),
      end: now.toISOString(),
    };
    prevBounds = {
      start: new Date(new Date(currentBounds.start).getTime() - 30 * 86_400_000).toISOString(),
      end: currentBounds.start,
    };
  } else if (filter === "custom" && customStart && customEnd) {
    const s = customStart.includes("T") ? new Date(customStart).toISOString() : new Date(`${customStart}T00:00:00+05:30`).toISOString();
    const e = customEnd.includes("T") ? new Date(customEnd).toISOString() : new Date(`${customEnd}T23:59:59.999+05:30`).toISOString();
    const dur = new Date(e).getTime() - new Date(s).getTime();
    currentBounds = { start: s, end: e };
    prevBounds = { start: new Date(new Date(s).getTime() - dur).toISOString(), end: s };
  }

  return {
    current: currentBounds,
    previous: prevBounds,
  };
}

const isUuid = (val?: string | null): boolean => {
  if (!val) return false;
  const t = val.trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(t) ||
    /^[0-9a-f]{16,}$/i.test(t)
  );
};

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  order_received: "Incomplete Form",
  awaiting_customer_form: "Awaiting Form",
  waiting_for_customer_submission: "Customer Form Pending",
  form_submitted: "Form Submitted",
  form_not_submitted: "Form Not Submitted Delay",
  technical_delay: "Technical Delay Marked",
  customer_delay: "Customer Delay Marked",
  government_processing: "Govt Processing Started",
  consultation_completed: "Consultation Completed",
  consultation_pending: "Consultation Pending",
  application_approved: "Application Approved",
  application_rejected: "Application Rejected",
  order_completed: "Order Completed",
  order_closed: "Order Closed",
  verification_pending: "Fulfillment Verification",
  documents_received: "Documents Received",
  under_processing: "Processing Started",
  under_review: "Under Review",
  in_progress: "In Progress",
  submitted_to_govt: "Submitted to Govt Portal",
  certificate_ready: "Certificate Ready",
  certificate_issued: "Certificate Issued",
  completed: "Order Completed",
  closed: "Order Closed",
  cancelled: "Order Cancelled",
  payment_pending: "Payment Pending",
  payment_done: "Incomplete Form",
  order_reopened: "Order Reopened",
  new_lead: "New Lead",
  send_form_link: "Form Link Resent",
  manual_reminder: "Manual Reminder Sent",
  start_processing: "Processing Started",
  our_delay: "Technical Delay Marked",
  close_manual: "Order Closed",
  customer_hold: "Customer Delay Marked",
  our_side_delay: "Technical Delay Marked",
  technical_hold_external: "External Tech Delay",
  technical_hold_internal: "Internal Tech Delay",
};

export function formatIdleDuration(ms: number): string {
  if (ms <= 0 || isNaN(ms)) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) {
    const remMins = minutes % 60;
    return `${hours}h ${remMins}m`;
  }
  if (minutes > 0) {
    const remSecs = seconds % 60;
    return remSecs > 0 ? `${minutes}m ${remSecs}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

export interface ActionIntervalItem {
  id: string;
  orderId: string | null;
  orderCode: string;
  employeeId: string;
  employeeName: string;
  previousAction: string;
  previousActionTime: string;
  nextAction: string;
  nextActionTime: string;
  idleDurationMs: number;
  idleDurationFormatted: string;
}

export interface ActionResponseMetrics {
  totalActions: number;
  trackedIntervals: number;
  avgIdleMs: number;
  avgIdleFormatted: string;
  medianIdleMs: number;
  medianIdleFormatted: string;
  longestIdleMs: number;
  longestIdleFormatted: string;
  latestActionAt: string | null;
  latestActionLabel: string | null;
  latestActionOrderCode: string | null;
}

export function cleanStageOrStatus(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (isUuid(trimmed)) return "";
  const lower = trimmed.toLowerCase();
  if (STAGE_DISPLAY_NAMES[lower]) return STAGE_DISPLAY_NAMES[lower];
  const withoutMoved = lower.replace(/^moved to\s+/i, "");
  if (STAGE_DISPLAY_NAMES[withoutMoved]) return STAGE_DISPLAY_NAMES[withoutMoved];
  if (isUuid(withoutMoved)) return "";
  return withoutMoved
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatLogAction(log: {
  action_type?: string;
  previous_status?: string | null;
  new_status?: string | null;
  previous_stage?: string | null;
  new_stage?: string | null;
  notes?: string | null;
  activity_description?: string | null;
  event_type?: string | null;
  old_value?: string | null;
  new_value?: string | null;
}): { actionLabel: string; details: string | null } {
  const sanitizeText = (txt?: string | null): string | null => {
    if (!txt) return null;
    let s = txt.trim();
    if (isUuid(s)) return null;
    s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");
    s = s.replace(/^moved to\s*$/i, "").trim();
    return s.length > 0 ? s : null;
  };

  const notesText = sanitizeText(log.notes);
  const actDesc = sanitizeText(log.activity_description);

  if (actDesc && !/^moved to/i.test(actDesc)) {
    return {
      actionLabel: actDesc,
      details: notesText && notesText !== actDesc ? notesText : null,
    };
  }

  const rawType = (log.action_type || log.event_type || "").toUpperCase();

  const ACTION_TYPE_LABELS: Record<string, string> = {
    ORDER_COMPLETED: "Order Completed",
    APPLICATION_COMPLETED: "Order Completed",
    ORDER_CLOSED: "Order Closed",
    SYSTEM_CLOSE: "System Closed Order",
    ORDER_REOPENED: "Order Reopened",
    CUSTOMER_CONTACTED: "Customer Contacted",
    CUSTOMER_DELAY_ADDED: "Customer Delay Added",
    CUSTOMER_DELAY: "Customer Delay Added",
    TECHNICAL_DELAY_ADDED: "Technical Delay Added",
    TECHNICAL_DELAY: "Technical Delay Added",
    CUSTOMER_DELAY_RESUMED: "Customer Delay Resumed",
    TECHNICAL_DELAY_RESUMED: "Technical Delay Resumed",
    CALLBACK_SCHEDULED: "Callback Scheduled",
    CALLBACK_COMPLETED: "Callback Completed",
    FORM_REVIEWED: "Form Reviewed & Verified",
    FORM_REQUESTED: "Form Link Resent",
    FORM_SUBMITTED: "Form Submitted",
    DOCUMENT_REVIEWED: "Document Reviewed",
    DOCUMENT_REQUESTED: "Documents Requested",
    DOCUMENTS_RECEIVED: "Documents Received",
    PAYMENT_VERIFIED: "Payment Verified",
    PROCESSING_STARTED: "Submitted to Govt Portal",
    PROCESSING_UPDATED: "Govt Processing Updated",
    CERTIFICATE_GENERATED: "Certificate Issued",
    CERTIFICATE_DELIVERED: "Certificate Delivered",
    TICKET_REPLIED: "Ticket Replied",
    TICKET_CREATED: "Ticket Created",
    HOT_ORDER_ADDED: "Marked High Priority (Hot)",
    HOT_ORDER_REMOVED: "Hot Order Removed",
    ORDER_ASSIGNED: "Order Assigned",
    ORDER_REASSIGNED: "Order Reassigned",
    STAFF_ASSIGNED: "Staff Assigned",
    NOTE_ADDED: "Internal Note Added",
    INTERNAL_NOTE_ADDED: "Internal Note Added",
    STAGE_CHANGED: "Stage Updated",
    STATUS_CHANGED: "Status Updated",
  };

  const prevRaw = (log.previous_status || log.old_value || log.previous_stage || "").trim();
  const nextRaw = (log.new_status || log.new_value || log.new_stage || "").trim();

  const prevClean = cleanStageOrStatus(prevRaw);
  const nextClean = cleanStageOrStatus(nextRaw);

  if (prevClean && nextClean && prevClean.toLowerCase() !== nextClean.toLowerCase()) {
    return {
      actionLabel: `${prevClean} → ${nextClean}`,
      details: notesText,
    };
  }

  if (nextClean) {
    return {
      actionLabel: nextClean,
      details: notesText,
    };
  }

  if (rawType && ACTION_TYPE_LABELS[rawType]) {
    return {
      actionLabel: ACTION_TYPE_LABELS[rawType],
      details: notesText,
    };
  }

  if (notesText && notesText.length > 3 && notesText.length < 80 && !notesText.toLowerCase().includes("moved to")) {
    return {
      actionLabel: notesText,
      details: null,
    };
  }

  const fallback = rawType && rawType !== "STAGE_CHANGED"
    ? rawType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : "Fulfillment Verification";

  return {
    actionLabel: fallback,
    details: notesText,
  };
}

/**
 * Resolves an employee's authentic display name from profile, full_name, display_name, or email.
 * Never falls back to generic "Staff".
 */
export function resolveEmployeeName(p?: any, rawFallback?: string | null): string {
  const fullName = p?.full_name?.trim();
  if (fullName) return fullName;
  const displayName = p?.display_name?.trim();
  if (displayName) return displayName;
  const emailPrefix = p?.email?.split("@")[0]?.trim();
  if (emailPrefix) return emailPrefix;
  if (rawFallback && rawFallback.trim() && rawFallback !== "Staff" && rawFallback !== "00000000-0000-0000-0000-000000000000") {
    return rawFallback.trim();
  }
  if (p?.id) {
    console.warn(`[EmployeePerformance] Unresolved employee identity for profile: ${p.id}`);
  }
  return "Unknown Employee";
}

/**
 * Builds authentic session telemetry segments from public.employee_sessions records.
 * Starts strictly from the employee's authentic login / session initialization timestamp.
 * Preserves multi-session gaps (logged off) and extends live active sessions to current time.
 */
export function buildDynamicTelemetrySegments(
  sessions: any[] = [],
  actions: any[] = [],
) {
  const segments: Array<{
    id: string;
    label: string;
    durationMins: number;
    startTime: string;
    endTime: string;
    type: "active" | "idle" | "away" | "offline";
    percent: number;
    color: string;
  }> = [];

  const sortedSessions = [...(sessions ?? [])]
    .filter((s) => s.started_at)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  if (sortedSessions.length > 0) {
    let lastSessionEnd: Date | null = null;

    sortedSessions.forEach((sess, sIdx) => {
      const sessStart = new Date(sess.started_at);
      const isLiveActive = sess.is_active || sess.status === "active";
      const sessEnd = sess.ended_at
        ? new Date(sess.ended_at)
        : (isLiveActive ? new Date() : (sess.last_heartbeat_at ? new Date(sess.last_heartbeat_at) : sessStart));

      // 1. If gap between sessions >= 5 mins, add logged-off gap
      if (lastSessionEnd && sessStart.getTime() - lastSessionEnd.getTime() >= 5 * 60 * 1000) {
        const gapMins = Math.round((sessStart.getTime() - lastSessionEnd.getTime()) / 60000);
        segments.push({
          id: `seg_gap_${sIdx}`,
          label: `${gapMins}m LOGGED OFF`,
          durationMins: gapMins,
          startTime: formatTimeISTShort(lastSessionEnd),
          endTime: formatTimeISTShort(sessStart),
          type: "offline",
          percent: 0,
          color: "#94a3b8",
        });
      }

      // 2. Build segments within this session
      const actSecs = Number(sess.active_seconds || 0);
      const idleSecs = Number(sess.idle_seconds || 0);
      const awaySecs = Number(sess.away_seconds || 0);

      const actMins = Math.round(actSecs / 60);
      const idleMins = Math.round(idleSecs / 60);
      const awayMins = Math.round(awaySecs / 60);

      // Find actions that occurred within this session window
      const sessionActions = (actions ?? [])
        .filter((a) => {
          const t = new Date(a.createdAt || a.created_at).getTime();
          return t >= sessStart.getTime() - 60000 && t <= sessEnd.getTime() + 60000;
        })
        .sort((a, b) => new Date(a.createdAt || a.created_at).getTime() - new Date(b.createdAt || b.created_at).getTime());

      if (sessionActions.length > 0) {
        let cursorTime = sessStart;
        for (let i = 0; i < sessionActions.length; i++) {
          const actTime = new Date(sessionActions[i].createdAt || sessionActions[i].created_at);

          // Gap before action
          if (actTime.getTime() - cursorTime.getTime() >= 4 * 60 * 1000) {
            const gapMins = Math.round((actTime.getTime() - cursorTime.getTime()) / 60000);
            const isAway = gapMins >= 45;
            segments.push({
              id: `seg_${sIdx}_gap_${i}`,
              label: isAway ? `${gapMins}m AWAY` : `${gapMins}m IDLE`,
              durationMins: gapMins,
              startTime: formatTimeISTShort(cursorTime),
              endTime: formatTimeISTShort(actTime),
              type: isAway ? "away" : "idle",
              percent: 0,
              color: isAway ? "#d97706" : "#f59e0b",
            });
            cursorTime = actTime;
          }

          // Active burst around the action
          const nextActTime = i < sessionActions.length - 1 ? new Date(sessionActions[i + 1].createdAt || sessionActions[i + 1].created_at).getTime() : sessEnd.getTime();
          const burstEnd = new Date(Math.min(sessEnd.getTime(), nextActTime, actTime.getTime() + 10 * 60000));
          const burstMins = Math.max(1, Math.round((burstEnd.getTime() - actTime.getTime()) / 60000));
          const isNow = isLiveActive && i === sessionActions.length - 1 && burstEnd.getTime() >= sessEnd.getTime() - 60000;

          segments.push({
            id: `seg_${sIdx}_act_${i}`,
            label: isNow ? `${burstMins}m ACTIVE (NOW)` : `${burstMins}m ACTIVE`,
            durationMins: burstMins,
            startTime: formatTimeISTShort(actTime),
            endTime: isNow ? "Now" : formatTimeISTShort(burstEnd),
            type: "active",
            percent: 0,
            color: "#059669",
          });

          cursorTime = burstEnd;
        }

        // Remaining time until sessEnd
        if (sessEnd.getTime() - cursorTime.getTime() >= 3 * 60 * 1000) {
          const remMins = Math.round((sessEnd.getTime() - cursorTime.getTime()) / 60000);
          const isCurrentActive = isLiveActive;
          segments.push({
            id: `seg_${sIdx}_rem`,
            label: isCurrentActive ? `${remMins}m ACTIVE (NOW)` : `${remMins}m IDLE`,
            durationMins: remMins,
            startTime: formatTimeISTShort(cursorTime),
            endTime: isCurrentActive ? "Now" : formatTimeISTShort(sessEnd),
            type: isCurrentActive ? "active" : "idle",
            percent: 0,
            color: isCurrentActive ? "#059669" : "#f59e0b",
          });
        }
      } else {
        // No discrete actions in this session: break down by recorded active / idle / away
        let cursorTime = sessStart;
        if (actMins > 0) {
          const segEnd = new Date(cursorTime.getTime() + actMins * 60000);
          segments.push({
            id: `seg_${sIdx}_act`,
            label: `${actMins}m ACTIVE`,
            durationMins: actMins,
            startTime: formatTimeISTShort(cursorTime),
            endTime: formatTimeISTShort(segEnd),
            type: "active",
            percent: 0,
            color: "#059669",
          });
          cursorTime = segEnd;
        }
        if (idleMins > 0) {
          const segEnd = new Date(cursorTime.getTime() + idleMins * 60000);
          segments.push({
            id: `seg_${sIdx}_idle`,
            label: `${idleMins}m IDLE`,
            durationMins: idleMins,
            startTime: formatTimeISTShort(cursorTime),
            endTime: formatTimeISTShort(segEnd),
            type: "idle",
            percent: 0,
            color: "#f59e0b",
          });
          cursorTime = segEnd;
        }
        if (awayMins > 0) {
          const segEnd = new Date(cursorTime.getTime() + awayMins * 60000);
          segments.push({
            id: `seg_${sIdx}_away`,
            label: `${awayMins}m AWAY`,
            durationMins: awayMins,
            startTime: formatTimeISTShort(cursorTime),
            endTime: formatTimeISTShort(segEnd),
            type: "away",
            percent: 0,
            color: "#d97706",
          });
          cursorTime = segEnd;
        }

        if (actMins === 0 && idleMins === 0 && awayMins === 0) {
          const durMins = Math.max(1, Math.round((sessEnd.getTime() - sessStart.getTime()) / 60000));
          const sType = isLiveActive ? "active" : sess.status === "away" ? "away" : sess.status === "idle" ? "idle" : "active";
          segments.push({
            id: `seg_${sIdx}_simple`,
            label: isLiveActive ? `${durMins}m ACTIVE (NOW)` : `${durMins}m ${sType.toUpperCase()}`,
            durationMins: durMins,
            startTime: formatTimeISTShort(sessStart),
            endTime: isLiveActive ? "Now" : formatTimeISTShort(sessEnd),
            type: sType as any,
            percent: 0,
            color: sType === "active" ? "#059669" : sType === "away" ? "#d97706" : "#f59e0b",
          });
        }
      }

      lastSessionEnd = sessEnd;
    });
  } else if (Array.isArray(actions) && actions.length > 0) {
    // If no dbSessions, start from the FIRST action's timestamp
    const sortedActions = [...actions].sort(
      (a, b) => new Date(a.createdAt || a.created_at).getTime() - new Date(b.createdAt || b.created_at).getTime(),
    );

    for (let i = 0; i < sortedActions.length; i++) {
      const act = sortedActions[i];
      const actTime = new Date(act.createdAt || act.created_at);

      segments.push({
        id: `seg_act_${i}`,
        label: `ACTIVE`,
        durationMins: 8,
        startTime: formatTimeISTShort(actTime),
        endTime: formatTimeISTShort(new Date(actTime.getTime() + 8 * 60000)),
        type: "active",
        percent: 0,
        color: "#059669",
      });

      if (i < sortedActions.length - 1) {
        const nextAct = sortedActions[i + 1];
        const nextTime = new Date(nextAct.createdAt || nextAct.created_at);
        const gapMins = Math.max(1, Math.round((nextTime.getTime() - (actTime.getTime() + 8 * 60000)) / 60000));

        if (gapMins > 0) {
          const isAway = gapMins >= 60;
          segments.push({
            id: `seg_gap_${i}`,
            label: isAway ? `${gapMins}m AWAY` : `${gapMins}m IDLE`,
            durationMins: gapMins,
            startTime: formatTimeISTShort(new Date(actTime.getTime() + 8 * 60000)),
            endTime: formatTimeISTShort(nextTime),
            type: isAway ? "away" : "idle",
            percent: 0,
            color: isAway ? "#d97706" : "#f59e0b",
          });
        }
      }
    }
  }

  if (segments.length === 0) {
    return [];
  }

  const totalMins = segments.reduce((acc, s) => acc + s.durationMins, 0) || 1;
  segments.forEach((s) => {
    s.percent = Math.max(4, Math.round((s.durationMins / totalMins) * 100));
  });

  return segments;
}

export function buildOrderActionChronology(
  qualifyingActions: any[],
  orderCodeMap: Map<string, string>,
) {
  if (!qualifyingActions || qualifyingActions.length === 0) {
    return [];
  }

  const chronological = [...qualifyingActions].sort(
    (a, b) => new Date(a.createdAt || a.created_at).getTime() - new Date(b.createdAt || b.created_at).getTime(),
  );

  return chronological.map((act) => {
    const { actionLabel, details } = formatLogAction({
      action_type: act.actionType,
      previous_status: act.previousStatus,
      new_status: act.newStatus,
      notes: act.notes,
    });
    const orderCode = act.orderId ? (orderCodeMap.get(act.orderId) || act.orderId.slice(0, 8)) : "—";

    return {
      id: act.id,
      timestamp: formatTimeIST(act.createdAt || act.created_at),
      timeIST: formatTimeIST(act.createdAt || act.created_at),
      timeShort: formatTimeISTShort(act.createdAt || act.created_at),
      actionType: act.actionType,
      actionTitle: actionLabel,
      orderId: act.orderId || null,
      orderCode,
      employeeName: act.employeeName,
      employeeRole: act.employeeRole,
      notes: details || act.notes || null,
    };
  });
}

export function buildDynamicStepperEvents(logs: any[], firstActionIso: string | null, empName: string) {
  if (!logs || logs.length === 0) {
    return [];
  }

  const chronological = [...logs].sort((a, b) => new Date(a.created_at || a.createdAt).getTime() - new Date(b.created_at || b.createdAt).getTime());
  const steps: Array<{
    time: string;
    title: string;
    desc: string;
    type: "login" | "active" | "idle" | "away" | "action" | "offline";
    orderCode?: string | null;
    orderId?: string | null;
    actionType?: string | null;
  }> = [];

  for (let i = 0; i < chronological.length; i++) {
    const l = chronological[i];
    const { actionLabel, details } = formatLogAction(l);
    const code = l.order_code || l.orderCode || (l.order_id || l.orderId ? (l.order_id || l.orderId).slice(0, 8) : null);
    const aType = l.action_type || l.actionType || "ACTION";
    steps.push({
      time: formatTimeIST(l.created_at || l.createdAt),
      title: actionLabel,
      desc: details || l.notes || (code ? `Order #${code} processed` : "CRM record processed"),
      type: "action",
      orderCode: code,
      orderId: l.order_id || l.orderId || null,
      actionType: aType,
    });
  }

  return steps;
}

function computeTrend(
  current: number,
  previous: number,
): { percent: number; isUp: boolean } {
  if (previous === 0) {
    return { percent: current > 0 ? 100 : 0, isUp: current > 0 };
  }
  const diff = current - previous;
  const percent = Math.round((Math.abs(diff) / previous) * 100 * 10) / 10;
  return { percent, isUp: diff >= 0 };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  CANONICAL OPERATIONAL EVENT NORMALIZER (NO DOUBLE COUNTING)               */
/* ────────────────────────────────────────────────────────────────────────── */

interface NormalizedOperationalEvent {
  id: string;
  orderId?: string | null;
  leadId?: string | null;
  employeeId: string | null;
  employeeName: string;
  employeeRole: string;
  actionType: string;
  actionCategory:
    | "assignment"
    | "customer_delay"
    | "technical_delay"
    | "hot_order"
    | "callback"
    | "form"
    | "document"
    | "completion"
    | "closure"
    | "system_closure"
    | "reopen"
    | "status_change"
    | "note";
  previousStatus?: string | null;
  newStatus?: string | null;
  notes?: string | null;
  createdAt: string; // ISO
  isSystemAction: boolean;
}

/**
 * True only for verified human operational work. Assignment custody changes
 * (manual, auto, pool, reassignment) and system/automation events are never
 * shown in an employee's action lists.
 */
function isEmployeeActionEvent(e: NormalizedOperationalEvent): boolean {
  if (e.isSystemAction) return false;
  if (e.actionCategory === "assignment" || e.actionCategory === "system_closure") return false;
  const at = String(e.actionType || "").toUpperCase();
  return at !== "ORDER_ASSIGNED" && at !== "ORDER_REASSIGNED";
}


/**
 * Normalizes raw application_events, order_schedulers, and activity_logs
 * into a single deduplicated stream of authentic operational events.
 * Strictly separates HUMAN actions from SYSTEM automations (ORDER_ASSIGNED, crons, auto-reassignments).
 */
function normalizeOperationalEvents(params: {
  appEvents: any[];
  schedulers: any[];
  activityLogs: any[];
  actionLogs?: any[];
  profileMap: Map<string, any>;
  userRoleMap: Map<string, string>;
  resolveStaffUserId: (raw?: string | null) => string | null;
}): NormalizedOperationalEvent[] {
  const { appEvents, schedulers, activityLogs, actionLogs, profileMap, userRoleMap, resolveStaffUserId } = params;
  const results: NormalizedOperationalEvent[] = [];
  const seenDelayKeys = new Set<string>(); // `${orderId}_${category}_${rounded10MinBucket}`

  // 1. Process order_schedulers (The canonical record for delay and reminder timers)
  schedulers.forEach((s: any) => {
    const rawCreator = s.created_by;
    const resolvedEmpId = resolveStaffUserId(rawCreator);
    const p = resolvedEmpId ? profileMap.get(resolvedEmpId) : null;
    const empName = resolveEmployeeName(p);
    const role = (resolvedEmpId && userRoleMap.get(resolvedEmpId)) || "operations";
    const eventTime = s.started_at || s.created_at;
    if (!eventTime) return;

    let actionCategory: NormalizedOperationalEvent["actionCategory"] = "status_change";
    let actionType = "STATUS_CHANGED";
    let notes = typeof s.remarks === "object" && s.remarks ? (s.remarks.note || s.remarks.reasonLabel || s.remarks.reason) : (s.remarks || null);

    const st = String(s.scheduler_type ?? "").toLowerCase();
    if (st.includes("customer_side_delay") || st.includes("customer_delay")) {
      actionCategory = "customer_delay";
      actionType = "CUSTOMER_DELAY_ADDED";
    } else if (st.includes("ticket_hold") || st.includes("technical_delay") || st.includes("our_side_delay")) {
      actionCategory = "technical_delay";
      actionType = "TECHNICAL_DELAY_ADDED";
    } else if (st.includes("our_side_reminder") || st.includes("hot_order")) {
      actionCategory = "hot_order";
      actionType = "HOT_ORDER_ADDED";
    } else if (st.includes("callback") || st.includes("consultation")) {
      actionCategory = "callback";
      actionType = "CALLBACK_SCHEDULED";
    }

    const timeBucket = Math.floor(new Date(eventTime).getTime() / (5 * 60 * 1000));
    const dedupKey = `${s.application_id}_${actionCategory}_${timeBucket}`;
    seenDelayKeys.add(dedupKey);

    const isSystemAction =
      !resolvedEmpId ||
      resolvedEmpId === "00000000-0000-0000-0000-000000000000" ||
      st.includes("system") ||
      st.includes("cron") ||
      st.includes("auto");

    results.push({
      id: `sch_${s.id}`,
      orderId: s.application_id,
      leadId: null,
      employeeId: resolvedEmpId,
      employeeName: empName,
      employeeRole: role,
      actionType,
      actionCategory,
      previousStatus: null,
      newStatus: actionCategory === "customer_delay" ? "CUSTOMER_HOLD" : actionCategory === "technical_delay" ? "TECHNICAL_HOLD" : null,
      notes,
      createdAt: eventTime,
      isSystemAction,
    });
  });

  // 2. Process order_action_logs (Direct immutable operational action audit logs)
  if (Array.isArray(actionLogs)) {
    actionLogs.forEach((l: any) => {
      const rawCreator = l.employee_id || l.employee_name;
      const resolvedEmpId = resolveStaffUserId(rawCreator);
      const p = resolvedEmpId ? profileMap.get(resolvedEmpId) : null;
      const empName = resolveEmployeeName(p, l.employee_name);
      const role = l.employee_role || (resolvedEmpId && userRoleMap.get(resolvedEmpId)) || "operations";
      const eventTime = l.created_at || l.timestamp;
      if (!eventTime) return;

      const at = String(l.action_type || "").toUpperCase();
      if (at === "ORDER_ASSIGNED" || at === "ORDER_REASSIGNED") return;

      let actionCategory: NormalizedOperationalEvent["actionCategory"] = "status_change";
      if (at.includes("CUSTOMER_DELAY")) actionCategory = "customer_delay";
      else if (at.includes("TECHNICAL_DELAY") || at.includes("OUR_SIDE_DELAY")) actionCategory = "technical_delay";
      else if (at.includes("CALLBACK") || at.includes("CALL_")) actionCategory = "callback";
      else if (at.includes("COMPLET") || at.includes("CERTIFICATE")) actionCategory = "completion";
      else if (at.includes("CLOSE")) actionCategory = "closure";
      else if (at.includes("FORM")) actionCategory = "form";
      else if (at.includes("DOCUMENT")) actionCategory = "document";

      const timeBucket = Math.floor(new Date(eventTime).getTime() / (2 * 60 * 1000));
      const dedupKey = `${l.order_id}_${at}_${timeBucket}`;
      if (seenDelayKeys.has(dedupKey)) return;
      seenDelayKeys.add(dedupKey);

      const isSystemAction = l.source === "system" || l.source === "customer" || !empName || empName.toLowerCase() === "system";

      results.push({
        id: `oal_${l.id}`,
        orderId: l.order_id,
        leadId: l.lead_id,
        employeeId: resolvedEmpId,
        employeeName: empName,
        employeeRole: role,
        actionType: at,
        actionCategory,
        previousStatus: l.previous_status,
        newStatus: l.new_status,
        notes: l.notes,
        createdAt: eventTime,
        isSystemAction,
      });
    });
  }

  // 3. Process application_events (Audit trail for state changes, assignments, completions, closures)
  appEvents.forEach((evt: any) => {
    const rawCreator = evt.created_by || evt.staff_name;
    const resolvedEmpId = resolveStaffUserId(rawCreator);
    const p = resolvedEmpId ? profileMap.get(resolvedEmpId) : null;
    const empName = resolveEmployeeName(p, evt.staff_name);
    const role = evt.staff_role || (resolvedEmpId && userRoleMap.get(resolvedEmpId)) || "operations";
    const eventTime = evt.created_at;
    if (!eventTime) return;

    const et = String(evt.event_type ?? "").toLowerCase();
    const nv = String(evt.new_value ?? "").toUpperCase();
    const ov = String(evt.old_value ?? "").toUpperCase();

    let actionCategory: NormalizedOperationalEvent["actionCategory"] = "status_change";
    let actionType = "STATUS_CHANGED";

    // Strict classification: assignments and automated events are ALWAYS system actions
    let isSystemAction =
      !evt.created_by ||
      evt.created_by === "00000000-0000-0000-0000-000000000000" ||
      et === "assignment_change" ||
      et.includes("assigned") ||
      et === "system_close" ||
      et.startsWith("auto_") ||
      et.includes("cron") ||
      et.includes("scheduler") ||
      et.includes("heartbeat") ||
      et.includes("telemetry") ||
      et.includes("workload");

    if (et === "assignment_change" || et.includes("assigned")) {
      actionCategory = "assignment";
      actionType = "ORDER_ASSIGNED";
      isSystemAction = true;
    } else if (nv === "CUSTOMER_HOLD" || et.includes("customer_delay")) {
      actionCategory = "customer_delay";
      actionType = "CUSTOMER_DELAY_ADDED";
    } else if (nv.includes("TECHNICAL_HOLD") || nv === "OUR_SIDE_DELAY" || et.includes("technical_delay")) {
      actionCategory = "technical_delay";
      actionType = "TECHNICAL_DELAY_ADDED";
    } else if (nv === "REOPENED" || et.includes("order_reopened")) {
      actionCategory = "reopen";
      actionType = "ORDER_REOPENED";
    } else if (nv === "COMPLETED" || et === "order_completed" || et.includes("completed")) {
      actionCategory = "completion";
      actionType = "ORDER_COMPLETED";
    } else if (et === "system_close") {
      actionCategory = "system_closure";
      actionType = "SYSTEM_CLOSE";
      isSystemAction = true;
    } else if (nv === "CLOSED" || et === "order_closed" || et.includes("closed") || et.includes("cancelled")) {
      actionCategory = "closure";
      actionType = "ORDER_CLOSED";
    } else if (et.includes("callback_scheduled")) {
      actionCategory = "callback";
      actionType = "CALLBACK_SCHEDULED";
    } else if (et.includes("callback_completed") || et.includes("contact_logged")) {
      actionCategory = "callback";
      actionType = "CUSTOMER_CONTACTED";
    } else if (et.includes("form_submitted")) {
      actionCategory = "form";
      actionType = "FORM_SUBMITTED";
    } else if (et.includes("certificate_uploaded") || et.includes("certificate_issued")) {
      actionCategory = "document";
      actionType = "CERTIFICATE_GENERATED";
    }

    // Check if this action was already logged via order_schedulers within a 5-minute bucket
    const timeBucket = Math.floor(new Date(eventTime).getTime() / (5 * 60 * 1000));
    const dedupKey = `${evt.application_id}_${actionCategory}_${timeBucket}`;
    if (
      (actionCategory === "customer_delay" || actionCategory === "technical_delay" || actionCategory === "callback") &&
      seenDelayKeys.has(dedupKey)
    ) {
      // Already canonically recorded via order_schedulers — do NOT double count!
      return;
    }
    seenDelayKeys.add(dedupKey);

    results.push({
      id: `ae_${evt.id}`,
      orderId: evt.application_id,
      leadId: evt.lead_id,
      employeeId: resolvedEmpId,
      employeeName: empName,
      employeeRole: role,
      actionType,
      actionCategory,
      previousStatus: evt.old_value,
      newStatus: evt.new_value,
      notes: evt.note,
      createdAt: eventTime,
      isSystemAction,
    });
  });

  // 4. Process activity_logs (Only notes / genuine manual actions not already logged)
  activityLogs.forEach((act: any) => {
    const rawCreator = act.user_id;
    const resolvedEmpId = resolveStaffUserId(rawCreator);
    const p = resolvedEmpId ? profileMap.get(resolvedEmpId) : null;
    const empName = resolveEmployeeName(p);
    const role = (resolvedEmpId && userRoleMap.get(resolvedEmpId)) || "operations";
    const eventTime = act.created_at;
    if (!eventTime) return;

    const at = String(act.activity_type ?? "").toLowerCase();
    let actionCategory: NormalizedOperationalEvent["actionCategory"] = "note";
    let actionType = "NOTE_ADDED";
    let isSystemAction = !resolvedEmpId || resolvedEmpId === "00000000-0000-0000-0000-000000000000" || at.includes("system") || at.includes("auto") || at.includes("cron");

    if (at.includes("call") || at.includes("contact")) {
      actionCategory = "callback";
      actionType = "CUSTOMER_CONTACTED";
    } else if (at.includes("document") || at.includes("doc")) {
      actionCategory = "document";
      actionType = "DOCUMENT_REVIEWED";
    }

    const timeBucket = Math.floor(new Date(eventTime).getTime() / (5 * 60 * 1000));
    const dedupKey = `${act.application_id || act.lead_id}_${actionCategory}_${timeBucket}`;
    if (seenDelayKeys.has(dedupKey)) {
      return;
    }
    seenDelayKeys.add(dedupKey);

    results.push({
      id: `act_${act.id}`,
      orderId: act.application_id,
      leadId: act.lead_id,
      employeeId: resolvedEmpId,
      employeeName: empName,
      employeeRole: role,
      actionType,
      actionCategory,
      notes: act.activity_description,
      createdAt: eventTime,
      isSystemAction,
    });
  });

  // Sort descending by event timestamp
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return results;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  1. SUPER ADMIN / ADMIN COMMAND CENTER METRICS                             */
/* ────────────────────────────────────────────────────────────────────────── */

export const getEmployeePerformanceCommandCenter = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        dateFilter: z
          .enum([
            "today",
            "yesterday",
            "7d",
            "15d",
            "30d",
            "this_month",
            "custom",
          ])
          .default("today"),
        customStart: z.string().optional(),
        customEnd: z.string().optional(),
        employeeId: z.string().optional().nullable(),
        serviceId: z.string().optional().nullable(),
        stage: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await verifyAdminOrSuperAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    const adminAny = await getAdminAny();
    const dateRange = resolveDateRange(
      data.dateFilter,
      data.customStart,
      data.customEnd,
    );

    // 1. Staff Profiles & Roles (Source of Truth Directory)
    const [
      { data: profiles },
      { data: staffRoles },
      { data: poolRows },
    ] = await Promise.all([
      adminAny.from("profiles").select("*"),
      admin.from("user_roles").select("user_id, role"),
      admin.from("assignment_pool").select("user_id, is_active"),
    ]);

    const userRoleMap = new Map<string, string>();
    const staffUserIds = new Set<string>();
    (staffRoles ?? []).forEach((r: any) => {
      if (r.user_id) {
        staffUserIds.add(r.user_id);
        if (
          !userRoleMap.has(r.user_id) ||
          r.role === "admin" ||
          r.role === "super_admin"
        ) {
          userRoleMap.set(r.user_id, r.role);
        }
      }
    });
    (poolRows ?? []).forEach((p: any) => {
      if (p.user_id) staffUserIds.add(p.user_id);
    });

    const profileMap = new Map<string, any>();
    const nameToUserIdMap = new Map<string, string>();

    (profiles ?? []).forEach((p: any) => {
      profileMap.set(p.id, p);
      nameToUserIdMap.set(p.id.toLowerCase().trim(), p.id);
      if (p.full_name) {
        nameToUserIdMap.set(p.full_name.toLowerCase().trim(), p.id);
        const parts = p.full_name.trim().split(/\s+/);
        if (parts[0]) nameToUserIdMap.set(parts[0].toLowerCase(), p.id);
        if (parts.length > 1) nameToUserIdMap.set(`${parts[0]} ${parts[parts.length - 1]}`.toLowerCase(), p.id);
      }
      if (p.display_name) {
        nameToUserIdMap.set(p.display_name.toLowerCase().trim(), p.id);
        const parts = p.display_name.trim().split(/\s+/);
        if (parts[0]) nameToUserIdMap.set(parts[0].toLowerCase(), p.id);
        if (parts.length > 1) nameToUserIdMap.set(`${parts[0]} ${parts[parts.length - 1]}`.toLowerCase(), p.id);
      }
      if (p.email) {
        nameToUserIdMap.set(p.email.toLowerCase().trim(), p.id);
        const userPrefix = p.email.split("@")[0].toLowerCase().trim();
        nameToUserIdMap.set(userPrefix, p.id);
      }
    });

    // Base workforce: All active registered staff profiles
    let activeStaffProfiles = (profiles ?? []).filter((p: any) => {
      if (p.is_active === false) return false;
      if (staffUserIds.size > 0) return staffUserIds.has(p.id);
      return true;
    });

    if (activeStaffProfiles.length === 0 && (profiles ?? []).length > 0) {
      activeStaffProfiles = profiles ?? [];
    }

    const resolveStaffUserId = (raw?: string | null): string | null => {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (profileMap.has(trimmed)) return trimmed;
      const lower = trimmed.toLowerCase();
      if (nameToUserIdMap.has(lower)) return nameToUserIdMap.get(lower)!;
      return null;
    };

    // 2. Fetch Source of Truth Events for the Current Period
    const [
      { data: currentAppEvents },
      { data: currentSchedulers },
      { data: currentActivityLogs },
      { data: currentActionLogs },
      { data: prevAppEvents },
      { data: prevSchedulers },
      { data: prevActivityLogs },
      { data: activeEmployeeSessions },
      { data: allPeriodSessions },
    ] = await Promise.all([
      // Current application_events
      admin
        .from("application_events")
        .select("id, application_id, lead_id, event_type, note, old_value, new_value, staff_name, staff_role, created_at, created_by")
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(10000),
      // Current order_schedulers
      adminAny
        .from("order_schedulers")
        .select("id, application_id, status, scheduler_type, started_at, fires_at, remarks, created_at, created_by")
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(5000),
      // Current activity_logs
      admin
        .from("activity_logs")
        .select("id, activity_type, activity_description, user_id, application_id, lead_id, created_at")
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(5000),
      // Current order_action_logs
      (admin
        .from("order_action_logs" as any) as any)
        .select("id, order_id, lead_id, customer_id, employee_id, employee_name, employee_role, action_type, previous_status, new_status, notes, source, created_at, time_spent_since_previous_action_ms")
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(10000),
      // Previous period events for trends
      admin
        .from("application_events")
        .select("id, application_id, lead_id, event_type, note, old_value, new_value, staff_name, created_at, created_by")
        .gte("created_at", dateRange.previous.start)
        .lte("created_at", dateRange.previous.end)
        .limit(5000),
      adminAny
        .from("order_schedulers")
        .select("id, application_id, scheduler_type, started_at, created_at, created_by")
        .gte("created_at", dateRange.previous.start)
        .lte("created_at", dateRange.previous.end)
        .limit(3000),
      admin
        .from("activity_logs")
        .select("id, activity_type, user_id, application_id, lead_id, created_at")
        .gte("created_at", dateRange.previous.start)
        .lte("created_at", dateRange.previous.end)
        .limit(3000),
      // Active employee sessions for real-time presence
      adminAny
        .from("employee_sessions")
        .select("id, employee_id, is_active, last_heartbeat_at, last_activity_at, login_at, started_at:login_at, ended_at:logout_at, status, active_seconds, idle_seconds, away_seconds, current_page, current_module, last_action_text, current_order_code")
        .order("last_heartbeat_at", { ascending: false })
        .limit(500),
      // All employee sessions in current period
      adminAny
        .from("employee_sessions")
        .select("id, employee_id, is_active, last_heartbeat_at, last_activity_at, login_at, started_at:login_at, ended_at:logout_at, status, active_seconds, idle_seconds, away_seconds, current_page, current_module, last_action_text, current_order_code")
        .gte("login_at", dateRange.current.start)
        .lte("login_at", dateRange.current.end)
        .limit(1000),
    ]);

    // Map active session by employee ID
    const activeSessionsMap = new Map<string, any>();
    (activeEmployeeSessions ?? []).forEach((sess: any) => {
      const empId = String(sess.employee_id);
      if (!activeSessionsMap.has(empId)) {
        activeSessionsMap.set(empId, sess);
      }
    });

    // Group all period sessions by employee ID
    const employeeSessionsListMap = new Map<string, any[]>();
    (allPeriodSessions ?? []).forEach((sess: any) => {
      const empId = String(sess.employee_id);
      const list = employeeSessionsListMap.get(empId) ?? [];
      list.push(sess);
      employeeSessionsListMap.set(empId, list);
    });

    // Normalize current and previous period operational actions
    const currentCanonicalEvents = normalizeOperationalEvents({
      appEvents: currentAppEvents ?? [],
      schedulers: currentSchedulers ?? [],
      activityLogs: currentActivityLogs ?? [],
      actionLogs: (currentActionLogs as any[]) ?? [],
      profileMap,
      userRoleMap,
      resolveStaffUserId,
    });

    const prevCanonicalEvents = normalizeOperationalEvents({
      appEvents: prevAppEvents ?? [],
      schedulers: prevSchedulers ?? [],
      activityLogs: prevActivityLogs ?? [],
      profileMap,
      userRoleMap,
      resolveStaffUserId,
    });

    // 3. Fetch applications assigned in period or touched by events
    const eventAppIds = Array.from(
      new Set(
        currentCanonicalEvents
          .map((e) => e.orderId)
          .filter(Boolean),
      ),
    ) as string[];

    let appsQuery = adminAny
      .from("applications")
      .select(
        "id, application_code, customer_id, lead_id, assigned_to, assigned_at, order_status, fulfillment_status, application_status, service_id, created_at, updated_at, form_submitted_at, certificate_uploaded_at, workflow_status, closure_stage, closure_reason_code, closure_reason_id, closure_remarks",
      )
      .eq("is_deleted", false);

    if (data.serviceId) {
      appsQuery = appsQuery.eq("service_id", data.serviceId);
    }
    if (data.employeeId) {
      appsQuery = appsQuery.eq("assigned_to", data.employeeId);
    }

    // Also get applications assigned in this range
    const [
      { data: appsAssignedInRange },
      { data: touchedApps },
    ] = await Promise.all([
      appsQuery
        .gte("assigned_at", dateRange.current.start)
        .lte("assigned_at", dateRange.current.end)
        .limit(5000),
      eventAppIds.length > 0
        ? adminAny
            .from("applications")
            .select(
              "id, application_code, customer_id, lead_id, assigned_to, assigned_at, order_status, fulfillment_status, application_status, service_id, created_at, updated_at, form_submitted_at, certificate_uploaded_at, workflow_status, closure_stage, closure_reason_code, closure_reason_id, closure_remarks",
            )
            .in("id", eventAppIds)
            .eq("is_deleted", false)
        : { data: [] },
    ]);

    const appsMap = new Map<string, any>();
    (appsAssignedInRange ?? []).forEach((a: any) => appsMap.set(a.id, a));
    (touchedApps ?? []).forEach((a: any) => appsMap.set(a.id, a));

    // Order Code Lookup Map
    const orderCodeMap = new Map<string, string>();
    appsMap.forEach((a) => {
      if (a.application_code) orderCodeMap.set(a.id, a.application_code);
    });

    // 4. Initialise Employee Performance Stats Registry
    const empStatsMap = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        employeeRole: string;
        avatarUrl?: string;
        assignedOrders: Set<string>;
        workedOrders: Set<string>;
        actions: number;
        completedOrders: Set<string>;
        closedOrders: Set<string>;
        closedDueToCustomerDelayOrders: Set<string>;
        closedDueToTechnicalDelayOrders: Set<string>;
        customerDelays: number;
        technicalDelays: number;
        hotOrders: Set<string>;
        slaCompliantCount: number;
        slaTotalCount: number;
        lastActionText: string;
        lastActionTime: string | null;
        lastActionType: string | null;
        lastOrderCode: string | null;
        firstActionTime: string | null;
      }
    >();

    activeStaffProfiles.forEach((p: any) => {
      const uid = p.id;
      const name = resolveEmployeeName(p);
      empStatsMap.set(uid, {
        employeeId: uid,
        employeeName: name,
        employeeRole: userRoleMap.get(uid) || "operations",
        avatarUrl: p.avatar_url,
        assignedOrders: new Set(),
        workedOrders: new Set(),
        actions: 0,
        completedOrders: new Set(),
        closedOrders: new Set(),
        closedDueToCustomerDelayOrders: new Set(),
        closedDueToTechnicalDelayOrders: new Set(),
        customerDelays: 0,
        technicalDelays: 0,
        hotOrders: new Set(),
        slaCompliantCount: 0,
        slaTotalCount: 0,
        lastActionText: "No actions yet",
        lastActionTime: null,
        lastActionType: null,
        lastOrderCode: null,
        firstActionTime: null,
      });
    });

    const activeEmployeesSet = new Set<string>();
    const workedEmployeesSet = new Set<string>();
    const uniqueOrdersWorkedSet = new Set<string>();
    const completedOrdersSet = new Set<string>();
    const closedOrdersSet = new Set<string>();
    const hotOrdersSet = new Set<string>();

    let totalAssignedInPeriod = 0;
    let totalCustomerDelayEvents = 0;
    let totalTechnicalDelayEvents = 0;
    let totalReassignedCount = 0;

    // A. Calculate Assignment Events in range
    appsMap.forEach((app: any) => {
      const isAssignedInRange =
        app.assigned_at &&
        new Date(app.assigned_at) >= new Date(dateRange.current.start) &&
        new Date(app.assigned_at) <= new Date(dateRange.current.end);

      if (isAssignedInRange && app.assigned_to) {
        const empId = resolveStaffUserId(app.assigned_to);
        if (empId && empStatsMap.has(empId)) {
          empStatsMap.get(empId)!.assignedOrders.add(app.id);
          totalAssignedInPeriod++;
        }
      }

      // Dynamic SLA evaluation for completed orders
      const isCompleted = app.fulfillment_status === "completed" || app.order_status === "COMPLETED";
      if (isCompleted && app.created_at && app.updated_at && app.assigned_to) {
        const empId = resolveStaffUserId(app.assigned_to);
        if (empId && empStatsMap.has(empId)) {
          const stats = empStatsMap.get(empId)!;
          stats.slaTotalCount++;
          const durHours = (new Date(app.updated_at).getTime() - new Date(app.created_at).getTime()) / 3_600_000;
          if (durHours <= 48) {
            stats.slaCompliantCount++;
          }
        }
      }
    });

    // Also parse assignment_change events from application_events
    (currentAppEvents ?? []).forEach((evt: any) => {
      const et = String(evt.event_type ?? "").toLowerCase();
      if (et === "assignment_change" || et.includes("assigned")) {
        totalReassignedCount++;
        const newAssignee = resolveStaffUserId(evt.new_value);
        if (newAssignee && empStatsMap.has(newAssignee) && evt.application_id) {
          empStatsMap.get(newAssignee)!.assignedOrders.add(evt.application_id);
        }
      }
    });

    // B. Aggregate Canonical Operational Events for each Employee (STRICT: Human Actions Only for Actions / Worked / Last Action)
    currentCanonicalEvents.forEach((ev) => {
      const empId = ev.employeeId;
      if (!empId) return;

      if (!empStatsMap.has(empId)) {
        const p = profileMap.get(empId);
        const name = resolveEmployeeName(p, ev.employeeName);
        empStatsMap.set(empId, {
          employeeId: empId,
          employeeName: name,
          employeeRole: userRoleMap.get(empId) || ev.employeeRole || "operations",
          avatarUrl: p?.avatar_url,
          assignedOrders: new Set(),
          workedOrders: new Set(),
          actions: 0,
          completedOrders: new Set(),
          closedOrders: new Set(),
          closedDueToCustomerDelayOrders: new Set(),
          closedDueToTechnicalDelayOrders: new Set(),
          customerDelays: 0,
          technicalDelays: 0,
          hotOrders: new Set(),
          slaCompliantCount: 0,
          slaTotalCount: 0,
          lastActionText: "No actions yet",
          lastActionTime: null,
          lastActionType: null,
          lastOrderCode: null,
          firstActionTime: null,
        });
      }

      const stats = empStatsMap.get(empId)!;

      // Human Operational Actions & Worked orders
      if (!ev.isSystemAction) {
        stats.actions += 1;
        activeEmployeesSet.add(empId);
        workedEmployeesSet.add(empId);
        if (ev.orderId) {
          stats.workedOrders.add(ev.orderId);
          uniqueOrdersWorkedSet.add(ev.orderId);
        }

        // Track Last Action & First Action Timestamps for HUMAN actions ONLY
        if (!stats.lastActionTime || new Date(ev.createdAt) > new Date(stats.lastActionTime)) {
          stats.lastActionTime = ev.createdAt;
          stats.lastActionType = ev.actionType;
          const { actionLabel } = formatLogAction({
            action_type: ev.actionType,
            previous_status: ev.previousStatus,
            new_status: ev.newStatus,
            notes: ev.notes,
          });
          stats.lastActionText = actionLabel;
          stats.lastOrderCode = ev.orderId ? (orderCodeMap.get(ev.orderId) || ev.orderId.slice(0, 8)) : null;
        }

        if (!stats.firstActionTime || new Date(ev.createdAt) < new Date(stats.firstActionTime)) {
          stats.firstActionTime = ev.createdAt;
        }
      }

      // Customer Delay
      if (ev.actionCategory === "customer_delay") {
        stats.customerDelays += 1;
        totalCustomerDelayEvents += 1;
      }

      // Technical Delay
      if (ev.actionCategory === "technical_delay") {
        stats.technicalDelays += 1;
        totalTechnicalDelayEvents += 1;
      }

      // Hot Order Action
      if (ev.actionCategory === "hot_order") {
        if (ev.orderId) {
          stats.hotOrders.add(ev.orderId);
          hotOrdersSet.add(ev.orderId);
        }
      }

      // Completed
      if (ev.actionCategory === "completion" && ev.orderId) {
        stats.completedOrders.add(ev.orderId);
        completedOrdersSet.add(ev.orderId);
      }

      // Closed
      if (ev.actionCategory === "closure" && ev.orderId && !ev.isSystemAction) {
        stats.closedOrders.add(ev.orderId);
        closedOrdersSet.add(ev.orderId);

        // Check if closure was due to delay
        const app = appsMap.get(ev.orderId);
        if (app) {
          if (app.closure_stage === "customer_hold" || String(app.closure_reason_code ?? "").includes("customer")) {
            stats.closedDueToCustomerDelayOrders.add(ev.orderId);
          } else if (app.closure_stage === "technical_hold" || String(app.closure_reason_code ?? "").includes("tech")) {
            stats.closedDueToTechnicalDelayOrders.add(ev.orderId);
          }
        }
      }
    });

    const nowTime = Date.now();

    // 5. Build Employee Performance Table Rows with Realtime Ground Truth Presence & Idle Statistics
    const employeeRows = Array.from(empStatsMap.values()).map((s) => {
      const sess = activeSessionsMap.get(s.employeeId);
      const empSessions = employeeSessionsListMap.get(s.employeeId) ?? (sess ? [sess] : []);

      // Determine the single most recent interaction timestamp across all sources
      const candidateTimestamps: number[] = [];
      if (s.lastActionTime) candidateTimestamps.push(new Date(s.lastActionTime).getTime());
      if (sess?.last_heartbeat_at) candidateTimestamps.push(new Date(sess.last_heartbeat_at).getTime());
      if (sess?.last_activity_at) candidateTimestamps.push(new Date(sess.last_activity_at).getTime());
      if (sess?.login_at) candidateTimestamps.push(new Date(sess.login_at).getTime());
      if (sess?.started_at) candidateTimestamps.push(new Date(sess.started_at).getTime());

      let status: "active" | "idle" | "away" | "offline" = "offline";
      let lastActiveAgo = "Never";
      let liveElapsedMins = 0;

      if (candidateTimestamps.length > 0) {
        const latestTs = Math.max(...candidateTimestamps);
        const diffMins = Math.max(0, Math.floor((nowTime - latestTs) / 60000));
        liveElapsedMins = diffMins;

        if (diffMins < 15) {
          status = "active";
          lastActiveAgo = diffMins <= 1 ? "Just now" : `${diffMins}m ago`;
        } else if (diffMins < 60) {
          status = "idle";
          lastActiveAgo = `${diffMins}m ago`;
        } else if (diffMins < 240) {
          status = "away";
          const hours = Math.floor(diffMins / 60);
          const mins = diffMins % 60;
          lastActiveAgo = hours > 0 ? (mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`) : `${diffMins}m ago`;
        } else {
          status = "offline";
          const hours = Math.floor(diffMins / 60);
          lastActiveAgo = hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
        }
      }

      let activeSecs = 0;
      let idleSecs = 0;
      let awaySecs = 0;

      empSessions.forEach((es) => {
        activeSecs += Number(es.active_seconds || 0);
        idleSecs += Number(es.idle_seconds || 0);
        awaySecs += Number(es.away_seconds || 0);
      });

      if (activeSecs === 0 && idleSecs === 0 && sess) {
        activeSecs = Number(sess.active_seconds || 0);
        idleSecs = Number(sess.idle_seconds || 0);
        awaySecs = Number(sess.away_seconds || 0);
      }

      // If no continuous per-second telemetry records exist, derive from live status & actions
      if (idleSecs === 0) {
        if (status === "idle") {
          idleSecs = liveElapsedMins * 60;
        } else if (status === "away") {
          awaySecs = liveElapsedMins * 60;
        }
      }

      if (activeSecs === 0 && s.actions > 0) {
        activeSecs = s.actions * 5 * 60;
      }

      const activeMinutes = Math.round(activeSecs / 60);
      const idleMinutes = status === "idle" ? liveElapsedMins : Math.round(idleSecs / 60);
      const awayMinutes = status === "away" ? liveElapsedMins : Math.round(awaySecs / 60);
      const totalSessionMins = activeMinutes + idleMinutes + awayMinutes;

      const activeDurationFormatted = activeMinutes >= 60 ? `${Math.floor(activeMinutes / 60)}h ${activeMinutes % 60}m` : `${activeMinutes}m`;
      const idleDurationFormatted =
        status === "idle"
          ? `${liveElapsedMins}m`
          : idleMinutes > 0
          ? idleMinutes >= 60
            ? `${Math.floor(idleMinutes / 60)}h ${idleMinutes % 60}m`
            : `${idleMinutes}m`
          : status === "active"
          ? "0m"
          : "—";

      const awayDurationFormatted =
        status === "away"
          ? liveElapsedMins >= 60
            ? `${Math.floor(liveElapsedMins / 60)}h ${liveElapsedMins % 60}m`
            : `${liveElapsedMins}m`
          : awayMinutes > 0
          ? awayMinutes >= 60
            ? `${Math.floor(awayMinutes / 60)}h ${awayMinutes % 60}m`
            : `${awayMinutes}m`
          : "0m";

      const sessionLabel =
        totalSessionMins > 0
          ? totalSessionMins >= 60
            ? `${Math.floor(totalSessionMins / 60)}h ${totalSessionMins % 60}m`
            : `${totalSessionMins}m`
          : status === "active"
          ? "Active"
          : "—";

      const liveOpenIdleMs = s.lastActionTime ? Math.max(0, nowTime - new Date(s.lastActionTime).getTime()) : 0;
      const liveOpenIdleFormatted = s.lastActionTime ? formatIdleDuration(liveOpenIdleMs) : "—";

      let idleStatusTag: "healthy" | "attention" | "extended" | "offline" = "offline";
      if (status === "offline") {
        idleStatusTag = "offline";
      } else if (status === "active") {
        idleStatusTag = "healthy";
      } else if (status === "idle") {
        idleStatusTag = "attention";
      } else if (status === "away") {
        idleStatusTag = "extended";
      }

      // Effective assigned count: Assigned in range or worked in range
      const assignedCount = Math.max(s.assignedOrders.size, s.workedOrders.size);
      const slaPercent = s.slaTotalCount > 0 ? Math.round((s.slaCompliantCount / s.slaTotalCount) * 100) : 100;

      const effectiveFirstActionTime = s.firstActionTime || sess?.login_at || sess?.started_at || null;
      const effectiveLastActionText = (s.lastActionText && s.lastActionText !== "No actions yet")
        ? s.lastActionText
        : (sess?.last_action_text || (status === "active" ? "Connected to CRM" : "No actions yet"));

      return {
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        employeeRole: s.employeeRole,
        avatarUrl: s.avatarUrl,
        assigned: assignedCount,
        worked: s.workedOrders.size,
        actions: s.actions,
        completed: s.completedOrders.size,
        closed: s.closedOrders.size,
        customerDelays: s.customerDelays,
        technicalDelays: s.technicalDelays,
        closedDueToCustomerDelay: s.closedDueToCustomerDelayOrders.size,
        closedDueToTechnicalDelay: s.closedDueToTechnicalDelayOrders.size,
        hotOrders: s.hotOrders.size,
        slaPercent,
        idleMinutes,
        idleDurationFormatted,
        awayMinutes,
        awayDurationFormatted,
        activeMinutes,
        activeDurationFormatted,
        liveOpenIdleFormatted,
        idleStatusTag,
        lastActionText: effectiveLastActionText,
        lastActionTime: s.lastActionTime || sess?.last_activity_at || null,
        firstActionTime: effectiveFirstActionTime,
        lastOrderCode: s.lastOrderCode || sess?.current_order_code || null,
        lastActiveAgo,
        status,
        sessionLabel,
      };
    });

    // Sort descending by actions + assigned
    employeeRows.sort((a, b) => b.actions + b.assigned - (a.actions + a.assigned));

    // 6. Funnel & Charts
    const completedTotal = completedOrdersSet.size;
    const closedTotal = closedOrdersSet.size;
    const actionedTotal = uniqueOrdersWorkedSet.size;
    const untouchedTotal = Math.max(0, totalAssignedInPeriod - actionedTotal);

    const totalWorkforceIdleMinutes = employeeRows.reduce((sum, e) => sum + e.idleMinutes, 0);
    const totalWorkforceIdleFormatted = totalWorkforceIdleMinutes >= 60 ? `${Math.floor(totalWorkforceIdleMinutes / 60)}h ${totalWorkforceIdleMinutes % 60}m` : `${totalWorkforceIdleMinutes}m`;
    const totalWorkforceAwayMinutes = employeeRows.reduce((sum, e) => sum + e.awayMinutes, 0);
    const totalWorkforceAwayFormatted = totalWorkforceAwayMinutes >= 60 ? `${Math.floor(totalWorkforceAwayMinutes / 60)}h ${totalWorkforceAwayMinutes % 60}m` : `${totalWorkforceAwayMinutes}m`;
    const totalWorkforceActiveMinutes = employeeRows.reduce((sum, e) => sum + e.activeMinutes, 0);
    const totalWorkforceActiveFormatted = totalWorkforceActiveMinutes >= 60 ? `${Math.floor(totalWorkforceActiveMinutes / 60)}h ${totalWorkforceActiveMinutes % 60}m` : `${totalWorkforceActiveMinutes}m`;

    const activeStaffCount = employeeRows.filter((e) => e.status === "active").length;
    const idleStaffCount = employeeRows.filter((e) => e.status === "idle").length;
    const awayStaffCount = employeeRows.filter((e) => e.status === "away").length;
    const offlineStaffCount = employeeRows.filter((e) => e.status === "offline").length;

    const hourlyActionCounts = Array(24).fill(0);
    currentCanonicalEvents.forEach((l) => {
      if (!l.isSystemAction) {
        const hour = new Date(l.createdAt).getHours();
        if (hour >= 0 && hour < 24) hourlyActionCounts[hour] += 1;
      }
    });

    const workloadDistribution = employeeRows
      .filter((e) => e.assigned > 0 || e.actions > 0)
      .map((e) => ({
        name: e.employeeName,
        assigned: e.assigned,
        worked: e.worked,
        completed: e.completed,
        actions: e.actions,
      }));

    // Previous period counts for trends
    const prevWorked = new Set(prevCanonicalEvents.filter((l) => !l.isSystemAction && l.orderId).map((l) => l.orderId)).size;
    const prevCompleted = prevCanonicalEvents.filter((l) => l.actionCategory === "completion").length;
    const prevClosed = prevCanonicalEvents.filter((l) => l.actionCategory === "closure" && !l.isSystemAction).length;

    const totalSlaTargetOrders = Array.from(empStatsMap.values()).reduce((sum, s) => sum + s.slaTotalCount, 0);
    const totalSlaCompliantOrders = Array.from(empStatsMap.values()).reduce((sum, s) => sum + s.slaCompliantCount, 0);
    const overallSlaPercent = totalSlaTargetOrders > 0 ? Math.round((totalSlaCompliantOrders / totalSlaTargetOrders) * 100) : 100;

    const kpiCards = {
      totalActiveEmployees: {
        value: activeStaffProfiles.length,
        trend: { percent: 0, isUp: true },
        label: "Total workforce",
      },
      employeesWorkedToday: {
        value: workedEmployeesSet.size,
        trend: computeTrend(workedEmployeesSet.size, 0),
        label: "Active operators",
      },
      ordersAssigned: {
        value: Math.max(totalAssignedInPeriod, actionedTotal),
        trend: computeTrend(totalAssignedInPeriod, totalAssignedInPeriod),
        label: "Assigned in period",
      },
      ordersActioned: {
        value: actionedTotal,
        trend: computeTrend(actionedTotal, prevWorked),
        label: "Orders with activity",
      },
      uniqueOrdersWorked: {
        value: uniqueOrdersWorkedSet.size,
        trend: computeTrend(uniqueOrdersWorkedSet.size, prevWorked),
        label: "Distinct orders worked",
      },
      totalActions: {
        value: currentCanonicalEvents.filter((e) => !e.isSystemAction).length,
        trend: computeTrend(currentCanonicalEvents.filter((e) => !e.isSystemAction).length, prevCanonicalEvents.filter((e) => !e.isSystemAction).length),
        label: "Human operations",
      },
      ordersCompleted: {
        value: completedTotal,
        trend: computeTrend(completedTotal, prevCompleted),
        label: "Certificates delivered",
      },
      ordersClosed: {
        value: closedTotal,
        trend: computeTrend(closedTotal, prevClosed),
        label: "Orders archived",
      },
      slaBreached: {
        value: Math.max(0, totalSlaTargetOrders - totalSlaCompliantOrders),
        trend: { percent: 0, isUp: false },
        label: "Threshold exceeded",
      },
      slaCompliantPercent: {
        value: overallSlaPercent,
        trend: { percent: 0, isUp: true },
        label: "Target: ≥ 95%",
      },
      customerDelays: {
        value: totalCustomerDelayEvents,
        trend: { percent: 0, isUp: true },
        label: "Awaiting client reply",
      },
      technicalDelays: {
        value: totalTechnicalDelayEvents,
        trend: { percent: 0, isUp: true },
        label: "Portal / system hold",
      },
      hotOrdersHandled: {
        value: hotOrdersSet.size,
        trend: { percent: 0, isUp: true },
        label: "High urgency handled",
      },
      reassignedOrders: {
        value: totalReassignedCount,
        trend: { percent: 0, isUp: true },
        label: "Reallocations",
      },
    };

    return {
      kpiCards,
      employeeRows,
      telemetry: {
        totalMonitored: activeStaffProfiles.length,
        activeCount: activeStaffCount,
        idleCount: idleStaffCount,
        awayCount: awayStaffCount,
        offlineCount: offlineStaffCount,
        totalIdleMinutes: totalWorkforceIdleMinutes,
        totalIdleFormatted: totalWorkforceIdleFormatted,
        totalAwayMinutes: totalWorkforceAwayMinutes,
        totalAwayFormatted: totalWorkforceAwayFormatted,
        totalActiveMinutes: totalWorkforceActiveMinutes,
        totalActiveFormatted: totalWorkforceActiveFormatted,
      },
      orderCodeMap: Object.fromEntries(orderCodeMap),
      funnel: {
        assigned: Math.max(totalAssignedInPeriod, actionedTotal),
        actioned: actionedTotal,
        completed: completedTotal,
        closed: closedTotal,
        untouched: untouchedTotal,
      },
      charts: {
        hourlyActions: hourlyActionCounts.map((count, hr) => ({
          hour: `${hr.toString().padStart(2, "0")}:00`,
          actions: count,
        })),
        workloadDistribution,
      },
      periodLabel: data.dateFilter,
    };
  });

/* ────────────────────────────────────────────────────────────────────────── */
/*  2. EMPLOYEE PERFORMANCE DETAIL VIEW (ADMIN → click employee row)          */
/* ────────────────────────────────────────────────────────────────────────── */

export const getEmployeeDetailPerformance = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        dateFilter: z
          .enum([
            "today",
            "yesterday",
            "7d",
            "15d",
            "30d",
            "this_month",
            "custom",
          ])
          .default("today"),
        customStart: z.string().optional(),
        customEnd: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await verifyAdminOrSuperAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    const adminAny = await getAdminAny();
    const dateRange = resolveDateRange(
      data.dateFilter,
      data.customStart,
      data.customEnd,
    );

    const [{ data: profile }, { data: userRole }, { data: dbSessions }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, display_name, email")
        .eq("id", data.employeeId)
        .maybeSingle(),
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.employeeId)
        .limit(1)
        .maybeSingle(),
      adminAny
        .from("employee_sessions")
        .select("id, started_at:login_at, ended_at:logout_at, last_heartbeat_at, last_activity_at, active_seconds, idle_seconds, away_seconds, status, is_active, current_module, current_order_id")
        .eq("employee_id", data.employeeId)
        .gte("login_at", dateRange.current.start)
        .lte("login_at", dateRange.current.end)
        .order("login_at", { ascending: false }),
    ]);

    if (!profile) throw new Error("Employee not found");
    const empName = resolveEmployeeName(profile);

    const profileMap = new Map<string, any>([[profile.id, profile]]);
    const userRoleMap = new Map<string, string>([[profile.id, userRole?.role || "operations"]]);
    const resolveStaffUserId = (raw?: string | null) => (raw?.includes(profile.id) || raw?.toLowerCase().includes(empName.toLowerCase()) ? profile.id : raw || null);

    // Fetch Source of Truth Events for this employee in date range
    const [
      { data: appEvents },
      { data: schedulers },
      { data: activityLogs },
    ] = await Promise.all([
      admin
        .from("application_events")
        .select("id, application_id, lead_id, event_type, note, old_value, new_value, staff_name, staff_role, created_at, created_by")
        .or(`created_by.eq.${data.employeeId},staff_name.ilike.%${empName}%`)
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(500),
      adminAny
        .from("order_schedulers")
        .select("id, application_id, status, scheduler_type, started_at, fires_at, remarks, created_at, created_by")
        .eq("created_by", data.employeeId)
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("activity_logs")
        .select("id, activity_type, activity_description, application_id, lead_id, created_at, user_id")
        .eq("user_id", data.employeeId)
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const canonicalEvents = normalizeOperationalEvents({
      appEvents: appEvents ?? [],
      schedulers: schedulers ?? [],
      activityLogs: activityLogs ?? [],
      profileMap,
      userRoleMap,
      resolveStaffUserId,
    }).filter((ev) => ev.employeeId === data.employeeId || ev.employeeName.toLowerCase().includes(empName.toLowerCase()));

    // Collect all order IDs for this employee
    const touchedOrderIds = Array.from(new Set(canonicalEvents.map((e) => e.orderId).filter(Boolean))) as string[];

    // Fetch assigned applications
    const [
      { data: assignedOrders },
      { data: touchedOrders },
    ] = await Promise.all([
      adminAny
        .from("applications")
        .select("id, application_code, customer_id, lead_id, service_id, order_status, fulfillment_status, application_status, assigned_at, created_at, updated_at, form_submitted_at, certificate_uploaded_at, workflow_status, closure_stage, closure_reason_code")
        .eq("assigned_to", data.employeeId)
        .eq("is_deleted", false)
        .limit(500),
      touchedOrderIds.length > 0
        ? adminAny
            .from("applications")
            .select("id, application_code, customer_id, lead_id, service_id, order_status, fulfillment_status, application_status, assigned_at, created_at, updated_at, form_submitted_at, certificate_uploaded_at, workflow_status, closure_stage, closure_reason_code")
            .in("id", touchedOrderIds)
            .eq("is_deleted", false)
        : { data: [] },
    ]);

    const appsListMap = new Map<string, any>();
    (assignedOrders ?? []).forEach((a: any) => appsListMap.set(a.id, a));
    (touchedOrders ?? []).forEach((a: any) => appsListMap.set(a.id, a));
    const appsList = Array.from(appsListMap.values());

    // Customer & Service lookups
    const custIds = Array.from(new Set(appsList.map((a: any) => a.customer_id).filter(Boolean)));
    const svcIds = Array.from(new Set(appsList.map((a: any) => a.service_id).filter(Boolean)));

    const [{ data: customersData }, { data: servicesData }] = await Promise.all([
      custIds.length ? admin.from("customers").select("id, name, primary_mobile, primary_email").in("id", custIds) : { data: [] },
      svcIds.length ? admin.from("services").select("id, service_name").in("id", svcIds) : { data: [] },
    ]);

    const customerMap = new Map((customersData ?? []).map((c: any) => [c.id, c]));
    const serviceMap = new Map((servicesData ?? []).map((s: any) => [s.id, s.service_name]));

    const orderCodeMap = new Map<string, string>();
    appsList.forEach((a: any) => {
      if (a.application_code) orderCodeMap.set(a.id, a.application_code);
    });

    const workedOrdersSet = new Set(canonicalEvents.filter((e) => !e.isSystemAction && e.orderId).map((e) => e.orderId));
    const completedOrdersSet = new Set(canonicalEvents.filter((e) => e.actionCategory === "completion" && e.orderId).map((e) => e.orderId));
    const closedOrdersSet = new Set(canonicalEvents.filter((e) => e.actionCategory === "closure" && e.orderId && !e.isSystemAction).map((e) => e.orderId));
    const hotOrdersSet = new Set(canonicalEvents.filter((e) => e.actionCategory === "hot_order" && e.orderId).map((e) => e.orderId));

    const customerDelays = canonicalEvents.filter((e) => e.actionCategory === "customer_delay").length;
    const technicalDelays = canonicalEvents.filter((e) => e.actionCategory === "technical_delay").length;

    // Timeline format
    const employeeActionEvents = canonicalEvents.filter(isEmployeeActionEvent);
    const timeline = employeeActionEvents.map((ev) => {
      const { actionLabel, details } = formatLogAction({
        action_type: ev.actionType,
        previous_status: ev.previousStatus,
        new_status: ev.newStatus,
        notes: ev.notes,
      });
      const code = ev.orderId ? (orderCodeMap.get(ev.orderId) || ev.orderId.slice(0, 8)) : "—";
      const cust = ev.orderId && appsListMap.get(ev.orderId)?.customer_id ? customerMap.get(appsListMap.get(ev.orderId)!.customer_id) : null;

      return {
        id: ev.id,
        time: formatTimeIST(ev.createdAt),
        createdAt: ev.createdAt,
        orderId: ev.orderId,
        leadId: ev.leadId,
        orderCode: code,
        customerName: cust?.name || "Customer",
        actionType: ev.actionType,
        actionLabel,
        previousStatus: ev.previousStatus,
        newStatus: ev.newStatus,
        notes: details || ev.notes,
        slaStatus: "compliant",
        isSlaBreached: false,
      };
    });

    // Order work list
    const orderWorkList = appsList.map((ord: any) => {
      const orderEvents = employeeActionEvents.filter((l) => l.orderId === ord.id);
      const firstAction = orderEvents.length ? orderEvents[orderEvents.length - 1] : null;
      const lastAction = orderEvents.length ? orderEvents[0] : null;
      const cust = customerMap.get(ord.customer_id);
      const serviceName = serviceMap.get(ord.service_id) || "Service";

      return {
        orderId: ord.id,
        orderNumber: ord.application_code || ord.id.slice(0, 8),
        customerName: cust?.name || "Customer",
        customerMobile: cust?.primary_mobile || "—",
        serviceName,
        assignedAt: ord.assigned_at || ord.created_at,
        firstActionAt: firstAction?.createdAt || null,
        lastActionAt: lastAction?.createdAt || null,
        totalActions: orderEvents.length,
        currentStage: ord.fulfillment_status,
        currentStatus: ord.order_status || ord.application_status,
        isHot: ord.fulfillment_status === "order_reopened" || ord.order_status === "REOPENED",
        slaStatus: "COMPLIANT",
        completedAt: ord.order_status === "COMPLETED" ? ord.updated_at : null,
        closedAt: ord.order_status === "CLOSED" ? ord.updated_at : null,
      };
    });

    const firstActionIso = employeeActionEvents.length > 0 ? employeeActionEvents[employeeActionEvents.length - 1].createdAt : null;
    const lastActionIso = employeeActionEvents.length > 0 ? employeeActionEvents[0].createdAt : null;
    const firstLoginFormatted = firstActionIso ? formatTimeIST(firstActionIso) : "—";
    const lastActiveAgoText = lastActionIso
      ? `${Math.max(1, Math.round((Date.now() - new Date(lastActionIso).getTime()) / 60000))}m ago`
      : "Never";

    // Dynamic SLA calculation from real completed orders
    let totalCompletedSla = 0;
    let compliantCompletedSla = 0;
    appsList.forEach((app: any) => {
      if (app.order_status === "COMPLETED" && app.created_at && app.updated_at) {
        totalCompletedSla++;
        const durHours = (new Date(app.updated_at).getTime() - new Date(app.created_at).getTime()) / 3_600_000;
        if (durHours <= 48) compliantCompletedSla++;
      }
    });
    const slaCompliance = totalCompletedSla > 0 ? Math.round((compliantCompletedSla / totalCompletedSla) * 100) : 100;

    // Real session duration calculations from database records
    let totalActiveSecs = 0;
    let totalIdleSecs = 0;
    let totalAwaySecs = 0;
    (dbSessions ?? []).forEach((s: any) => {
      totalActiveSecs += Number(s.active_seconds || 0);
      totalIdleSecs += Number(s.idle_seconds || 0);
      totalAwaySecs += Number(s.away_seconds || 0);
    });

    const activeMins = Math.round(totalActiveSecs / 60);
    const idleMins = Math.round(totalIdleSecs / 60);
    const awayMins = Math.round(totalAwaySecs / 60);

    const activeFormatted = `${Math.floor(activeMins / 60)}h ${activeMins % 60}m`;
    const idleFormatted = `${idleMins}m`;
    const awayFormatted = `${awayMins}m`;

    const sessionSegments = buildDynamicTelemetrySegments(dbSessions ?? [], canonicalEvents);
    const stepperEvents = buildDynamicStepperEvents(
      canonicalEvents.map((c) => ({ created_at: c.createdAt, notes: c.notes, action_type: c.actionType, order_id: c.orderId })),
      firstActionIso,
      empName,
    );

    const presenceState = getEmployeePresenceState(data.employeeId);
    const liveSession: any = presenceState.session;
    const shift = presenceState.shift;

    return {
      employee: {
        id: profile.id,
        name: empName,
        email: profile.email,
        role: userRole?.role || "operations",
      },
      kpiCards: {
        assigned: Math.max(appsList.length, workedOrdersSet.size),
        worked: workedOrdersSet.size,
        actions: canonicalEvents.filter((e) => !e.isSystemAction).length,
        completed: completedOrdersSet.size,
        closed: closedOrdersSet.size,
        customerDelays,
        technicalDelays,
        hotOrders: hotOrdersSet.size,
        slaCompliance,
        slaBreaches: Math.max(0, totalCompletedSla - compliantCompletedSla),
        avgFirstResponseMins: 12,
      },
      session: {
        sessionId: liveSession?.sessionId || `sess_${data.employeeId.slice(0, 8)}`,
        firstLogin: firstLoginFormatted,
        lastActive: lastActiveAgoText,
        currentModule: "Orders",
        currentOrderId: canonicalEvents[0]?.orderId || null,
        currentOrderCode: canonicalEvents[0]?.orderId ? orderCodeMap.get(canonicalEvents[0].orderId) : ((appsList[0] as any)?.application_code || "—"),
        presenceStatus: liveSession?.presenceStatus ?? (activeMins > 0 ? "ACTIVE" : "OFFLINE"),
        shiftName: shift.name,
        shiftCode: shift.code,
        shiftWindow: `${shift.startTime} — ${shift.endTime} IST`,
        activeDuration: activeFormatted,
        activeMinutes: activeMins,
        idleDuration: idleFormatted,
        idleMinutes: idleMins,
        awayDuration: awayFormatted,
        awayMinutes: awayMins,
        sessionSegments,
        stepperEvents,
      },
      timeline,
      orderWorkList,
    };
  });

/* ────────────────────────────────────────────────────────────────────────── */
/*  3. EMPLOYEE SELF VIEW: MY PERFORMANCE DASHBOARD                           */
/* ────────────────────────────────────────────────────────────────────────── */

export const getMyPerformanceDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        dateFilter: z
          .enum(["today", "yesterday", "7d", "15d", "30d", "this_month"])
          .default("today"),
        customStart: z.string().optional(),
        customEnd: z.string().optional(),
        employeeId: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const adminAny = await getAdminAny();
    const { getStaffRoleInfo } = await import("@/lib/crm/order-auth.server");
    const staffInfo = await getStaffRoleInfo(admin, context.userId);
    const canViewOthers = staffInfo.isAdmin || staffInfo.isManager;
    const employeeId =
      canViewOthers && data.employeeId && data.employeeId !== "all" && data.employeeId !== "unassigned"
        ? data.employeeId
        : context.userId;
    const dateRange = resolveDateRange(
      data.dateFilter,
      data.customStart,
      data.customEnd,
    );

    const [{ data: profile }, { data: userRole }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, display_name, email")
        .eq("id", employeeId)
        .maybeSingle(),
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", employeeId)
        .limit(1)
        .maybeSingle(),
    ]);

    const empName = resolveEmployeeName(profile, "Unknown Employee");

    const profileMap = new Map<string, any>([[employeeId, profile]]);
    const userRoleMap = new Map<string, string>([[employeeId, userRole?.role || "operations"]]);
    const resolveStaffUserId = (raw?: string | null) => (raw?.includes(employeeId) || raw?.toLowerCase().includes(empName.toLowerCase()) ? employeeId : null);

    // Fetch Source of Truth Events and Sessions for this employee in date range
    const [
      { data: appEvents },
      { data: schedulers },
      { data: activityLogs },
      { data: actionLogs },
      { data: dbSessions },
    ] = await Promise.all([
      admin
        .from("application_events")
        .select("id, application_id, lead_id, event_type, note, old_value, new_value, staff_name, created_at, created_by")
        .or(`created_by.eq.${employeeId},staff_name.ilike.%${empName}%`)
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(1000),
      adminAny
        .from("order_schedulers")
        .select("id, application_id, status, scheduler_type, started_at, fires_at, remarks, created_at, created_by")
        .eq("created_by", employeeId)
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(1000),
      admin
        .from("activity_logs")
        .select("id, activity_type, activity_description, application_id, lead_id, created_at, user_id")
        .eq("user_id", employeeId)
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(1000),
      (admin
        .from("order_action_logs" as any) as any)
        .select("id, order_id, lead_id, customer_id, employee_id, employee_name, employee_role, action_type, previous_status, new_status, notes, source, created_at, time_spent_since_previous_action_ms")
        .or(`employee_id.eq.${employeeId},employee_name.ilike.%${empName}%`)
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(1000),
      adminAny
        .from("employee_sessions")
        .select("id, started_at:login_at, ended_at:logout_at, last_heartbeat_at, last_activity_at, active_seconds, idle_seconds, away_seconds, status, is_active, current_module, current_order_id")
        .eq("employee_id", employeeId)
        .gte("login_at", dateRange.current.start)
        .lte("login_at", dateRange.current.end)
        .order("login_at", { ascending: false }),
    ]);

    const canonicalEvents = normalizeOperationalEvents({
      appEvents: appEvents ?? [],
      schedulers: schedulers ?? [],
      activityLogs: activityLogs ?? [],
      actionLogs: (actionLogs as any[]) ?? [],
      profileMap,
      userRoleMap,
      resolveStaffUserId,
    }).filter((ev) => ev.employeeId === employeeId || ev.employeeName.toLowerCase().includes(empName.toLowerCase()));

    const touchedOrderIds = Array.from(new Set(canonicalEvents.map((e) => e.orderId).filter(Boolean))) as string[];

    // Fetch assigned applications
    const [
      { data: assignedOrders },
      { data: touchedOrders },
    ] = await Promise.all([
      adminAny
        .from("applications")
        .select("id, application_code, customer_id, lead_id, service_id, order_status, fulfillment_status, application_status, assigned_at, created_at, updated_at, form_submitted_at, certificate_uploaded_at, workflow_status, closure_stage, closure_reason_code")
        .eq("assigned_to", employeeId)
        .eq("is_deleted", false)
        .limit(300),
      touchedOrderIds.length > 0
        ? adminAny
            .from("applications")
            .select("id, application_code, customer_id, lead_id, service_id, order_status, fulfillment_status, application_status, assigned_at, created_at, updated_at, form_submitted_at, certificate_uploaded_at, workflow_status, closure_stage, closure_reason_code")
            .in("id", touchedOrderIds)
            .eq("is_deleted", false)
        : { data: [] },
    ]);

    const appsListMap = new Map<string, any>();
    (assignedOrders ?? []).forEach((a: any) => appsListMap.set(a.id, a));
    (touchedOrders ?? []).forEach((a: any) => appsListMap.set(a.id, a));
    const allAssigned = Array.from(appsListMap.values());

    const custIds = Array.from(new Set(allAssigned.map((a: any) => a.customer_id).filter(Boolean)));
    const svcIds = Array.from(new Set(allAssigned.map((a: any) => a.service_id).filter(Boolean)));

    const [{ data: customersData }, { data: servicesData }] = await Promise.all([
      custIds.length ? admin.from("customers").select("id, name, primary_mobile, primary_email").in("id", custIds) : { data: [] },
      svcIds.length ? admin.from("services").select("id, service_name").in("id", svcIds) : { data: [] },
    ]);

    const customerMap = new Map((customersData ?? []).map((c: any) => [c.id, c]));
    const serviceMap = new Map((servicesData ?? []).map((s: any) => [s.id, s.service_name]));

    const orderCodeMap = new Map<string, string>();
    allAssigned.forEach((a: any) => {
      if (a.application_code) orderCodeMap.set(a.id, a.application_code);
    });

    // ── Calculate Action Idle Times & Action Response Intervals (STRICTLY Order Actions) ──
    const isQualifyingOrderAction = (e: NormalizedOperationalEvent): boolean => {
      if (e.isSystemAction || !e.orderId) return false;
      if (e.actionCategory === "assignment" || e.actionCategory === "system_closure") return false;
      const at = (e.actionType || "").toUpperCase();
      const excludedTypes = [
        "ORDER_ASSIGNED",
        "ORDER_REASSIGNED",
        "PAGE_VIEWED",
        "TAB_OPENED",
        "LOGIN",
        "LOGOUT",
        "SESSION_INITIALIZED",
        "SESSION_STARTED",
        "SESSION_HEARTBEAT",
        "TELEMETRY",
        "ACTIVE_STREAM",
        "PRESENCE_CHANGED",
        "SYSTEM_CLOSE",
      ];
      if (excludedTypes.includes(at)) return false;
      return true;
    };

    const qualifyingOrderActions = canonicalEvents
      .filter(isQualifyingOrderAction)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const actionsByOrder = new Map<string, NormalizedOperationalEvent[]>();
    qualifyingOrderActions.forEach((act) => {
      if (act.orderId) {
        const list = actionsByOrder.get(act.orderId) ?? [];
        list.push(act);
        actionsByOrder.set(act.orderId, list);
      }
    });

    const actionIntervals: ActionIntervalItem[] = [];
    const allIntervalMs: number[] = [];

    actionsByOrder.forEach((orderActions, ordId) => {
      orderActions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (let i = 1; i < orderActions.length; i++) {
        const prev = orderActions[i - 1];
        const curr = orderActions[i];
        const tPrev = new Date(prev.createdAt).getTime();
        const tCurr = new Date(curr.createdAt).getTime();
        const diffMs = Math.max(0, tCurr - tPrev);

        const { actionLabel: prevLabel } = formatLogAction({ action_type: prev.actionType, notes: prev.notes });
        const { actionLabel: currLabel } = formatLogAction({ action_type: curr.actionType, notes: curr.notes });
        const code = orderCodeMap.get(ordId) || ordId.slice(0, 8);

        actionIntervals.push({
          id: `${prev.id}_to_${curr.id}`,
          orderId: ordId,
          orderCode: code,
          employeeId: curr.employeeId || employeeId,
          employeeName: curr.employeeName || empName,
          previousAction: prevLabel,
          previousActionTime: prev.createdAt,
          nextAction: currLabel,
          nextActionTime: curr.createdAt,
          idleDurationMs: diffMs,
          idleDurationFormatted: formatIdleDuration(diffMs),
        });

        allIntervalMs.push(diffMs);
      }
    });

    actionIntervals.sort((a, b) => new Date(b.nextActionTime).getTime() - new Date(a.nextActionTime).getTime());

    const totalActionsCount = qualifyingOrderActions.length;
    const trackedIntervalsCount = allIntervalMs.length;
    const avgIdleMs = trackedIntervalsCount > 0 ? Math.round(allIntervalMs.reduce((sum, v) => sum + v, 0) / trackedIntervalsCount) : 0;
    const longestIdleMs = trackedIntervalsCount > 0 ? Math.max(...allIntervalMs) : 0;

    const latestOverallAction = qualifyingOrderActions.length > 0 ? qualifyingOrderActions[qualifyingOrderActions.length - 1] : null;
    const { actionLabel: latestActionLabel } = latestOverallAction
      ? formatLogAction({ action_type: latestOverallAction.actionType, notes: latestOverallAction.notes })
      : { actionLabel: null };

    const actionResponseMetrics: ActionResponseMetrics = {
      totalActions: totalActionsCount,
      trackedIntervals: trackedIntervalsCount,
      avgIdleMs,
      avgIdleFormatted: formatIdleDuration(avgIdleMs),
      medianIdleMs: 0,
      medianIdleFormatted: "0s",
      longestIdleMs,
      longestIdleFormatted: formatIdleDuration(longestIdleMs),
      latestActionAt: latestOverallAction?.createdAt || null,
      latestActionLabel,
      latestActionOrderCode: latestOverallAction?.orderId ? (orderCodeMap.get(latestOverallAction.orderId) || latestOverallAction.orderId.slice(0, 8)) : null,
    };

    const workedOrdersSet = new Set(canonicalEvents.filter((e) => !e.isSystemAction && e.orderId).map((e) => e.orderId));
    const completedOrdersSet = new Set(canonicalEvents.filter((e) => e.actionCategory === "completion" && e.orderId).map((e) => e.orderId));
    const closedOrdersSet = new Set(canonicalEvents.filter((e) => e.actionCategory === "closure" && e.orderId && !e.isSystemAction).map((e) => e.orderId));
    const hotOrdersSet = new Set(canonicalEvents.filter((e) => e.actionCategory === "hot_order" && e.orderId).map((e) => e.orderId));

    const customerDelays = canonicalEvents.filter((e) => e.actionCategory === "customer_delay").length;
    const technicalDelays = canonicalEvents.filter((e) => e.actionCategory === "technical_delay").length;

    const assignedCount = Math.max(allAssigned.length, workedOrdersSet.size);
    const completedCount = completedOrdersSet.size;
    const closedCount = closedOrdersSet.size;
    const actionedCount = workedOrdersSet.size;
    const inProgressCount = Math.max(0, assignedCount - completedCount - closedCount);
    const pendingCount = Math.max(0, assignedCount - actionedCount);

    // Top 3 Performers today across the CRM (ranked strictly by successfully completed orders today in IST)
    const { data: allTodayCompletions } = await admin
      .from("application_events")
      .select("id, application_id, created_by, staff_name, created_at, new_value, event_type")
      .gte("created_at", dateRange.current.start)
      .lte("created_at", dateRange.current.end);

    const completionCountsByEmp = new Map<string, Set<string>>();
    (allTodayCompletions ?? []).forEach((ev: any) => {
      const et = String(ev.event_type ?? "").toLowerCase();
      const nv = String(ev.new_value ?? "").toUpperCase();
      const isComp = nv === "COMPLETED" || et === "order_completed" || et.includes("completed");
      if (isComp && ev.application_id) {
        const creatorId = ev.created_by;
        if (creatorId && creatorId !== "00000000-0000-0000-0000-000000000000") {
          if (!completionCountsByEmp.has(creatorId)) {
            completionCountsByEmp.set(creatorId, new Set());
          }
          completionCountsByEmp.get(creatorId)!.add(ev.application_id);
        }
      }
    });

    const topPerformerEntries = Array.from(completionCountsByEmp.entries())
      .filter(([_, set]) => set.size > 0)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 3);

    const topPerformerUserIds = topPerformerEntries.map(([id]) => id);
    const { data: topPerformerProfiles } = topPerformerUserIds.length > 0
      ? await admin.from("profiles").select("id, full_name, display_name, avatar_url").in("id", topPerformerUserIds)
      : { data: [] };

    const topPerformerProfileMap = new Map((topPerformerProfiles ?? []).map((p: any) => [p.id, p]));
    const topPerformers = topPerformerEntries.map(([uid], idx) => {
      const p = topPerformerProfileMap.get(uid);
      const name = p?.full_name || p?.display_name || "Operator";
      return {
        rank: (idx + 1) as 1 | 2 | 3,
        name,
        avatarUrl: p?.avatar_url || null,
        initial: name.charAt(0).toUpperCase(),
      };
    });

    // Active delay workloads for current employee
    const currentCustomerDelayCount = allAssigned.filter((a: any) =>
      a.fulfillment_status === "customer_delay" || a.order_status === "CUSTOMER_HOLD"
    ).length;

    const currentTechnicalDelayCount = allAssigned.filter((a: any) =>
      a.fulfillment_status === "technical_delay" ||
      a.order_status === "TECHNICAL_HOLD_EXTERNAL" ||
      a.order_status === "TECHNICAL_HOLD_INTERNAL" ||
      a.order_status === "OUR_SIDE_DELAY"
    ).length;

    // Closed due to delays
    let closedDueToCustomerDelay = 0;
    let closedDueToTechnicalDelay = 0;
    allAssigned.forEach((a: any) => {
      if (a.order_status === "CLOSED" || a.fulfillment_status === "order_closed") {
        if (a.closure_stage === "customer_hold" || String(a.closure_reason_code ?? "").includes("customer")) {
          closedDueToCustomerDelay++;
        } else if (a.closure_stage === "ticket_hold" || String(a.closure_reason_code ?? "").includes("tech")) {
          closedDueToTechnicalDelay++;
        }
      }
    });

    // Priority Hopper Orders:
    // 1. Hot orders (active callback/reminder or reopened)
    // 2. Earliest relevant non-terminal pending orders
    const nonTerminalOrders = allAssigned.filter((o: any) =>
      !["completed", "order_completed", "consultation_completed", "order_closed", "closed", "cancelled", "application_rejected", "certificate_rejected"].includes(o.fulfillment_status) &&
      !["COMPLETED", "CLOSED", "CANCELLED"].includes(o.order_status)
    );

    const priorityHopperList = nonTerminalOrders
      .map((ord: any) => {
        const orderLogs = canonicalEvents.filter((l) => l.orderId === ord.id);
        const lastAction = orderLogs[0] || null;
        const cust = customerMap.get(ord.customer_id);
        const serviceName = serviceMap.get(ord.service_id) || "Service";
        const isHot = ord.fulfillment_status === "order_reopened" || ord.order_status === "REOPENED" || hotOrdersSet.has(ord.id);
        const { actionLabel: lastActionLabel } = lastAction
          ? formatLogAction({ action_type: lastAction.actionType, notes: lastAction.notes })
          : { actionLabel: "Awaiting first action" };

        let priorityRank = 3;
        let priorityBadge = "Normal Pending";
        let priorityTone: "red" | "amber" | "blue" | "slate" = "slate";

        if (isHot) {
          priorityRank = 1;
          priorityBadge = "Hot Order • Call Due";
          priorityTone = "red";
        } else if (ord.fulfillment_status === "form_submitted") {
          priorityRank = 2;
          priorityBadge = "Form Submitted • Review Due";
          priorityTone = "amber";
        } else if (ord.fulfillment_status === "payment_done" || ord.fulfillment_status === "lead_received") {
          priorityRank = 2;
          priorityBadge = "New Order • Action Required";
          priorityTone = "blue";
        }

        return {
          orderId: ord.id,
          orderNumber: ord.application_code || ord.id.slice(0, 8),
          customerName: cust?.name || "Customer",
          customerMobile: cust?.primary_mobile || "—",
          serviceName,
          createdAt: ord.created_at,
          assignedAt: ord.assigned_at || ord.created_at,
          currentStage: ord.fulfillment_status,
          currentStatus: ord.order_status || ord.application_status,
          stageName: cleanStageOrStatus(ord.fulfillment_status),
          lastAction: lastActionLabel,
          isHot,
          priorityRank,
          priorityBadge,
          priorityTone,
          amount: ord.total_amount || ord.fee_amount || 0,
        };
      })
      .sort((a, b) => {
        if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // Earliest first
      });

    const myOrdersList = allAssigned.map((ord: any) => {
      const orderLogs = canonicalEvents.filter((l) => l.orderId === ord.id);
      const lastAction = orderLogs[0] || null;
      const cust = customerMap.get(ord.customer_id);
      const serviceName = serviceMap.get(ord.service_id) || "Service";
      const { actionLabel: lastActionText } = lastAction
        ? formatLogAction({ action_type: lastAction.actionType, notes: lastAction.notes })
        : { actionLabel: "Pending First Action" };
      const isHot = ord.fulfillment_status === "order_reopened" || ord.order_status === "REOPENED" || hotOrdersSet.has(ord.id);

      return {
        orderId: ord.id,
        orderNumber: ord.application_code || ord.id.slice(0, 8),
        customerName: cust?.name || "Customer",
        customerMobile: cust?.primary_mobile || "—",
        serviceName,
        createdAt: ord.created_at,
        assignedAt: ord.assigned_at || ord.created_at,
        lastActionAt: lastAction?.createdAt || null,
        lastActionText,
        currentStage: ord.fulfillment_status,
        currentStatus: ord.order_status || ord.application_status,
        stageName: cleanStageOrStatus(ord.fulfillment_status),
        isHot,
        slaStatus: "COMPLIANT",
        isCompleted: ord.order_status === "COMPLETED" || ["completed", "order_completed", "consultation_completed"].includes(ord.fulfillment_status),
        isClosed: ord.order_status === "CLOSED" || ["order_closed", "closed", "cancelled"].includes(ord.fulfillment_status),
        isCustomerDelay: !(ord.order_status === "COMPLETED" || ["completed", "order_completed", "consultation_completed"].includes(ord.fulfillment_status) || ord.order_status === "CLOSED" || ["order_closed", "closed", "cancelled"].includes(ord.fulfillment_status)) && (ord.fulfillment_status === "customer_delay" || ord.order_status === "CUSTOMER_HOLD"),
        isTechnicalDelay: !(ord.order_status === "COMPLETED" || ["completed", "order_completed", "consultation_completed"].includes(ord.fulfillment_status) || ord.order_status === "CLOSED" || ["order_closed", "closed", "cancelled"].includes(ord.fulfillment_status)) && (ord.fulfillment_status === "technical_delay" || ord.order_status?.includes("TECHNICAL")),
      };
    });

    const activityTimeline = canonicalEvents.filter(isEmployeeActionEvent).slice(0, 50).map((ev) => {
      const { actionLabel, details } = formatLogAction({ action_type: ev.actionType, notes: ev.notes });
      const code = ev.orderId ? (orderCodeMap.get(ev.orderId) || ev.orderId.slice(0, 8)) : "—";
      const cust = ev.orderId && appsListMap.get(ev.orderId)?.customer_id ? customerMap.get(appsListMap.get(ev.orderId)!.customer_id) : null;
      const serviceName = ev.orderId && appsListMap.get(ev.orderId)?.service_id ? serviceMap.get(appsListMap.get(ev.orderId)!.service_id) : "—";

      return {
        id: ev.id,
        time: formatTimeIST(ev.createdAt),
        createdAt: ev.createdAt,
        orderId: ev.orderId,
        orderCode: code,
        customerName: cust?.name || "Customer",
        serviceName,
        actionType: ev.actionType,
        actionLabel,
        notes: details || ev.notes,
        slaStatus: "compliant",
      };
    });

    const recentActions = canonicalEvents.filter(isEmployeeActionEvent).slice(0, 20).map((ev) => {
      const { actionLabel, details } = formatLogAction({ action_type: ev.actionType, notes: ev.notes });
      const code = ev.orderId ? (orderCodeMap.get(ev.orderId) || ev.orderId.slice(0, 8)) : "—";
      return {
        id: ev.id,
        orderId: ev.orderId,
        orderCode: code,
        action: actionLabel,
        time: formatTimeIST(ev.createdAt),
        previousState: ev.previousStatus || "—",
        newState: ev.newStatus || "—",
        notes: details || ev.notes,
      };
    });

    const lastActionTime = canonicalEvents.length > 0 ? canonicalEvents[0].createdAt : null;
    let presenceStatus: "active" | "away" | "offline" = "offline";
    if (lastActionTime) {
      const diffMins = Math.round((Date.now() - new Date(lastActionTime).getTime()) / 60000);
      if (diffMins < 30) presenceStatus = "active";
      else if (diffMins < 120) presenceStatus = "away";
    }

    // Dynamic SLA calculation from real completed orders
    let totalCompletedSla = 0;
    let compliantCompletedSla = 0;
    allAssigned.forEach((app: any) => {
      if (app.order_status === "COMPLETED" && app.created_at && app.updated_at) {
        totalCompletedSla++;
        const durHours = (new Date(app.updated_at).getTime() - new Date(app.created_at).getTime()) / 3_600_000;
        if (durHours <= 48) compliantCompletedSla++;
      }
    });
    const slaCompliance = totalCompletedSla > 0 ? Math.round((compliantCompletedSla / totalCompletedSla) * 100) : 100;

    // Real session duration calculations from database records & telemetry
    let totalActiveSecs = 0;
    let totalIdleSecs = 0;
    let totalAwaySecs = 0;
    const sortedDbSessions = [...(dbSessions ?? [])].sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );

    sortedDbSessions.forEach((s: any) => {
      totalActiveSecs += Number(s.active_seconds || 0);
      totalIdleSecs += Number(s.idle_seconds || 0);
      totalAwaySecs += Number(s.away_seconds || 0);
    });

    // If dbSessions is empty, estimate seamlessly from qualifying actions
    if (totalActiveSecs === 0 && qualifyingOrderActions.length > 0) {
      totalActiveSecs = qualifyingOrderActions.length * 8 * 60;
      const idleSumSecs = Math.round(allIntervalMs.reduce((acc, v) => acc + v, 0) / 1000);
      totalIdleSecs = Math.min(idleSumSecs, 8 * 3600);
    }

    const activeMins = Math.round(totalActiveSecs / 60);
    const idleMins = Math.round(totalIdleSecs / 60);
    const awayMins = Math.round(totalAwaySecs / 60);

    const activeFormatted = activeMins >= 60 ? `${Math.floor(activeMins / 60)}h ${activeMins % 60}m` : `${activeMins}m`;
    const idleFormatted = idleMins >= 60 ? `${Math.floor(idleMins / 60)}h ${idleMins % 60}m` : `${idleMins}m`;
    const awayFormatted = awayMins >= 60 ? `${Math.floor(awayMins / 60)}h ${awayMins % 60}m` : `${awayMins}m`;

    const firstSessionStartIso = sortedDbSessions[0]?.started_at || (qualifyingOrderActions[0]?.createdAt ?? null);
    const firstLoginFormatted = firstSessionStartIso ? formatTimeIST(firstSessionStartIso) : null;

    const sessionSegments = buildDynamicTelemetrySegments(sortedDbSessions, qualifyingOrderActions);
    const orderActionChronology = buildOrderActionChronology(qualifyingOrderActions, orderCodeMap);

    return {
      employee: {
        id: employeeId,
        name: empName,
        email: profile?.email,
        role: userRole?.role || "operations",
        presenceStatus,
      },
      session: {
        firstLogin: firstLoginFormatted,
        firstLoginIso: firstSessionStartIso,
        activeDuration: activeFormatted,
        activeMinutes: activeMins,
        idleDuration: idleFormatted,
        idleMinutes: idleMins,
        awayDuration: awayFormatted,
        awayMinutes: awayMins,
        meaningfulActions: totalActionsCount,
        ordersWorked: workedOrdersSet.size,
        slaCompliance,
        sessionSegments,
        actionChronology: orderActionChronology,
        stepperEvents: orderActionChronology,
      },
      kpiCards: {
        assigned: assignedCount,
        worked: workedOrdersSet.size,
        completed: completedCount,
        closed: closedCount,
        pending: pendingCount,
        customerDelays,
        currentCustomerDelayCount,
        technicalDelays,
        currentTechnicalDelayCount,
        closedDueToCustomerDelay,
        closedDueToTechnicalDelay,
        hotOrders: hotOrdersSet.size,
      },
      workloadFlow: {
        assigned: assignedCount,
        worked: workedOrdersSet.size,
        actioned: actionedCount,
        inProgress: inProgressCount,
        pending: pendingCount,
        completed: completedCount,
        closed: closedCount,
        customerDelayAdded: customerDelays,
        currentCustomerDelay: currentCustomerDelayCount,
        technicalDelayAdded: technicalDelays,
        currentTechnicalDelay: currentTechnicalDelayCount,
        closedDueToCustomerDelay,
        closedDueToTechnicalDelay,
        hotOrdersHandled: hotOrdersSet.size,
        slaRisk: 0,
      },
      priorityHopper: priorityHopperList,
      topPerformers,
      orders: myOrdersList,
      timeline: activityTimeline,
      recentActions,
      actionResponseMetrics,
      actionIntervals,
    };
  });

/* ────────────────────────────────────────────────────────────────────────── */
/*  4. LIVE ACTIVITY STREAM FEED (REALTIME AUDIT LOG)                         */
/* ────────────────────────────────────────────────────────────────────────── */

export const getLiveActivityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        limit: z.number().int().min(5).max(100).default(30),
        employeeId: z.string().optional(),
        filter: z.enum(["human", "system", "all"]).default("human"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const adminAny = await getAdminAny();

    // Fetch latest events from application_events, order_schedulers, activity_logs
    const [
      { data: appEvents },
      { data: schedulers },
      { data: activityLogs },
      { data: profiles },
    ] = await Promise.all([
      admin
        .from("application_events")
        .select("id, application_id, lead_id, event_type, old_value, new_value, note, staff_name, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(data.limit * 3),
      adminAny
        .from("order_schedulers")
        .select("id, application_id, status, scheduler_type, started_at, fires_at, remarks, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(data.limit * 3),
      admin
        .from("activity_logs")
        .select("id, activity_type, activity_description, application_id, lead_id, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(data.limit * 3),
      admin
        .from("profiles")
        .select("id, full_name, display_name, email"),
    ]);

    const profileMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    const nameToUserIdMap = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      if (p.full_name) nameToUserIdMap.set(p.full_name.toLowerCase().trim(), p.id);
    });

    const resolveStaffUserId = (raw?: string | null) => {
      if (!raw) return null;
      if (profileMap.has(raw)) return raw;
      if (nameToUserIdMap.has(raw.toLowerCase().trim())) return nameToUserIdMap.get(raw.toLowerCase().trim())!;
      return raw;
    };

    const canonicalEvents = normalizeOperationalEvents({
      appEvents: appEvents ?? [],
      schedulers: schedulers ?? [],
      activityLogs: activityLogs ?? [],
      profileMap,
      userRoleMap: new Map(),
      resolveStaffUserId,
    });

    let filtered = canonicalEvents;
    if (data.employeeId) {
      filtered = filtered.filter((e) => e.employeeId === data.employeeId);
    }

    if (data.filter === "human") {
      filtered = filtered.filter((e) => !e.isSystemAction);
    } else if (data.filter === "system") {
      filtered = filtered.filter((e) => e.isSystemAction);
    }

    const orderIds = Array.from(new Set(filtered.map((f) => f.orderId).filter(Boolean))) as string[];
    const orderCodeMap = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: codeRows } = await admin
        .from("applications")
        .select("id, application_code")
        .in("id", orderIds);
      (codeRows ?? []).forEach((r: any) => {
        if (r.application_code) orderCodeMap.set(r.id, r.application_code);
      });
    }

    return filtered.slice(0, data.limit).map((ev) => {
      const { actionLabel, details } = formatLogAction({
        action_type: ev.actionType,
        previous_status: ev.previousStatus,
        new_status: ev.newStatus,
        notes: ev.notes,
      });
      return {
        id: ev.id,
        time: formatTimeIST(ev.createdAt),
        employeeName: ev.employeeName,
        actionType: ev.actionType,
        actionText: actionLabel,
        orderId: ev.orderId,
        orderCode: ev.orderId ? (orderCodeMap.get(ev.orderId) || ev.orderId.slice(0, 8)) : "—",
        notes: details || ev.notes,
        createdAt: ev.createdAt,
        isSystemAction: ev.isSystemAction,
      };
    });
  });

/* ────────────────────────────────────────────────────────────────────────── */
/*  5. KPI METRIC DRILLDOWN (EXACT UNDERLYING ORDERS & ACTIONS)                */
/* ────────────────────────────────────────────────────────────────────────── */

export const getEmployeeMetricDrilldown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        employeeId: z.string().optional().nullable(),
        metric: z.enum([
          "assigned",
          "worked",
          "actions",
          "customerDelays",
          "technicalDelays",
          "hotOrders",
          "completed",
          "closed",
        ]),
        dateFilter: z
          .enum([
            "today",
            "yesterday",
            "7d",
            "15d",
            "30d",
            "this_month",
            "custom",
          ])
          .default("today"),
        customStart: z.string().optional(),
        customEnd: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await verifyAdminOrSuperAdmin(context.supabase, context.userId);
    const admin = await getAdmin();
    const adminAny = await getAdminAny();
    const dateRange = resolveDateRange(
      data.dateFilter,
      data.customStart,
      data.customEnd,
    );

    const [
      { data: appEvents },
      { data: schedulers },
      { data: activityLogs },
      { data: profiles },
    ] = await Promise.all([
      admin
        .from("application_events")
        .select("id, application_id, lead_id, event_type, old_value, new_value, note, staff_name, staff_role, created_at, created_by")
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(5000),
      adminAny
        .from("order_schedulers")
        .select("id, application_id, status, scheduler_type, started_at, fires_at, remarks, created_at, created_by")
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(5000),
      admin
        .from("activity_logs")
        .select("id, activity_type, activity_description, application_id, lead_id, created_at, user_id")
        .gte("created_at", dateRange.current.start)
        .lte("created_at", dateRange.current.end)
        .order("created_at", { ascending: false })
        .limit(5000),
      admin.from("profiles").select("id, full_name, display_name, email"),
    ]);

    const profileMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    const nameToUserIdMap = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      if (p.full_name) nameToUserIdMap.set(p.full_name.toLowerCase().trim(), p.id);
    });
    const resolveStaffUserId = (raw?: string | null) => (raw && profileMap.has(raw) ? raw : (raw && nameToUserIdMap.get(raw.toLowerCase().trim())) || raw || null);

    let canonicalEvents = normalizeOperationalEvents({
      appEvents: appEvents ?? [],
      schedulers: schedulers ?? [],
      activityLogs: activityLogs ?? [],
      profileMap,
      userRoleMap: new Map(),
      resolveStaffUserId,
    });

    if (data.employeeId) {
      canonicalEvents = canonicalEvents.filter((e) => e.employeeId === data.employeeId);
    }

    // Filter by Metric
    let filteredEvents = canonicalEvents;
    if (data.metric === "customerDelays") {
      filteredEvents = canonicalEvents.filter((e) => e.actionCategory === "customer_delay");
    } else if (data.metric === "technicalDelays") {
      filteredEvents = canonicalEvents.filter((e) => e.actionCategory === "technical_delay");
    } else if (data.metric === "hotOrders") {
      filteredEvents = canonicalEvents.filter((e) => e.actionCategory === "hot_order");
    } else if (data.metric === "completed") {
      filteredEvents = canonicalEvents.filter((e) => e.actionCategory === "completion");
    } else if (data.metric === "closed") {
      filteredEvents = canonicalEvents.filter((e) => e.actionCategory === "closure" && !e.isSystemAction);
    } else if (data.metric === "worked" || data.metric === "actions") {
      filteredEvents = canonicalEvents.filter((e) => !e.isSystemAction);
    }

    const appIds = Array.from(new Set(filteredEvents.map((e) => e.orderId).filter(Boolean))) as string[];

    const { data: apps } = appIds.length > 0
      ? await adminAny
          .from("applications")
          .select("id, application_code, customer_id, service_id, order_status, fulfillment_status")
          .in("id", appIds)
      : { data: [] as any[] };

    const rawApps = (apps ?? []) as any[];
    const custIds = Array.from(new Set(rawApps.map((a) => a.customer_id).filter(Boolean))) as string[];
    const svcIds = Array.from(new Set(rawApps.map((a) => a.service_id).filter(Boolean))) as string[];

    const [{ data: customers }, { data: services }] = await Promise.all([
      custIds.length ? admin.from("customers").select("id, name, primary_mobile").in("id", custIds) : { data: [] as any[] },
      svcIds.length ? admin.from("services").select("id, service_name").in("id", svcIds) : { data: [] as any[] },
    ]);

    const appMap = new Map(rawApps.map((a) => [a.id, a]));
    const customerMap = new Map(((customers ?? []) as any[]).map((c) => [c.id, c]));
    const serviceMap = new Map(((services ?? []) as any[]).map((s) => [s.id, s.service_name]));

    return filteredEvents.map((ev) => {
      const app = ev.orderId ? appMap.get(ev.orderId) : null;
      const cust = app?.customer_id ? customerMap.get(app.customer_id) : null;
      const serviceName = app?.service_id ? serviceMap.get(app.service_id) : "—";
      const { actionLabel, details } = formatLogAction({
        action_type: ev.actionType,
        previous_status: ev.previousStatus,
        new_status: ev.newStatus,
        notes: ev.notes,
      });

      return {
        id: ev.id,
        orderId: ev.orderId,
        orderCode: app?.application_code || ev.orderId?.slice(0, 8) || "—",
        customerName: cust?.name || "Customer",
        customerMobile: cust?.primary_mobile || "—",
        serviceName,
        employeeName: ev.employeeName,
        action: actionLabel,
        notes: details || ev.notes,
        timestamp: formatTimeIST(ev.createdAt),
        createdAt: ev.createdAt,
        currentStatus: app?.order_status || "—",
        currentStage: app?.fulfillment_status || "—",
      };
    });
  });
