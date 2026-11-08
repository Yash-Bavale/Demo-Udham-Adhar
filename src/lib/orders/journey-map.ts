// Single source of truth for the journey-map stage flow S01–S12 and
// button gating B01–B10. Pure config — no React, no side effects.
//
// Button-to-action mapping (v2):
//   B01 — Send Form Link / Reminder   (E002)
//   B02 — Technical Delay              (E003)
//   B03 — Issue Resolved               (E011)
//   B04 — Customer Side Delay          (E004)
//   B05 — Application Submitted to Govt(E005)
//   B06 — Consultation Completed       (E005)
//   B07 — Government Accepted          (E007)
//   B08 — Government Rejected          (E008)
//   B09 — Admin Override Enable
//   B10 — Admin Override Disable

import type { OrderStage } from "@/lib/crm/computeOrderStage";

export type JourneyStageKey =
  | "lead_received"
  | "payment_received"
  | "order_received"
  | "form_submitted"
  | "app_submitted"
  | "check_status"
  | "completed";

export interface JourneyStageDef {
  key: JourneyStageKey;
  label: string;
  short: string;
}

export const JOURNEY_STAGES: JourneyStageDef[] = [
  { key: "lead_received",     label: "Lead Received",              short: "Lead" },
  { key: "payment_received",  label: "Payment Received",           short: "Payment" },
  { key: "order_received",    label: "Incomplete Form",            short: "Order" },
  { key: "form_submitted",    label: "Form Submitted",             short: "Form" },
  { key: "app_submitted",     label: "Application Submitted to Govt", short: "Govt Portal" },
  { key: "check_status",      label: "Check Final Status on Govt", short: "Final Status" },
  { key: "completed",         label: "Order Completed",            short: "Completed" },
];

/** Map current OrderStage → happy-path stage index for highlighting.
 * Note: once payment is successful the order automatically advances to
 * "Order Received" (index 2). "Payment Received" (index 1) is only ever
 * the live stage while payment is still pending. */
export function stageToJourneyIndex(stage: OrderStage): number {
  switch (stage) {
    case "lead_received":
      return 0;
    case "payment_pending":
      return 1;
    case "payment_done":
    case "form_not_submitted":
    case "consultation_pending":
      return 2;
    case "consultation_completed":
      return 4;
    case "form_submitted":
    case "order_reopened":
    case "customer_delay":
    case "technical_delay":
    case "in_progress":
    case "under_review":
      return 3;
    case "submitted_to_govt":
      return 4;
    case "under_processing":
    case "certificate_ready":
      return 5;
    case "completed":
      return 6;
    default:
      return 2; // order_received default
  }
}


export type JourneyTrack = "main" | "delay" | "closure" | "ticket";

export interface JourneyBranch {
  key: string;
  parentStage: JourneyStageKey;
  track: JourneyTrack;
  title: string;
  tone: "amber" | "rose" | "sky" | "violet" | "emerald";
  description: string;
  buttons: JourneyBranchButton[];
}


export interface JourneyBranchButton {
  key: string;
  label: string;
  emailCode: string;             // E001…E011, T001…T003, R001
  action: JourneyActionKind;
  reasonCategory?: "A" | "B" | "C";
  variant?: "primary" | "outline" | "danger" | "success";
  serviceOnly?: "talk_to_expert"; // hide unless order's service matches
}

export type JourneyActionKind =
  | "send_form_link"           // B01 → E002
  | "customer_delay"           // B04 → E004 + Cat A picker
  | "technical_delay"          // B02 → E003 + Cat B picker
  | "technical_resolved"       // B03 → E011
  | "submit_to_govt"           // B05 → E005
  | "consultation_completed"   // B06 → E005
  | "govt_accepted"            // B07 → E007 + Upload PDF
  | "govt_rejected"            // B08 → E008 + Cat B picker
  | "reminder_e006"            // E006 + employee reminder
  | "talk_to_expert_done"      // E009
  | "force_close"              // E010 + Cat A picker
  | "admin_override_enable"    // B09
  | "admin_override_disable"   // B10
  | "ticket_normal_close"      // T001 normal
  | "ticket_restart_order"     // T001 restart
  | "ticket_consultation_done" // T001 consultation
  | "ticket_reply_reason";     // T002 → T003 8h auto-close

