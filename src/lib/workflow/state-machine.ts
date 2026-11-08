// Pure, client-safe state machine. Given a current state + event, returns the
// next state plus a list of side-effects for the server dispatcher to execute.
// No I/O, no supabase. Unit-testable.

import type { WorkflowEvent, WorkflowStage, WorkflowStatus } from "./events";

export interface WorkflowState {
  stage: WorkflowStage;
  status: WorkflowStatus;
  subStatus?: string | null;
  paused: boolean;
  pauseReason?: string | null;
  activeTicketId?: string | null;
  assignedTo?: string | null;
}

export type TimerKind = "incomplete_form" | "closure" | "reminder" | "custom";
export type AutomationCode = "incomplete_form_flow" | "closure_flow" | "gov_reminder_flow";

export type SideEffect =
  | { kind: "start_timer"; timer: TimerKind; inMinutes: number; dedupKey?: string; payload?: Record<string, unknown> }
  | { kind: "cancel_timers"; timers: TimerKind[] }
  | { kind: "pause_timers"; timers: TimerKind[] }
  | { kind: "resume_timers"; timers: TimerKind[] }
  | { kind: "start_automation"; code: AutomationCode; context?: Record<string, unknown> }
  | { kind: "stop_automation"; code: AutomationCode }
  | { kind: "pause_automation"; code: AutomationCode }
  | { kind: "resume_automation"; code: AutomationCode }
  | { kind: "send_email"; template: string; payload?: Record<string, unknown> }
  | { kind: "record_event"; title: string; detail?: string; icon?: string; category?: string };

export interface Transition {
  next: WorkflowState;
  effects: SideEffect[];
  title: string;
  category: "system" | "customer" | "employee" | "government" | "email" | "automation";
  icon?: string;
}

export function initialState(assignedTo?: string | null): WorkflowState {
  return {
    stage: "payment_successful",
    status: "not_started",
    paused: false,
    assignedTo: assignedTo ?? null,
  };
}

const CLOSURE_MINUTES = 8 * 60;
const FORM_NUDGE_MINUTES = 5;

