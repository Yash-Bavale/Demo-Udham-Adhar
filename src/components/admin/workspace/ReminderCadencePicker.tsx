// Phase 3 — Reminder Cadence Picker. Employee-configurable per order.
// Presets: 1h / 2h / 4h / 1d / 2d / 4d, plus a custom input.
import { useState } from "react";
import { Bell, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS: { label: string; sub: string; minutes: number }[] = [
  { label: "1h", sub: "hour",  minutes: 60 },
  { label: "2h", sub: "hours", minutes: 120 },
  { label: "4h", sub: "hours", minutes: 240 },
  { label: "1d", sub: "day",   minutes: 60 * 24 },
  { label: "2d", sub: "days",  minutes: 60 * 24 * 2 },
  { label: "4d", sub: "days",  minutes: 60 * 24 * 4 },
];

interface Props {
  value: number; // minutes
  onChange: (minutes: number) => void;
  label?: string;
  disabled?: boolean;
}

export function ReminderCadencePicker({
  value,
  onChange,
  label = "Reminder cadence",
  disabled,
}: Props) {
  const isPreset = PRESETS.some((p) => p.minutes === value);
  const [customMode, setCustomMode] = useState(!isPreset && value > 0);
  const [customUnit, setCustomUnit] = useState<"h" | "d">(
    value % (60 * 24) === 0 && value > 0 ? "d" : "h",
  );
  const customAmount =
    customUnit === "d"
      ? Math.max(1, Math.round(value / (60 * 24)))
      : Math.max(1, Math.round(value / 60));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Bell className="size-3" /> {label}
        </Label>
        <div className="text-[11px] text-slate-500 flex items-center gap-1">
          <Clock className="size-3" />
          Repeats every <b className="text-slate-700">{formatMinutes(value)}</b>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
        {PRESETS.map((p) => {
          const on = !customMode && value === p.minutes;
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              onClick={() => {
                setCustomMode(false);
                onChange(p.minutes);
              }}
              className={cn(
                "rounded-md border px-1 py-1.5 text-center transition disabled:opacity-50",
                on
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <div className={cn("text-sm font-bold", on ? "text-indigo-700" : "text-slate-800")}>
                {p.label}
              </div>
              <div className="text-[9.5px] uppercase tracking-wider text-slate-500">{p.sub}</div>
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCustomMode(true)}
          className={cn(
            "rounded-md border px-1 py-1.5 text-center transition disabled:opacity-50",
            customMode
              ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
              : "border-dashed border-slate-300 bg-white hover:border-slate-400",
          )}
        >
          <div className={cn("text-sm font-bold", customMode ? "text-indigo-700" : "text-slate-700")}>
            +
          </div>
          <div className="text-[9.5px] uppercase tracking-wider text-slate-500">custom</div>
        </button>
      </div>

      {customMode && (
        <div className="flex items-center gap-2 rounded-md border bg-slate-50 px-2 py-1.5">
          <span className="text-[11px] text-slate-500">Every</span>
          <Input
            type="number"
            min={1}
            max={customUnit === "d" ? 30 : 720}
            value={customAmount}
            disabled={disabled}
            onChange={(e) => {
              const n = Math.max(1, Number(e.target.value) || 1);
              onChange(customUnit === "d" ? n * 60 * 24 : n * 60);
            }}
            className="w-20 h-8"
          />
          <div className="flex rounded-md border border-slate-200 overflow-hidden bg-white">
            {(["h", "d"] as const).map((u) => (
              <button
                key={u}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setCustomUnit(u);
                  onChange(u === "d" ? customAmount * 60 * 24 : customAmount * 60);
                }}
                className={cn(
                  "px-3 py-1 text-xs transition",
                  customUnit === u
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {u === "h" ? "hours" : "days"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMinutes(m: number): string {
  if (!m) return "off";
  if (m % (60 * 24) === 0) {
    const d = m / (60 * 24);
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${m}m`;
}