export const JOURNEY_BRANCHES: JourneyBranch[] = [
  {
    key: "form-not-submitted",
    track: "delay",
    parentStage: "order_received",
    title: "Form Not Submitted Delay",
    tone: "amber",
    description:
      "Send E002 → arms 8-hour auto-close with reason A7 (Required Documents or Communication Not Received).",
    buttons: [
      {
        key: "e002",
        label: "Send Form Link / Reminder",
        emailCode: "E002",
        action: "send_form_link",
        variant: "primary",
      },
    ],
  },
  {
    key: "customer-side-delay",
    track: "delay",
    parentStage: "form_submitted",
    title: "Customer-Side Delay",
    tone: "amber",
    description: "Pick a Category A reason. Sends E004 with the standard reply.",
    buttons: [
      {
        key: "e004",
        label: "Send E004 (Customer Delay)",
        emailCode: "E004",
        action: "customer_delay",
        reasonCategory: "A",
        variant: "outline",
      },
    ],
  },
  {
    key: "technical-delay",
    track: "delay",
    parentStage: "form_submitted",
    title: "Technical / External Delay",
    tone: "sky",
    description: "Pick a Category B reason. Sends E003 with the standard reply.",
    buttons: [
      {
        key: "e003",
        label: "Send E003 (Technical Delay)",
        emailCode: "E003",
        action: "technical_delay",
        reasonCategory: "B",
        variant: "outline",
      },
    ],
  },
  {
    key: "app-submitted-actions",
    track: "main",
    parentStage: "app_submitted",
    title: "After Application Submitted to Govt",
    tone: "violet",
    description:
      "Application submitted to government portal. Awaiting consultation completion.",
    buttons: [
      {
        key: "e005-submit",
        label: "Send E005 — Application Submitted",
        emailCode: "E005",
        action: "submit_to_govt",
        variant: "success",
      },
      {
        key: "e005-consult",
        label: "Send E005 — Consultation Completed",
        emailCode: "E005",
        action: "consultation_completed",
        variant: "success",
      },
    ],
  },
  {
    key: "final-status-actions",
    track: "main",
    parentStage: "check_status",
    title: "Check Final Application Status",
    tone: "emerald",
    description: "Final outcome from the govt portal.",
    buttons: [
      {
        key: "e007",
        label: "E007 — Accepted + Attach PDF",
        emailCode: "E007",
        action: "govt_accepted",
        variant: "success",
      },
      {
        key: "e008",
        label: "E008 — Application Rejected",
        emailCode: "E008",
        action: "govt_rejected",
        reasonCategory: "B",
        variant: "danger",
      },
    ],
  },
  {
    key: "talk-to-expert",
    track: "main",
    parentStage: "completed",
    title: "Talk-to-Expert Service",
    tone: "violet",
    description: "Only shown for orders whose service = Talk to Expert.",
    buttons: [
      {
        key: "e009",
        label: "E009 — Consultation Completed",
        emailCode: "E009",
        action: "talk_to_expert_done",
        variant: "success",
        serviceOnly: "talk_to_expert",
      },
    ],
  },
];

export const FORCE_CLOSE_BUTTON: JourneyBranchButton = {
  key: "force-close",
  label: "Force Close (E010)",
  emailCode: "E010",
  action: "force_close",
  reasonCategory: "A",
  variant: "danger",
};

export const TICKET_BUTTONS: JourneyBranchButton[] = [
  {
    key: "t001-normal",
    label: "T001 — Normal Close / No Action",
    emailCode: "T001",
    action: "ticket_normal_close",
    variant: "outline",
  },
  {
    key: "t001-restart",
    label: "T001 — Restart Order",
    emailCode: "T001",
    action: "ticket_restart_order",
    variant: "outline",
  },
  {
    key: "t001-consult",
    label: "T001 — Consultation / Support Completed",
    emailCode: "T001",
    action: "ticket_consultation_done",
    variant: "success",
  },
  {
    key: "t002-reason",
    label: "T002 — Reply w/ Reason (8h auto-close)",
    emailCode: "T002",
    action: "ticket_reply_reason",
    reasonCategory: "A",
    variant: "danger",
  },
];

