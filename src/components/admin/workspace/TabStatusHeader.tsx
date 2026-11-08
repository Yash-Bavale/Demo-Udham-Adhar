/**
 * Compact "current status + next step" strip rendered inside every workspace tab
 * so employees always know where the order stands, even after jumping tabs.
 *
 * DISPLAY ONLY — the single action surface for advancing the order lives inside
 * the Employee Workflow tab (OrderWorkflowPanel). This strip does not render
 * an action button, so employees never see duplicate "Mark as X" buttons.
 */
import { STAGE_META, type OrderStage } from "@/lib/crm/computeOrderStage";
import { relativeIST } from "@/lib/datetime";
import { NEXT_STEP_HINT } from "@/lib/orders/order-actions-map";
import type { OrderStatus } from "@/lib/orders/order-status.functions";
import type { FulfillmentStatus } from "@/lib/crm/fulfillment-transitions";

const TERMINAL_STAGES = new Set<OrderStage>(["closed", "refunded", "completed"]);

export function TabStatusHeader({
  applicationCode,
  orderStatus,
  stage,
  updatedAt,
}: {
  applicationCode: string;
  orderStatus: OrderStatus | null;
  stage: OrderStage;
  updatedAt: string | null | undefined;
  fulfillmentStatus?: FulfillmentStatus | string | null;
}) {
  // Single source of truth for the current stage label: computeOrderStage → STAGE_META.
  // Do NOT read fulfillment_status directly here — it drifts from the Orders table pill.
  const meta = STAGE_META[stage];
  const hint = orderStatus ? NEXT_STEP_HINT[orderStatus] : null;
  const isTerminal = TERMINAL_STAGES.has(stage);

  const pillCls =
    meta.side === "exception"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : meta.tone === "emerald"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : meta.tone === "violet"
          ? "bg-violet-50 text-violet-700 ring-violet-200"
          : meta.tone === "amber"
            ? "bg-amber-50 text-amber-800 ring-amber-200"
            : "bg-sky-50 text-sky-700 ring-sky-200";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${pillCls}`}
        title={isTerminal ? "Terminal stage" : "Current stage"}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
        <span>{meta.label}</span>
        {isTerminal && (
          <span className="ml-1 rounded-sm bg-black/10 px-1 text-[9px] font-bold uppercase tracking-wider">Terminal</span>
        )}
      </span>

      <span className="font-mono text-xs font-bold text-slate-700">{applicationCode}</span>

      {hint && (
        <span className="text-xs text-slate-600 min-w-0 flex-1">
          <span className="text-slate-500">Next:</span>{" "}
          <span className="font-medium text-slate-800">{hint.hint}</span>
        </span>
      )}

      {updatedAt && (
        <span className="text-[11px] text-slate-400 whitespace-nowrap">
          updated {relativeIST(updatedAt)}
        </span>
      )}
    </div>
  );
}
