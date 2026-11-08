/**
 * Single source of truth for the Order Workspace:
 *   • QUICK_ACTIONS      — header tiles (Call / WhatsApp / Email / Open Lead / Print / Copy)
 *   • STATUS_ACTIONS     — status-driven employee action buttons
 *   • TAB_AVAILABILITY   — which workspace tabs are usable in a given status
 *   • NEXT_STEP_HINT     — one-line "what to do next" copy per status
 *
 * WorkspaceShell + EmployeeActionPanel + TabStatusHeader all read from here.
 * Any change to what an employee can do in a given status lives in this file.
 */
import {
  Phone,
  MessageCircle,
  Mail,
  User2,
  Printer,
  Send,
  PlayCircle,
  PauseCircle,
  Timer,
  Landmark,
  Award,
  CheckCircle2,
  BadgeDollarSign,
  RotateCcw,
  XCircle,
  Bell,
  type LucideIcon,
} from "lucide-react";

import type { OrderStatus } from "@/lib/orders/order-status.functions";

// ─────────────────────────── QUICK ACTIONS ───────────────────────────

export type QuickActionKey = "call" | "whatsapp" | "email" | "open_lead" | "print";

export type QuickTint = "emerald" | "sky" | "violet" | "slate";

export interface QuickActionCtx {
  mobile: string | null;
  email: string | null;
  leadId: string | null;
  waUrl: string | null;
  applicationCode: string;
}

export interface QuickActionSpec {
  key: QuickActionKey;
  label: string;
  /** 1-line hover tooltip explaining what this button does. */
  tooltip: string;
  icon: LucideIcon;
  tint: QuickTint;
  /** Build the runtime bits (href / disabled reason / toast messages) for a specific order. */
  build: (ctx: QuickActionCtx) => {
    href?: string | null;
    to?: string | null;
    external?: boolean;
    disabledReason?: string | null;
    /** Info toast shown on click (for external launches). */
    toastInfo?: string;
    /** Success toast (for system actions like print / copy). */
    toastSuccess?: string;
  };
}

export const QUICK_ACTIONS: QuickActionSpec[] = [
  {
    key: "call",
    label: "Call",
    tooltip: "Dial the customer's mobile number",
    icon: Phone,
    tint: "emerald",
    build: ({ mobile }) => ({
      href: mobile ? `tel:${mobile}` : null,
      disabledReason: mobile ? null : "No mobile number on file",
      toastInfo: mobile ? `Opening dialer for ${mobile}` : undefined,
    }),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    tooltip: "Open WhatsApp chat with the customer",
    icon: MessageCircle,
    tint: "emerald",
    build: ({ waUrl }) => ({
      href: waUrl,
      external: true,
      disabledReason: waUrl ? null : "No mobile number on file",
      toastInfo: waUrl ? "Opening WhatsApp…" : undefined,
    }),
  },
  {
    key: "email",
    label: "Email",
    tooltip: "Compose a new email to the customer",
    icon: Mail,
    tint: "sky",
    build: ({ email }) => ({
      href: email ? `mailto:${email}` : null,
      disabledReason: email ? null : "No email on file",
      toastInfo: email ? "Opening mail client…" : undefined,
    }),
  },
  {
    key: "open_lead",
    label: "Open Lead",
    tooltip: "Jump to the source lead for this order",
    icon: User2,
    tint: "violet",
    build: ({ leadId }) => ({
      to: leadId ? `/admin/leads/${leadId}` : null,
      disabledReason: leadId ? null : "No lead linked to this order",
      toastInfo: leadId ? "Opening lead…" : undefined,
    }),
  },
  {
    key: "print",
    label: "Print",
    tooltip: "Print this order page",
    icon: Printer,
    tint: "slate",
    build: () => ({ toastSuccess: "Print dialog opened" }),
  },
];

// ─────────────────────────── STATUS ACTIONS ───────────────────────────

export type StatusActionKey =
  | "send_form_link"
  | "manual_reminder"
  | "customer_delay"
  | "our_delay"
  | "start_processing"
  | "submitted_to_govt"
  | "certificate_issued"
  | "complete"
  | "request_refund"
  | "reopen"
  | "close_manual";

export interface StatusActionMeta {
  label: string;
  /** 1-line hover tooltip explaining the button. */
  tooltip: string;
  icon: LucideIcon;
  tone: "primary" | "warn" | "danger" | "muted";
}