/** Closure-track buttons (E008 govt reject, T002 reply-reason). Force-close
 * is exported separately because it's the always-visible red button. */
export const CLOSURE_BUTTONS: JourneyBranchButton[] = [
  {
    key: "e008-closure",
    label: "E008 — Application Rejected (Close)",
    emailCode: "E008",
    action: "govt_rejected",
    reasonCategory: "B",
    variant: "danger",
  },
  {
    key: "t002-closure",
    label: "T002 — Reply w/ Reason (8h auto-close)",
    emailCode: "T002",
    action: "ticket_reply_reason",
    reasonCategory: "A",
    variant: "outline",
  },
];

/** Map workflowStatus → live delay branch key (for highlighting). */
export function getActiveDelayBranchKey(workflowStatus?: string | null): string | null {
  if (!workflowStatus) return null;
  if (/customer_hold|customer_side|customer_delay|waiting_for_customer|external_dependency/i.test(workflowStatus)) return "customer-side-delay";
  if (/technical_hold|external_delay|govt_delay|technical_delay|government_portal_pending/i.test(workflowStatus)) return "technical-delay";
  if (/form_pending|awaiting_form|form_not_submitted/i.test(workflowStatus)) return "form-not-submitted";
  return null;
}

/* ─────────────────────── Live-state derivation ─────────────────────── */

export type JourneyLiveSubKey =
  | "form-not-submitted"
  | "technical-delay"
  | "customer-delay"
  | "govt-awaiting"
  | "govt-rejected"
  | "force-closed"
  | null;

export interface JourneyLiveState {
  currentMainIndex: number;
  activeSubKey: JourneyLiveSubKey;
  terminal: "completed" | "closed" | null;
  reasonCode: string | null;
  subStateLabel: string;
}