export function reduce(state: WorkflowState, event: WorkflowEvent): Transition {
  switch (event.type) {
    case "OrderCreated":
      return {
        next: { ...state, stage: "payment_successful", status: "not_started", assignedTo: event.assignedTo ?? state.assignedTo },
        effects: [
          { kind: "start_automation", code: "incomplete_form_flow" },
          { kind: "start_timer", timer: "incomplete_form", inMinutes: FORM_NUDGE_MINUTES, dedupKey: "initial" },
        ],
        title: "Order created",
        category: "system",
        icon: "sparkles",
      };

    case "PaymentReceived":
      return { next: state, effects: [], title: `Payment received ₹${event.amount}`, category: "customer", icon: "credit-card" };

    case "InvoiceGenerated":
      return { next: state, effects: [], title: `Invoice ${event.invoiceNumber} generated`, category: "system", icon: "file-text" };

    case "WelcomeEmailSent":
      return { next: state, effects: [], title: "Welcome email sent", category: "email", icon: "mail" };

    case "FormLinkSent":
      return { next: { ...state, stage: "form", status: "not_started" }, effects: [], title: `Form link sent via ${event.channel}`, category: "email", icon: "link" };

    case "FormOpened":
      return { next: state, effects: [], title: "Customer opened form", category: "customer", icon: "eye" };

    case "FormSubmitted":
      return {
        next: { ...state, stage: "verification", status: "verification_pending", paused: false, pauseReason: null },
        effects: [
          { kind: "cancel_timers", timers: ["incomplete_form", "closure"] },
          { kind: "stop_automation", code: "incomplete_form_flow" },
        ],
        title: "Form submitted → verification pending",
        category: "customer",
        icon: "check-circle",
      };

    case "FormTimeout5m":
      return {
        next: { ...state, stage: "form", status: "waiting_customer" },
        effects: [
          { kind: "send_email", template: "incomplete_information", payload: { resumeLink: true } },
          { kind: "start_timer", timer: "closure", inMinutes: CLOSURE_MINUTES, dedupKey: "form_closure" },
          { kind: "record_event", title: "Incomplete information email sent", icon: "mail", category: "email" },
        ],
        title: "Form not submitted in 5 minutes",
        category: "automation",
        icon: "clock",
      };

    case "FormTimeout8h":
    case "ClosureTimerFired":
      return {
        next: { ...state, stage: "closed", status: "closed", paused: false },
        effects: [
          { kind: "send_email", template: "closure_final" },
          { kind: "stop_automation", code: "incomplete_form_flow" },
          { kind: "stop_automation", code: "closure_flow" },
        ],
        title: "Order closed automatically",
        category: "automation",
        icon: "x-circle",
      };

    case "DelayReasonSet": {
      if (event.kind === "customer_side") {
        return {
          next: { ...state, status: "waiting_customer" },
          effects: [
            { kind: "start_automation", code: "closure_flow", context: { reasonCode: event.reasonCode } },
            { kind: "send_email", template: "closure_intimation" },
            { kind: "start_timer", timer: "closure", inMinutes: CLOSURE_MINUTES, dedupKey: `delay_${event.reasonCode}` },
          ],
          title: `Customer-side delay: ${event.reasonCode}`,
          category: "employee",
          icon: "alert-triangle",
        };
      }
      return {
        next: { ...state, status: "under_process", subStatus: "our_side_delay" },
        effects: [
          { kind: "start_automation", code: "gov_reminder_flow", context: { reasonCode: event.reasonCode } },
          { kind: "send_email", template: "gov_delay_notification" },
          { kind: "start_timer", timer: "reminder", inMinutes: 120, dedupKey: "gov_reminder" },
        ],
        title: `Our-side delay: ${event.reasonCode}`,
        category: "employee",
        icon: "server",
      };
    }

    case "CustomerEmailReceived":
      return {
        next: { ...state, paused: true, pauseReason: "ticket_open", activeTicketId: event.ticketId },
        effects: [
          { kind: "pause_timers", timers: ["closure", "reminder", "incomplete_form"] },
          { kind: "pause_automation", code: "closure_flow" },
          { kind: "pause_automation", code: "incomplete_form_flow" },
        ],
        title: "Customer replied → workflow paused",
        category: "customer",
        icon: "message-square",
      };

    case "TicketOpened":
      return { next: { ...state, activeTicketId: event.ticketId }, effects: [], title: "Ticket opened", category: "system", icon: "life-buoy" };

    case "TicketReplied":
      return { next: state, effects: [], title: "Ticket reply", category: "employee", icon: "reply" };

    case "TicketClosed": {
      if (event.outcome === "cooperating") {
        return {
          next: { ...state, paused: false, pauseReason: null, activeTicketId: null },
          effects: [
            { kind: "resume_timers", timers: ["closure", "reminder", "incomplete_form"] },
            { kind: "resume_automation", code: "closure_flow" },
            { kind: "resume_automation", code: "incomplete_form_flow" },
          ],
          title: "Ticket closed — workflow resumed",
          category: "employee",
          icon: "play",
        };
      }
      // not cooperating → continue closure immediately
      return {
        next: { ...state, paused: false, pauseReason: null, activeTicketId: null, stage: "closed", status: "closed" },
        effects: [
          { kind: "send_email", template: "closure_final" },
          { kind: "stop_automation", code: "closure_flow" },
          { kind: "stop_automation", code: "incomplete_form_flow" },
          { kind: "cancel_timers", timers: ["closure", "reminder", "incomplete_form"] },
        ],
        title: "Ticket closed — order closed",
        category: "employee",
        icon: "x-circle",
      };
    }

    case "WorkflowResumed":
      return {
        next: { ...state, paused: false, pauseReason: null },
        effects: [
          { kind: "resume_timers", timers: ["closure", "reminder", "incomplete_form"] },
          { kind: "resume_automation", code: "closure_flow" },
          { kind: "resume_automation", code: "incomplete_form_flow" },
        ],
        title: "Workflow resumed by employee",
        category: "employee",
        icon: "play",
      };

    case "VerificationStarted":
      return { next: { ...state, stage: "verification", status: "verification_pending" }, effects: [], title: "Verification started", category: "employee", icon: "shield" };

    case "VerificationCompleted":
      return {
        next: { ...state, stage: "government_portal", status: "upload_pending" },
        effects: [{ kind: "cancel_timers", timers: ["closure"] }, { kind: "stop_automation", code: "closure_flow" }],
        title: "Verification completed → government portal",
        category: "employee",
        icon: "shield-check",
      };

    case "GovUploadPending":
      return { next: { ...state, stage: "government_portal", status: "upload_pending" }, effects: [], title: "Awaiting government upload", category: "system", icon: "upload" };

    case "GovUploaded":
      return { next: { ...state, stage: "government_portal", status: "under_process" }, effects: [], title: "Application uploaded to government portal", category: "employee", icon: "upload-cloud" };

    case "GovApproved":
      return { next: { ...state, stage: "government_portal", status: "approved" }, effects: [{ kind: "stop_automation", code: "gov_reminder_flow" }, { kind: "cancel_timers", timers: ["reminder"] }], title: "Government approved", category: "government", icon: "check" };

    case "GovRejected":
      return {
        next: { ...state, stage: "closed", status: "rejected" },
        effects: [
          { kind: "send_email", template: "gov_rejection" },
          { kind: "stop_automation", code: "gov_reminder_flow" },
          { kind: "cancel_timers", timers: ["reminder"] },
        ],
        title: `Government rejected: ${event.reason}`,
        category: "government",
        icon: "x",
      };

    case "CertificateUploaded":
      return {
        next: { ...state, stage: "completed", status: "completed" },
        effects: [
          { kind: "send_email", template: "order_completed" },
          { kind: "stop_automation", code: "gov_reminder_flow" },
          { kind: "cancel_timers", timers: ["reminder", "closure", "incomplete_form"] },
        ],
        title: "Certificate uploaded — order completed",
        category: "employee",
        icon: "award",
      };

    case "ReminderScheduled":
      return {
        next: state,
        effects: [{ kind: "start_timer", timer: "reminder", inMinutes: event.everyMinutes, dedupKey: "gov_reminder", payload: { every: event.everyMinutes } }],
        title: `Reminder every ${event.everyMinutes} min`,
        category: "employee",
        icon: "bell",
      };

    case "ReminderFired":
      return {
        next: state,
        effects: [{ kind: "start_timer", timer: "reminder", inMinutes: 120, dedupKey: "gov_reminder" }],
        title: "Reminder triggered",
        category: "automation",
        icon: "bell-ring",
      };

    case "OrderClosed":
      return {
        next: { ...state, stage: "closed", status: "closed" },
        effects: [
          { kind: "stop_automation", code: "closure_flow" },
          { kind: "stop_automation", code: "incomplete_form_flow" },
          { kind: "stop_automation", code: "gov_reminder_flow" },
          { kind: "cancel_timers", timers: ["closure", "reminder", "incomplete_form"] },
        ],
        title: `Order closed: ${event.reason}`,
        category: "system",
        icon: "x-circle",
      };
  }
}