export const STATUS_ACTION_META: Record<StatusActionKey, StatusActionMeta> = {
  send_form_link: { label: "Send / Resend Form Link", tooltip: "Email the customer their info-collection form link", icon: Send, tone: "primary" },
  manual_reminder: { label: "Send Manual Reminder", tooltip: "Nudge the customer to submit pending info", icon: Bell, tone: "muted" },
  customer_delay: { label: "Customer-Side Delay", tooltip: "Mark delay caused by customer (no info / no reply)", icon: PauseCircle, tone: "warn" },
  our_delay: { label: "Our-Side Delay", tooltip: "Mark delay caused by our team or a dependency", icon: Timer, tone: "warn" },
  start_processing: { label: "Start Processing", tooltip: "Begin working the application", icon: PlayCircle, tone: "primary" },
  submitted_to_govt: { label: "Mark Submitted to Govt", tooltip: "Application filed on the government portal", icon: Landmark, tone: "primary" },
  certificate_issued: { label: "Mark Certificate Issued", tooltip: "Government certificate has been received", icon: Award, tone: "primary" },
  complete: { label: "Complete Order", tooltip: "Close order and notify the customer", icon: CheckCircle2, tone: "primary" },
  request_refund: { label: "Request Refund", tooltip: "Raise a refund request for super-admin approval", icon: BadgeDollarSign, tone: "danger" },
  reopen: { label: "Reopen Order", tooltip: "Restart a closed or completed order", icon: RotateCcw, tone: "muted" },
  close_manual: { label: "Close Order", tooltip: "Manually close and archive this order", icon: XCircle, tone: "danger" },
};

/** Buttons per status. Refund gating still enforced at the panel by role. */
export const STATUS_ACTIONS: Record<OrderStatus, StatusActionKey[]> = {
  NEW_ORDER: ["send_form_link", "customer_delay", "close_manual"],
  PAYMENT_RECEIVED: ["send_form_link", "close_manual"],
  ORDER_RECEIVED: ["send_form_link", "close_manual"],
  FORM_PENDING: ["send_form_link", "manual_reminder", "customer_delay", "close_manual"],
  FORM_RECEIVED: ["start_processing", "customer_delay", "close_manual"],
  WAITING_CUSTOMER_INFO: ["send_form_link", "manual_reminder", "customer_delay", "close_manual"],
  INFO_RECEIVED: ["start_processing", "our_delay", "customer_delay"],
  IN_PROCESSING: ["our_delay", "customer_delay", "submitted_to_govt"],
  CUSTOMER_HOLD: ["send_form_link", "manual_reminder", "start_processing", "close_manual"],
  TECHNICAL_HOLD_EXTERNAL: ["start_processing", "close_manual"],
  TECHNICAL_HOLD_INTERNAL: ["start_processing", "close_manual"],
  OUR_SIDE_DELAY: ["start_processing", "submitted_to_govt", "our_delay"],
  SUBMITTED_TO_GOVT: ["certificate_issued", "our_delay"],
  AWAITING_GOVT_APPROVAL: ["certificate_issued", "close_manual"],
  CHECKING_STATUS: ["certificate_issued", "close_manual"],
  CERTIFICATE_ISSUED: ["complete"],
  COMPLETED: ["reopen"],
  HIGH_PRIORITY: ["start_processing", "submitted_to_govt", "our_delay", "customer_delay"],
  REFUND_REQUESTED: [],
  REFUND_APPROVED: [],
  REFUND_PROCESSED: ["close_manual"],
  CLOSED: ["reopen"],
  REOPENED: ["send_form_link", "start_processing", "customer_delay"],
};

export const REFUND_ELIGIBLE_STATUSES: OrderStatus[] = [
  "IN_PROCESSING",
  "SUBMITTED_TO_GOVT",
  "CUSTOMER_HOLD",
  "OUR_SIDE_DELAY",
  "HIGH_PRIORITY",
];

// ─────────────────────────── NEXT STEP HINTS ───────────────────────────

export interface NextStepHint {
  headline: string;
  hint: string;
  /** Which status action button (if any) resolves this step. */
  primary?: StatusActionKey;
}