export function deriveJourneyLiveState(input: {
  stage: OrderStage;
  workflowStatus?: string | null;
  closureStage?: string | null;
  closureReasonLabel?: string | null;
  formSubmittedAt?: string | null;
  fulfillmentStatus?: string | null;
}): JourneyLiveState {
  const isReopened = input.stage === "order_reopened" || input.fulfillmentStatus === "order_reopened" || input.workflowStatus === "order_reopened";
  const closureStageValue = (input.closureStage ?? "").toLowerCase();
  const isClosed = !isReopened && (input.stage === "closed" || /^(closed|auto_closed|force_closed|order_closed)$/.test(closureStageValue));
  const isConsultationCompleted = input.stage === "consultation_completed";
  const isCompleted = !isReopened && (input.stage === "completed" || isConsultationCompleted);
  const ws = (input.workflowStatus ?? "").toLowerCase();
  const fs = (input.fulfillmentStatus ?? "").toLowerCase();

  const reasonMatch = (input.closureReasonLabel ?? "").match(/\b([ABC]\d{1,2}|RM\d{1,2}|R\d{1,2})\b/i);
  const reasonCode = reasonMatch ? reasonMatch[1].toUpperCase() : null;

  let idx = stageToJourneyIndex(input.stage);
  if (isClosed) {
    if (/consultation/.test(fs) || /consultation/.test(ws)) {
      idx = 4;
    } else if (/submitted_to_govt|government_processing|under_processing|certificate/.test(fs) || /submitted_to_govt|government_processing/.test(ws)) {
      idx = 4;
    } else if (input.formSubmittedAt || /form_submitted|in_progress|under_review|customer_delay|technical_delay/.test(fs) || /form_submitted|customer_delay|technical_delay/.test(ws)) {
      idx = 3;
    } else if (reasonCode === "RM02" || reasonCode === "RM01" || /form_pending_autoclose|form_not_submitted_autoclose/.test(ws)) {
      idx = 2;
    } else {
      idx = 3;
    }
  }

  let activeSubKey: JourneyLiveSubKey = null;
  if (isReopened) {
    activeSubKey = null;
  } else if (isConsultationCompleted) {
    activeSubKey = null;
  } else if (/form_pending|awaiting_form|form_not_submitted/.test(ws) || (idx === 2 && !ws && !isClosed)) {
    activeSubKey = "form-not-submitted";
  } else if (/customer_hold|customer_side|customer_delay|waiting_for_customer|external_dependency/.test(ws) || input.stage === "customer_delay") {
    activeSubKey = "customer-delay";
  } else if (/technical_hold|external_delay|govt_delay|technical_delay|government_portal_pending/.test(ws) || input.stage === "technical_delay") {
    activeSubKey = "technical-delay";
  } else if (idx === 4 || idx === 5) {
    activeSubKey = "govt-awaiting";
  }

  if (isClosed) {
    if (reasonCode?.startsWith("B") || /govt_reject|rejected/i.test(ws)) {
      activeSubKey = "govt-rejected";
    } else if (reasonCode === "RM02" || reasonCode === "RM01" || /form_pending_autoclose|form_not_submitted_autoclose/.test(ws)) {
      activeSubKey = "form-not-submitted";
    } else {
      activeSubKey = "customer-delay";
    }
  }

  let subStateLabel = "In progress";
  if (isClosed) {
    if (activeSubKey === "govt-rejected") {
      subStateLabel = `Closed (Govt Rejected)${reasonCode ? ` · ${reasonCode}` : ""}`;
    } else if (activeSubKey === "form-not-submitted") {
      subStateLabel = `Closed (Form Not Submitted Delay)${reasonCode ? ` · ${reasonCode}` : ""}`;
    } else if (activeSubKey === "customer-delay" || reasonCode?.startsWith("A") || reasonCode?.startsWith("C")) {
      subStateLabel = `Closed (Customer Delay)${reasonCode ? ` · ${reasonCode}` : ""}`;
    } else {
      subStateLabel = `Closed${reasonCode ? ` · ${reasonCode}` : ""}`;
    }
  } else if (isReopened) {
    subStateLabel = "Order Reopened";
  } else if (isConsultationCompleted) {
    subStateLabel = "Order Completed";
  } else if (activeSubKey === "form-not-submitted") {
    subStateLabel = "Form Not Submitted Delay";
  } else if (activeSubKey === "customer-delay") {
    subStateLabel = `Customer Delay${reasonCode ? ` (${reasonCode})` : ""}`;
  } else if (activeSubKey === "technical-delay") {
    subStateLabel = `Technical Delay${reasonCode ? ` (${reasonCode})` : ""}`;
  } else if (activeSubKey === "govt-awaiting") {
    subStateLabel = "Awaiting Govt Response";
  } else if (isCompleted) {
    subStateLabel = "Completed";
  }

  return {
    currentMainIndex: idx,
    activeSubKey,
    terminal: isClosed ? "closed" : isCompleted ? "completed" : null,
    reasonCode,
    subStateLabel,
  };
}



/* ─────────────────── Journey Phase → Button gating ─────────────────── */

export type ButtonCode =
  | "B01" | "B02" | "B03" | "B04" | "B05"
  | "B06" | "B07" | "B08" | "B09" | "B10";

export type JourneyPhase =
  | "form_not_submitted"     // S02 — B01 active
  | "form_link_sent"         // S03 — waiting for customer submission
  | "form_submitted"         // S04 — B02, B04, B05, B06, B07, B08
  | "technical_delay"        // S05 — B03 only
  | "post_b03_resume"        // S04 after tech delay resolved — B04, B05, B06, B07, B08
  | "customer_delay"         // S06 — no buttons (waiting state)
  | "govt_processing"        // S07 — B04, B05, B06, B07, B08
  | "consultation_done"      // S08 — B07, B08
  | "application_approved"   // S09 — no buttons (completion action)
  | "application_rejected"   // S10 — B07, B08 (can correct)
  | "completed"              // S11 — no buttons
  | "closed"                 // S12 — no buttons
  | "admin_override";        // All buttons active

