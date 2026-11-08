import { Check } from "lucide-react";
import { formatIST } from "@/lib/datetime";
import {
  JOURNEY_STAGES,
  STAGE_META,
  type OrderStage,
} from "@/lib/crm/computeOrderStage";

// Tone → gradient
const TONE_GRADIENT: Record<string, string> = {
  blue: "from-sky-500 to-blue-600",
  amber: "from-amber-400 to-orange-500",
  violet: "from-violet-500 to-fuchsia-500",
  indigo: "from-indigo-500 to-blue-600",
  emerald: "from-emerald-400 to-teal-500",
  rose: "from-rose-500 to-red-500",
  slate: "from-slate-400 to-slate-600",
};

interface Props {
  stage: OrderStage;
  timestamps?: Partial<Record<OrderStage, string | null>>;
  onPick?: () => void;
}

/**
 * Colorful gradient stage stepper — used as the headline of the workspace.
 * Each stage = pill with icon + label. Active stage glows + pulses.
 */
export function StageStepper({ stage, timestamps, onPick }: Props) {
  const currentMeta = STAGE_META[stage];
  const isException = currentMeta.side === "exception";
  const currentOrder = currentMeta.order;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-cyan-50/60 px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-indigo-600">
          Customer Journey
        </div>
        {isException ? (
          <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-gradient-to-r ${TONE_GRADIENT[currentMeta.tone]} text-white shadow-sm`}>
            {currentMeta.label}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-slate-600">
            Now: <span className="text-indigo-700">{currentMeta.label}</span>
          </span>
        )}
      </div>

      <ol className="flex items-center gap-0 overflow-x-auto pb-1">
        {JOURNEY_STAGES.map((s, i) => {
          const meta = STAGE_META[s];
          const ts = timestamps?.[s] ?? null;
          const isCurrent = !isException && s === stage;
          const isDone = !isException && currentOrder > meta.order;
          const grad = TONE_GRADIENT[meta.tone] ?? TONE_GRADIENT.indigo;

          const circleCls = isDone
            ? `bg-gradient-to-br ${grad} text-white shadow-md`
            : isCurrent
              ? `bg-gradient-to-br ${grad} text-white shadow-lg ring-4 ring-indigo-200 animate-pulse`
              : "bg-white text-slate-400 border-2 border-dashed border-slate-200";

          const connectorCls = isDone
            ? `bg-gradient-to-r ${grad}`
            : "bg-slate-200";

          return (
            <li key={s} className="flex items-center min-w-0 flex-1">
              <button
                type="button"
                onClick={onPick}
                title={ts ? `${meta.label} · ${formatIST(ts)}` : meta.label}
                className="flex flex-col items-center gap-1.5 px-1 min-w-0 group hover:-translate-y-0.5 transition-transform cursor-pointer"
              >
                <div className={`size-10 rounded-full flex items-center justify-center transition-all ${circleCls}`}>
                  {isDone ? (
                    <Check className="w-5 h-5" strokeWidth={3} />
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <div className={`text-[11px] text-center leading-tight whitespace-nowrap font-semibold ${
                  isCurrent ? "text-indigo-700" : isDone ? "text-slate-700" : "text-slate-400"
                }`}>
                  {meta.short}
                </div>
              </button>
              {i < JOURNEY_STAGES.length - 1 && (
                <div className={`h-1 flex-1 mt-[6px] mx-1 rounded-full ${connectorCls}`} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