export const NEXT_STEP_HINT: Record<OrderStatus, NextStepHint> = {
  NEW_ORDER: {
    headline: "New order",
    hint: "Send the customer info form link to kick things off.",
    primary: "send_form_link",
  },
  PAYMENT_RECEIVED: {
    headline: "Payment received",
    hint: "Send the customer info form link.",
    primary: "send_form_link",
  },
  ORDER_RECEIVED: {
    headline: "Order received",
    hint: "Send the customer info form link.",
    primary: "send_form_link",
  },
  FORM_PENDING: {
    headline: "Form pending",
    hint: "Customer has 8h to submit — send a reminder or resend the link.",
    primary: "manual_reminder",
  },
  FORM_RECEIVED: {
    headline: "Form received",
    hint: "Start processing the application.",
    primary: "start_processing",
  },
  WAITING_CUSTOMER_INFO: {
    headline: "Waiting for customer info",
    hint: "Send a reminder if 24h has passed since the last nudge.",
    primary: "manual_reminder",
  },
  INFO_RECEIVED: {
    headline: "Info received",
    hint: "Start processing the application.",
    primary: "start_processing",
  },
  IN_PROCESSING: {
    headline: "In processing",
    hint: "File with the government once your work is complete.",
    primary: "submitted_to_govt",
  },
  CUSTOMER_HOLD: {
    headline: "Customer hold",
    hint: "Reach out to unblock, then resume processing.",
    primary: "send_form_link",
  },
  TECHNICAL_HOLD_EXTERNAL: {
    headline: "Technical hold — govt/portal",
    hint: "Portal issue on govt side. Retry when clear or close the order.",
    primary: "start_processing",
  },
  TECHNICAL_HOLD_INTERNAL: {
    headline: "Technical hold — internal",
    hint: "Blocked on our side. Resolve and resume processing.",
    primary: "start_processing",
  },
  OUR_SIDE_DELAY: {
    headline: "Our-side delay",
    hint: "Resume processing or file when the block is cleared.",
    primary: "start_processing",
  },
  SUBMITTED_TO_GOVT: {
    headline: "Submitted to government",
    hint: "Mark the certificate issued as soon as it arrives.",
    primary: "certificate_issued",
  },
  AWAITING_GOVT_APPROVAL: {
    headline: "Awaiting govt approval",
    hint: "Waiting on the government portal. Mark certificate issued when it arrives.",
    primary: "certificate_issued",
  },
  CHECKING_STATUS: {
    headline: "Checking status",
    hint: "Actively checking the portal for updates.",
    primary: "certificate_issued",
  },
  CERTIFICATE_ISSUED: {
    headline: "Certificate issued",
    hint: "Complete the order to notify the customer.",
    primary: "complete",
  },
  COMPLETED: {
    headline: "Completed",
    hint: "Nothing pending. Reopen only if the customer reports an issue.",
  },
  HIGH_PRIORITY: {
    headline: "High priority — escalated",
    hint: "Take the next processing action right away.",
    primary: "start_processing",
  },
  REFUND_REQUESTED: {
    headline: "Refund requested",
    hint: "Awaiting super-admin approval.",
  },
  REFUND_APPROVED: {
    headline: "Refund approved",
    hint: "Awaiting payment gateway confirmation.",
  },
  REFUND_PROCESSED: {
    headline: "Refund processed",
    hint: "Close the order to archive it.",
    primary: "close_manual",
  },
  CLOSED: {
    headline: "Closed",
    hint: "Archived. Reopen only on customer request.",
  },
  REOPENED: {
    headline: "Reopened",
    hint: "Resend the form link or resume processing.",
    primary: "send_form_link",
  },
};

// ─────────────────────────── TAB AVAILABILITY ───────────────────────────

export type WorkspaceTabId = "form" | "customer" | "assignment" | "emails" | "invoices" | "activity" | "support";

export type TabAvailability = Record<WorkspaceTabId, { enabled: boolean; reason: string }>;

export function tabAvailability(
  status: OrderStatus | null,
  hasLead: boolean,
  showConsultation: boolean,
): TabAvailability {
  const locked = status === "CLOSED" || status === "REFUND_PROCESSED";
  return {
    form: {
      enabled: !showConsultation && hasLead,
      reason: showConsultation
        ? "Available after service is picked and second payment is received"
        : !hasLead
          ? "No lead linked to this order yet"
          : "",
    },
    customer: { enabled: true, reason: "" },
    assignment: { enabled: true, reason: "" },
    emails: { enabled: hasLead, reason: hasLead ? "" : "No lead linked to this order" },
    invoices: { enabled: true, reason: "" },
    activity: { enabled: true, reason: "" },
    support: { enabled: !locked, reason: locked ? "Order is closed — no new tickets" : "" },

  };
}
