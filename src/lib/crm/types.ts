// Shared CRM types (client-safe)
export type LeadStatus =
  | "lead_created"
  | "new_lead"
  | "contacted"
  | "payment_pending"
  | "payment_successful"
  | "details_pending"
  | "documents_pending"
  | "under_review"
  | "under_process"
  | "completed"
  | "closed"
  | "refund_requested";

export type ApplicationStatus =
  | "awaiting_payment"
  | "payment_received"
  | "details_pending"
  | "documents_pending"
  | "under_review"
  | "under_process"
  | "completed";

export type StaffRole = "admin" | "super_admin" | "operations" | "support" | "accounts";

export const LEAD_STATUSES: LeadStatus[] = [
  "new_lead",
  "contacted",
  "payment_pending",
  "payment_successful",
  "under_process",
  "completed",
  "closed",
  "refund_requested",
];

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "awaiting_payment",
  "payment_received",
  "details_pending",
  "documents_pending",
  "under_review",
  "under_process",
  "completed",
];

export const STAFF_ROLES: StaffRole[] = ["super_admin", "admin", "operations", "support", "accounts"];
