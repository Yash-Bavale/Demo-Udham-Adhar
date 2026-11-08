// Pure, client-safe state machine. No supabase imports.
import type { LeadStatus, ApplicationStatus, StaffRole } from "./types";

export type ComplaintStatus = "pending" | "in_progress" | "resolved" | "closed";

type RoleSet = readonly StaffRole[];

const ALL_OPS: RoleSet = ["super_admin", "admin", "operations"] as const;
const SUPER: RoleSet = ["super_admin"] as const;

type LeadTransition = { to: LeadStatus; label: string; roles: RoleSet };
type AppTransition = { to: ApplicationStatus; label: string; roles: RoleSet };
type ComplaintTransition = { to: ComplaintStatus; label: string; roles: RoleSet };

// ---------- LEAD ----------
export const LEAD_TRANSITIONS: Record<LeadStatus, LeadTransition[]> = {
  lead_created:        [{ to: "payment_pending",     label: "Send Payment Link",  roles: ALL_OPS }],
  new_lead:            [{ to: "contacted",           label: "Mark Contacted",     roles: ALL_OPS }],
  contacted:           [{ to: "payment_pending",     label: "Send Payment Link",  roles: ALL_OPS }],
  payment_pending:     [
    { to: "payment_successful", label: "Mark Paid (Manual)", roles: SUPER },
    { to: "closed",             label: "Mark Closed",        roles: ALL_OPS },
  ],
  payment_successful:  [{ to: "details_pending",     label: "Request Details",    roles: ALL_OPS }],
  details_pending:     [{ to: "documents_pending",   label: "Move to Documents",  roles: ALL_OPS }],
  documents_pending:   [{ to: "under_review",        label: "Send for Review",    roles: ALL_OPS }],
  under_review:        [{ to: "under_process",       label: "Start Processing",   roles: ALL_OPS }],
  under_process:       [{ to: "completed",           label: "Mark Completed",     roles: ALL_OPS }],
  completed:           [{ to: "closed",              label: "Archive",            roles: ALL_OPS }],
  closed:              [{ to: "under_process",       label: "Re-open",            roles: SUPER }],
  refund_requested:    [{ to: "closed",              label: "Resolve & Close",    roles: SUPER }],
};

// ---------- APPLICATION ----------
export const APP_TRANSITIONS: Record<ApplicationStatus, AppTransition[]> = {
  awaiting_payment:   [{ to: "payment_received",   label: "Confirm Payment",     roles: SUPER }],
  payment_received:   [{ to: "details_pending",    label: "Request Details",     roles: ALL_OPS }],
  details_pending:    [{ to: "documents_pending",  label: "Move to Documents",   roles: ALL_OPS }],
  documents_pending:  [{ to: "under_review",       label: "Send for Review",     roles: ALL_OPS }],
  under_review:       [{ to: "under_process",      label: "Start Processing",    roles: ALL_OPS }],
  under_process:      [{ to: "completed",          label: "Mark Completed",      roles: ALL_OPS }],
  completed:          [],
};

// ---------- COMPLAINT ----------
export const COMPLAINT_TRANSITIONS: Record<ComplaintStatus, ComplaintTransition[]> = {
  pending:     [{ to: "in_progress", label: "Start Working", roles: ALL_OPS }],
  in_progress: [
    { to: "resolved", label: "Mark Resolved",   roles: ALL_OPS },
    { to: "pending",  label: "Back to Pending", roles: ALL_OPS },
  ],
  resolved:    [{ to: "closed",      label: "Close Complaint", roles: ALL_OPS }],
  closed:      [{ to: "in_progress", label: "Re-open",         roles: SUPER }],
};

export type EntityKind = "lead" | "application" | "complaint";

export function getAllowed(
  kind: EntityKind,
  current: string,
  roles: StaffRole[]
): { to: string; label: string }[] {
  const graph: Record<string, { to: string; label: string; roles: RoleSet }[]> =
    kind === "lead" ? (LEAD_TRANSITIONS as any) :
    kind === "application" ? (APP_TRANSITIONS as any) :
    (COMPLAINT_TRANSITIONS as any);
  const list = graph[current] ?? [];
  return list
    .filter((t) => t.roles.some((r) => roles.includes(r)))
    .map((t) => ({ to: t.to, label: t.label }));
}

export function isTransitionAllowed(
  kind: EntityKind,
  from: string,
  to: string,
  roles: StaffRole[]
): boolean {
  return getAllowed(kind, from, roles).some((t) => t.to === to);
}

export function statusTone(status: string): string {
  if (/(completed|resolved|received|paid|successful)/.test(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (/(in_progress|under_|process)/.test(status))       return "bg-sky-50 text-sky-700 border-sky-200";
  if (/(pending|awaiting|created|draft|new_)/.test(status))   return "bg-amber-50 text-amber-700 border-amber-200";
  if (/(hold|review)/.test(status))                      return "bg-violet-50 text-violet-700 border-violet-200";
  if (/(abandoned|cancelled|closed|failed|rejected|refund)/.test(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}
