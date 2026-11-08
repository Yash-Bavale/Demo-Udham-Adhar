// Canonical order fulfillment stages (S01–S12) — single source of truth.
// Mirrors public.fulfillment_status_enum values used by the S01–S12 flow.
//
// Legacy enum values from the pre-S01 flow (documents_received, verification_pending,
// application_submitted, under_processing, completed, cancelled, awaiting_govt,
// certificate_rejected, ticket_open, form_not_submitted) still exist in the DB
// enum for backward compatibility and are labelled via LEGACY_FULFILLMENT_LABEL
// so old rows render correctly. They are not offered as forward targets.

export type FulfillmentStatus =
  | "order_received"                    // S01
  | "awaiting_customer_form"            // S02
  | "waiting_for_customer_submission"   // S03
  | "form_submitted"                    // S04
  | "technical_delay"                   // S05
  | "customer_delay"                    // S06
  | "government_processing"             // S07
  | "consultation_completed"            // S08
  | "application_approved"              // S09
  | "application_rejected"              // S10
  | "order_completed"                   // S11
  | "order_closed"                      // S12
  | "order_reopened"
  // legacy terminal aliases still written by older code paths
  | "completed"
  | "cancelled";

export const FULFILLMENT_STAGES: FulfillmentStatus[] = [
  "order_received",
  "awaiting_customer_form",
  "waiting_for_customer_submission",
  "form_submitted",
  "technical_delay",
  "customer_delay",
  "government_processing",
  "consultation_completed",
  "application_approved",
  "application_rejected",
  "order_completed",
  "order_closed",
];

export const FULFILLMENT_CODE: Record<FulfillmentStatus, string> = {
  order_received:                  "S01",
  awaiting_customer_form:          "S02",
  waiting_for_customer_submission: "S03",
  form_submitted:                  "S04",
  technical_delay:                 "S05",
  customer_delay:                  "S06",
  government_processing:           "S07",
  consultation_completed:          "S08",
  application_approved:            "S09",
  application_rejected:            "S10",
  order_completed:                 "S11",
  order_closed:                    "S12",
  order_reopened:                  "S04",
  completed:                       "S11",
  cancelled:                       "S12",
};

export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  order_received:                  "Incomplete Form",
  awaiting_customer_form:          "Awaiting Customer Form",
  waiting_for_customer_submission: "Waiting for Customer Submission",
  form_submitted:                  "Form Submitted",
  technical_delay:                 "Technical Delay",
  customer_delay:                  "Customer Side Delay",
  government_processing:           "Government Processing",
  consultation_completed:          "Consultation Completed",
  application_approved:            "Application Approved",
  application_rejected:            "Application Rejected",
  order_completed:                 "Order Completed",
  order_closed:                    "Order Closed",
  order_reopened:                  "Order Reopened",
  completed:                       "Order Completed",
  cancelled:                       "Order Closed",
};

export const FULFILLMENT_BADGE: Record<FulfillmentStatus, string> = {
  order_received:                  "bg-slate-100 text-slate-700 border-slate-200",
  awaiting_customer_form:          "bg-amber-50 text-amber-800 border-amber-200",
  waiting_for_customer_submission: "bg-amber-50 text-amber-800 border-amber-200",
  form_submitted:                  "bg-blue-50 text-blue-700 border-blue-200",
  technical_delay:                 "bg-sky-50 text-sky-800 border-sky-200",
  customer_delay:                  "bg-amber-50 text-amber-800 border-amber-200",
  government_processing:           "bg-indigo-50 text-indigo-700 border-indigo-200",
  consultation_completed:          "bg-violet-50 text-violet-700 border-violet-200",
  application_approved:            "bg-emerald-50 text-emerald-700 border-emerald-200",
  application_rejected:            "bg-rose-50 text-rose-700 border-rose-200",
  order_completed:                 "bg-emerald-50 text-emerald-700 border-emerald-200",
  order_closed:                    "bg-rose-50 text-rose-700 border-rose-200",
  order_reopened:                  "bg-rose-50 text-rose-700 border-rose-200",
  completed:                       "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:                       "bg-rose-50 text-rose-700 border-rose-200",
};

// Labels for legacy enum values (pre-S01 flow) so historical rows still render.
export const LEGACY_FULFILLMENT_LABEL: Record<string, string> = {
  documents_received:    "Documents Received (legacy)",
  verification_pending:  "Verification Pending (legacy)",
  application_submitted: "Application Submitted (legacy)",
  under_processing:      "Under Processing (legacy)",
  awaiting_govt:         "Awaiting Govt (legacy)",
  certificate_rejected:  "Application Rejected (legacy)",
  ticket_open:           "Ticket Open (legacy)",
  form_not_submitted:    "Awaiting Customer Form (legacy)",
};

// S01–S12 forward transitions per the CRM_Order_Journey_Button_Logic doc.
// Order Received auto-advances to Awaiting Customer Form; Form Submitted (S04)
// is the fan-out hub; Govt Processing (S07) mirrors S04 outcomes.
export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  order_received:                  ["awaiting_customer_form", "order_closed"],
  awaiting_customer_form:          ["waiting_for_customer_submission", "order_closed"],
  waiting_for_customer_submission: ["form_submitted", "order_closed"],
  form_submitted: [
    "technical_delay",
    "customer_delay",
    "government_processing",
    "consultation_completed",
    "application_approved",
    "application_rejected",
    "order_completed",
    "order_closed",
  ],
  order_reopened: [
    "form_submitted",
    "technical_delay",
    "customer_delay",
    "government_processing",
    "consultation_completed",
    "application_approved",
    "application_rejected",
    "order_completed",
    "completed",
    "order_closed",
  ],
  technical_delay:                 ["form_submitted", "order_closed"],
  customer_delay:                  ["form_submitted", "order_closed"],
  government_processing: [
    "consultation_completed",
    "application_approved",
    "application_rejected",
    "order_completed",
    "order_closed",
  ],
  consultation_completed:          ["application_approved", "application_rejected", "order_completed", "order_closed"],
  application_approved:            ["order_completed", "order_closed"],
  application_rejected:            ["order_closed"],
  order_completed:                 [],
  order_closed:                    [],
  completed:                       [],
  cancelled:                       [],
};

export function getAllowedFulfillmentTransitions(current: FulfillmentStatus): FulfillmentStatus[] {
  return FULFILLMENT_TRANSITIONS[current] ?? [];
}

export function stageIndex(s: FulfillmentStatus): number {
  return FULFILLMENT_STAGES.indexOf(s);
}

/** Human label for any value, including legacy strings. */
export function labelForFulfillment(value: string | null | undefined): string {
  if (!value) return "—";
  if (value in FULFILLMENT_LABEL) return FULFILLMENT_LABEL[value as FulfillmentStatus];
  if (value in LEGACY_FULFILLMENT_LABEL) return LEGACY_FULFILLMENT_LABEL[value];
  return value;
}