/**
 * Phase → enabled buttons mapping. This is the core gating table that
 * mirrors the user's reference chart.
 *
 * New B-code meanings (v2):
 *   B04 = Customer Side Delay (was B10)
 *   B05 = Submit to Govt (was B04)
 *   B06 = Consultation Completed (was B07)
 *   B07 = Govt Accepted (was B08)
 *   B08 = Govt Rejected (was B09)
 *   B09 = Admin Override Enable
 *   B10 = Admin Override Disable
 */
export const PHASE_ENABLED_BUTTONS: Record<JourneyPhase, ButtonCode[]> = {
  form_not_submitted:   ["B01"],
  form_link_sent:       [],                                            // S03: waiting
  form_submitted:       ["B02", "B04", "B05", "B06", "B07", "B08"],    // S04
  technical_delay:      ["B03"],                                       // S05
  post_b03_resume:      ["B04", "B05", "B06", "B07", "B08"],           // S04 post-tech-fix
  customer_delay:       ["B04"],                                       // S06: B04 acts as "Resume Order" → S04
  govt_processing:      ["B04", "B06", "B07", "B08"],                  // S07 (B05 already sent)
  consultation_done:    ["B07", "B08"],                                // S08
  application_approved: ["B07"],                                       // S09
  application_rejected: ["B07", "B08"],                                // S10
  completed:            [],                                            // S11
  closed:               [],                                            // S12
  admin_override:       ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"],
};


export interface DerivePhaseInput {
  stage: OrderStage;
  workflowStatus?: string | null;
  closureStage?: string | null;
  closureReasonLabel?: string | null;
  formSubmittedAt?: string | null;
  fulfillmentStatus?: string | null;
  /** Number of E006 (reminder) emails/events sent for this order. */
  reminderCount?: number;
  /** True once B01 has been sent and we're still waiting for the customer. */
  formLinkSent?: boolean;
  /** True once B03 has resumed from a technical delay (until govt flow advances). */
  techDelayResolved?: boolean;
  /** True once the admin override (B09) is active. */
  adminOverride?: boolean;
}

/**
 * Map current order state → single JourneyPhase used to gate buttons.
 * Pure. Client-safe.
 */
export function derivePhase(i: DerivePhaseInput): JourneyPhase {
  // Admin override trumps everything
  if (i.adminOverride) return "admin_override";

  // S08 Consultation Completed is a terminal-completed state that still
  // exposes B07/B08 follow-ups — keep the phase distinct from the generic
  // `completed` phase (which disables all buttons).
  if (i.stage === "consultation_completed") return "consultation_done";

  const live = deriveJourneyLiveState({
    stage: i.stage,
    workflowStatus: i.workflowStatus,
    closureStage: i.closureStage,
    closureReasonLabel: i.closureReasonLabel,
    formSubmittedAt: i.formSubmittedAt,
    fulfillmentStatus: i.fulfillmentStatus,
  });
  if (live.terminal === "closed") {
    if (live.activeSubKey === "govt-rejected") {
      return "application_rejected";
    }
    return "closed";
  }
  if (live.terminal === "completed") return "completed";

  if (live.activeSubKey === "technical-delay") return "technical_delay";
  if (live.activeSubKey === "customer-delay") return "customer_delay";
  if (live.activeSubKey === "form-not-submitted") {
    return i.formLinkSent ? "form_link_sent" : "form_not_submitted";
  }

  const stage = (i.stage ?? "").toLowerCase();
  const fulfillment = (i.workflowStatus ?? "").toLowerCase();

  // S09 Application Approved
  if (fulfillment === "application_approved" || fulfillment === "application_accepted") {
    return "application_approved";
  }
  // S10 Application Rejected
  if (fulfillment === "application_rejected" || fulfillment === "certificate_rejected") {
    return "application_rejected";
  }

  const inGovtFlow = /submitted_to_govt|government_processing|processing|certificate|check|final|consultation_completed/.test(stage);

  if (inGovtFlow) {
    // S08 Consultation Completed
    if (fulfillment === "consultation_completed" || /consultation_completed|consultation_done/.test(fulfillment)) {
      return "consultation_done";
    }
    // S07 Government Processing
    return "govt_processing";
  }

  if (i.techDelayResolved) return "post_b03_resume";
  return "form_submitted";
}



