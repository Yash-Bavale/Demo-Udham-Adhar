// Small pill button with an email/ticket code chip. Used inside CustomerJourneyMap.
import type { JourneyBranchButton } from "@/lib/orders/journey-map";
import { cn } from "@/lib/utils";

interface Props {
  button: JourneyBranchButton;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean; // when the current stage matches this branch
}

const VARIANT: Record<NonNullable<JourneyBranchButton["variant"]>, string> = {
  primary:  "bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600",
  outline:  "bg-white text-slate-700 hover:bg-slate-50 border-slate-300",
  danger:   "bg-rose-600 text-white hover:bg-rose-700 border-rose-600",
  success:  "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600",
};

export function JourneyActionButton({ button, onClick, disabled, active }: Props) {
  const variant = button.variant ?? "outline";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed w-full justify-start",
        VARIANT[variant],
        active && "ring-2 ring-offset-1 ring-indigo-400",
      )}
      title={button.label}
    >
      <span
        className={cn(
          "font-mono text-[9px] font-bold px-1 py-0.5 rounded shrink-0",
          variant === "outline" ? "bg-slate-100 text-slate-600" : "bg-white/25 text-white",
        )}
      >
        {button.emailCode}
      </span>
      <span className="truncate text-left">{button.label.replace(/^[ETR]\d{3}\s*[—-]?\s*/, "")}</span>
    </button>
  );
}
