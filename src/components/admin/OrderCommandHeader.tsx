import { Link } from "@tanstack/react-router";
import { ExternalLink, AlertCircle, Clock } from "lucide-react";
import { STAGE_META, STAGE_BADGE_CLASS, type OrderStage } from "@/lib/crm/computeOrderStage";
import { formatIST, relativeIST } from "@/lib/datetime";
import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";
import { useDashboardPrivacy } from "@/hooks/useDashboardPrivacy";

interface StaffOption {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
}

interface Props {
  orderCode: string;
  customerName: string;
  customerMobile?: string | null;
  serviceName: string;
  stage: OrderStage;
  paymentStatus: string;
  total: number;
  createdAt: string;
  assignedTo: string | null;
  staff: StaffOption[];
  onAssign: (id: string | null) => void;
  leadId?: string | null;
  /** When true, hides money figures (operations / support roles) */
  hideAmount?: boolean;
}

export function OrderCommandHeader({
  orderCode, customerName, customerMobile, serviceName,
  stage, paymentStatus, total, createdAt, assignedTo, staff, onAssign,
  leadId, hideAmount,
}: Props) {
  const { formatINR } = useFinancialVisibility();
  const { isPrivacyEnabled } = useDashboardPrivacy();
  const meta = STAGE_META[stage];
  const isException = meta.side === "exception";
  const priority = paymentStatus === "Paid" && (stage === "form_submitted" || stage === "under_review")
    ? "high"
    : "normal";

  return (
    <div
      className="sticky top-[56px] z-10 -mx-6 px-6 py-3 backdrop-blur border-b"
      style={{
        background: "color-mix(in oklab, var(--admin-surface) 92%, transparent)",
        borderColor: "var(--admin-border)",
      }}
    >
      <div className="flex items-center gap-4 flex-wrap">
        {/* Order code + customer */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold tracking-tight" style={{ color: "var(--admin-fg)" }}>
              {orderCode}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STAGE_BADGE_CLASS[stage]}`}
            >
              {meta.label}
            </span>
            {priority === "high" && !isException && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                <AlertCircle className="size-3" /> Needs action
              </span>
            )}
            {isException && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold">
                <AlertCircle className="size-3" /> {meta.label}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[13px]" style={{ color: "var(--admin-fg)" }}>
            <span className="font-semibold truncate">{customerName}</span>
            {customerMobile && (
              <>
                <span className="opacity-40">·</span>
                <span className="font-mono text-xs opacity-70">{customerMobile}</span>
              </>
            )}
            <span className="opacity-40">·</span>
            <span className="text-xs opacity-70 truncate">{serviceName}</span>
            {leadId && (
              <Link
                to="/admin/leads/$leadId"
                params={{ leadId }}
                className="ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
              >
                Open Lead <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Meta tiles */}
        <div className="flex items-center gap-5 text-xs">
          <Meta label="Created">
            <span title={formatIST(createdAt)}>
              <Clock className="size-3 inline mr-1 opacity-60" />
              {relativeIST(createdAt)}
            </span>
          </Meta>

          <Meta label="Assigned">
            <select
              value={assignedTo ?? ""}
              onChange={(e) => onAssign(e.target.value || null)}
              className="rounded-md border px-2 py-1 text-xs bg-white max-w-[180px]"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.display_name || s.full_name || s.name || s.email}</option>
              ))}
            </select>
          </Meta>

          {!hideAmount && (
            <Meta label="Payment">
              <PaymentChip status={paymentStatus} />
            </Meta>
          )}

          {!hideAmount && (
            <Meta label="Total">
              <span className="font-semibold text-sm" style={{ color: "var(--admin-fg)" }}>
                {isPrivacyEnabled ? "₹••••" : formatINR(total)}
              </span>
            </Meta>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9.5px] uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--admin-fg-muted)" }}>
        {label}
      </span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function PaymentChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-slate-100 text-slate-700 border-slate-200",
    "Partially Paid": "bg-amber-50 text-amber-800 border-amber-200",
    Refunded: "bg-rose-50 text-rose-700 border-rose-200",
    Failed: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cls}`}>{status}</span>;
}
