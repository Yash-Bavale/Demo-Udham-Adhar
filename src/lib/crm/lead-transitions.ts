// Pure, client-safe shared map for Phase 1 Lead Management.
// Single source of truth for allowed lead-status transitions, badge colors,
// and the status → email template mapping per spec.

export type LeadStatusV2 =
  | "new_lead"
  | "contacted"
  | "follow_up_required"
  | "payment_pending"
  | "payment_failed"
  | "payment_successful"
  | "welcome_mail_sent"
  | "documents_pending"
  | "under_process"
  | "uninterested"
  | "refund_requested"
  | "refund_approved"
  | "refunded"
  | "closed"
  | "closed_refunded";

export const LEAD_STATUSES_V2: LeadStatusV2[] = [
  "new_lead",
  "contacted",
  "follow_up_required",
  "payment_pending",
  "payment_failed",
  "payment_successful",
  "welcome_mail_sent",
  "documents_pending",
  "under_process",
  "uninterested",
  "refund_requested",
  "refund_approved",
  "refunded",
  "closed",
  "closed_refunded",
];

// Allowed transitions per spec. Terminal states map to [].
export const LEAD_TRANSITIONS_V2: Record<LeadStatusV2, LeadStatusV2[]> = {
  new_lead:           ["contacted", "follow_up_required", "payment_pending"],
  contacted:          ["new_lead", "follow_up_required", "payment_pending", "payment_successful", "uninterested"],
  follow_up_required: ["contacted", "payment_pending", "uninterested"],
  payment_pending:    ["payment_successful", "payment_failed", "uninterested"],
  payment_failed:     ["payment_pending", "uninterested", "closed"],
  payment_successful: ["welcome_mail_sent", "documents_pending", "under_process"],
  welcome_mail_sent:  ["documents_pending"],
  documents_pending:  ["under_process", "uninterested"],
  under_process:      ["closed"], // gated server-side by fulfillment_status='completed'
  uninterested:       ["refund_requested"],
  refund_requested:   ["refund_approved", "closed"],
  refund_approved:    ["refunded"],
  refunded:           ["closed_refunded"],
  closed:             [],
  closed_refunded:    [],
};

export function getAllowedLeadTransitions(current: LeadStatusV2): LeadStatusV2[] {
  return LEAD_TRANSITIONS_V2[current] ?? [];
}

export function isLeadTransitionAllowed(from: LeadStatusV2, to: LeadStatusV2): boolean {
  return getAllowedLeadTransitions(from).includes(to);
}

// Spec colour map → Tailwind classes (admin theme uses semantic tokens; these are explicit per spec).
export const LEAD_STATUS_BADGE: Record<LeadStatusV2, string> = {
  new_lead:           "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  contacted:          "bg-indigo-100 text-indigo-800 border-indigo-200",
  follow_up_required: "bg-indigo-100 text-indigo-800 border-indigo-200",
  payment_pending:    "bg-amber-100 text-amber-900 border-amber-200",
  payment_failed:     "bg-amber-100 text-amber-900 border-amber-200",
  payment_successful: "bg-teal-100 text-teal-800 border-teal-200",
  welcome_mail_sent:  "bg-teal-100 text-teal-800 border-teal-200",
  documents_pending:  "bg-orange-100 text-orange-800 border-orange-200",
  under_process:      "bg-orange-100 text-orange-800 border-orange-200",
  uninterested:       "bg-red-100 text-red-800 border-red-200",
  refund_requested:   "bg-red-100 text-red-800 border-red-200",
  refund_approved:    "bg-purple-100 text-purple-800 border-purple-200",
  refunded:           "bg-slate-200 text-slate-800 border-slate-300",
  closed:             "bg-slate-300 text-slate-900 border-slate-400",
  closed_refunded:    "bg-slate-300 text-slate-900 border-slate-400",
};

export const LEAD_STATUS_LABEL: Record<LeadStatusV2, string> = {
  new_lead:           "New Lead",
  contacted:          "Contacted",
  follow_up_required: "Follow-up Required",
  payment_pending:    "Payment Pending",
  payment_failed:     "Payment Failed",
  payment_successful: "Payment Successful",
  welcome_mail_sent:  "Welcome Mail Sent",
  documents_pending:  "Documents Pending",
  under_process:      "Under Process",
  uninterested:       "Uninterested",
  refund_requested:   "Refund Requested",
  refund_approved:    "Refund Approved",
  refunded:           "Refunded",
  closed:             "Closed",
  closed_refunded:    "Closed (Refunded)",
};

// Status → email template code map. Templates may not yet exist; the queueing
// helper falls back to a stub when a row is missing in email_templates.
export const LEAD_STATUS_EMAIL: Partial<Record<LeadStatusV2, string>> = {
  payment_successful: "order_confirmation",
  refunded:           "refund_processed_confirmation",
  closed_refunded:    "refund_processed_confirmation",
};

// Auto-chain transitions that fire on the server after a write succeeds.
export const LEAD_AUTO_CHAIN: Partial<Record<LeadStatusV2, LeadStatusV2>> = {
  refunded: "closed_refunded",
};
