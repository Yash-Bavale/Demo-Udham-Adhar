// Premium status badge (Final_CRM Part A + O).
// Single source of truth for status colors across admin.
import { cn } from "@/lib/utils";

const MAP: Record<string, string> = {
  // Lead statuses
  new:               "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  new_lead:          "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  lead_created:      "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  lead_received:     "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  contacted:         "bg-sky-50 text-sky-700 border-sky-200",
  qualified:         "bg-indigo-50 text-indigo-700 border-indigo-200",
  proposal_sent:     "bg-violet-50 text-violet-700 border-violet-200",
  negotiating:       "bg-amber-50 text-amber-700 border-amber-200",
  won:               "bg-green-50 text-green-700 border-green-200",
  lost:              "bg-gray-100 text-gray-600 border-gray-300",
  // Application / fulfillment
  awaiting_payment:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  payment_pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  payment_received:  "bg-green-50 text-green-700 border-green-200",
  details_pending:   "bg-purple-50 text-purple-700 border-purple-200",
  documents_pending: "bg-purple-50 text-purple-700 border-purple-200",
  under_review:      "bg-amber-50 text-amber-700 border-amber-200",
  under_process:     "bg-amber-50 text-amber-700 border-amber-200",
  under_processing:  "bg-amber-50 text-amber-700 border-amber-200",
  completed:         "bg-green-50 text-green-700 border-green-200",
  on_hold:           "bg-gray-100 text-gray-600 border-gray-300",
  cancelled:         "bg-red-50 text-red-700 border-red-200",
  // Document statuses (Part J #7 — `approved` not `verified`)
  pending:           "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved:          "bg-green-50 text-green-700 border-green-200",
  rejected:          "bg-red-50 text-red-700 border-red-200",
  re_upload_requested: "bg-purple-50 text-purple-700 border-purple-200",
};

export interface StatusBadgeProps {
  status?: string | null;
  className?: string;
  label?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = (status ?? "").toLowerCase();
  const tone = MAP[key] ?? "bg-gray-100 text-gray-600 border-gray-300";
  const text = label ?? (status ?? "—").replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border capitalize whitespace-nowrap",
        tone,
        className,
      )}
    >
      {text}
    </span>
  );
}
