import { Check } from "lucide-react";
import { formatIST } from "@/lib/datetime";
import {
  JOURNEY_STAGES,
  STAGE_META,
  type OrderStage,
} from "@/lib/crm/computeOrderStage";

interface Props {
  stage: OrderStage;
  /** Optional timestamps keyed by stage — used in tooltips */
  timestamps?: Partial<Record<OrderStage, string | null>>;
  /** Stage(s) that are blocked / need attention (rendered red) */
  blocked?: OrderStage[];
}

/**
 * Process Tracker — single horizontal workflow strip used on every Order page.
 * 8 nodes:  Lead → Payment → Form → Review → Progress → Govt → Cert → Completed.
 * Color rules:
 *   green  = done
 *   blue   = current
 *   grey   = pending
 *   red    = blocked
 */
export function ProcessTracker({ stage, timestamps, blocked = [] }: Props) {
  const currentMeta = STAGE_META[stage];
  const currentOrder = currentMeta.order;
  const isException = currentMeta.side === "exception";

  return (
    <div
      className="rounded-xl border bg-white px-5 py-4"
      style={{ borderColor: "var(--admin-border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className="text-[10px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: "var(--admin-fg-muted)" }}
        >
          Process Tracker
        </div>
        {isException && (
          <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            {currentMeta.label}
          </span>
        )}
      </div>

      <ol className="flex items-center gap-0 overflow-x-auto pb-1">
        {JOURNEY_STAGES.map((s, i) => {
          const meta = STAGE_META[s];
          const ts = timestamps?.[s] ?? null;
          const isCurrent = !isException && s === stage;
          const isDone = !isException && currentOrder > meta.order;
          const isBlocked = blocked.includes(s);

          let bgColor = "var(--admin-surface-2)";
          let fgColor = "var(--admin-fg-subtle)";
          let borderColor = "var(--admin-border)";
          let connectorColor = "var(--admin-border)";
          let weight = 400;

          if (isBlocked) {
            bgColor = "#fef2f2"; fgColor = "#b91c1c"; borderColor = "#fecaca"; connectorColor = "#fecaca";
          } else if (isDone) {
            bgColor = "#10B981"; fgColor = "#ffffff"; borderColor = "#10B981"; connectorColor = "#10B981";
          } else if (isCurrent) {
            bgColor = "#3B82F6"; fgColor = "#ffffff"; borderColor = "#3B82F6"; weight = 600;
          }

          return (
            <li key={s} className="flex items-center min-w-0 flex-1">
              <div className="flex flex-col items-center gap-1.5 px-1 min-w-0">
                <div
                  className="size-9 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: bgColor,
                    color: fgColor,
                    border: `1.5px solid ${borderColor}`,
                    boxShadow: isCurrent ? "0 0 0 4px rgba(59,130,246,0.15)" : "none",
                  }}
                  title={ts ? formatIST(ts) : meta.label}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" strokeWidth={3} />
                  ) : (
                    <span className="text-[11px] font-semibold">{i + 1}</span>
                  )}
                </div>
                <div
                  className="text-[10.5px] text-center leading-tight whitespace-nowrap"
                  style={{
                    color: isCurrent
                      ? "var(--admin-fg)"
                      : isDone
                        ? "var(--admin-fg)"
                        : "var(--admin-fg-muted)",
                    fontWeight: weight,
                  }}
                >
                  {meta.short}
                </div>
              </div>
              {i < JOURNEY_STAGES.length - 1 && (
                <div
                  className="h-[2px] flex-1 mt-[18px] mx-1 rounded-full"
                  style={{ background: connectorColor, opacity: isDone ? 1 : 0.6 }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
