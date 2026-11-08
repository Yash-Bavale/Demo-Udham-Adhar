import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Save, Info } from "lucide-react";
import { SectionCard } from "@/components/admin/ui";
import { toast } from "sonner";
import {
  getBusinessHoursConfig,
  updateBusinessHoursConfig,
} from "@/lib/scheduling/business-hours.functions";
import {
  addBusinessSeconds,
  isBusinessHour,
  type BusinessHoursConfig,
} from "@/lib/scheduling/business-hours";
import { useRole } from "@/hooks/useRole";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "UTC", "Europe/London", "America/New_York",
];

export function BusinessHoursTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getBusinessHoursConfig);
  const updFn = useServerFn(updateBusinessHoursConfig);
  const { has } = useRole();
  const isSuper = has("super_admin");

  const { data, isLoading } = useQuery({
    queryKey: ["business-hours-config"],
    queryFn: () => getFn(),
    staleTime: 60_000,
  });

  const [tz, setTz] = useState("Asia/Kolkata");
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("18:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [holidayInput, setHolidayInput] = useState("");
  const [holidays, setHolidays] = useState<string[]>([]);

  useEffect(() => {
    if (!data?.config) return;
    setTz(data.config.timezone);
    setOpenTime(data.config.openTime);
    setCloseTime(data.config.closeTime);
    setDays(data.config.workingDays);
    setHolidays(data.config.holidays ?? []);
  }, [data]);

  const cfg: BusinessHoursConfig = useMemo(
    () => ({ timezone: tz, openTime, closeTime, workingDays: days, holidays }),
    [tz, openTime, closeTime, days, holidays],
  );

  const now = new Date();
  const openNow = isBusinessHour(now, cfg);
  const nextClosureFires = useMemo(() => addBusinessSeconds(now, 24 * 3600, cfg), [cfg, now]);
  const nextReminderFires = useMemo(() => addBusinessSeconds(now, 2 * 3600, cfg), [cfg, now]);

  const save = useMutation({
    mutationFn: async () => updFn({
      data: {
        timezone: tz, openTime, closeTime,
        workingDays: [...days].sort(), holidays,
      },
    }),
    onSuccess: () => {
      toast.success("Business hours updated");
      qc.invalidateQueries({ queryKey: ["business-hours-config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }
  function addHoliday() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayInput)) {
      toast.error("Date must be YYYY-MM-DD");
      return;
    }
    if (holidays.includes(holidayInput)) return;
    setHolidays((prev) => [...prev, holidayInput].sort());
    setHolidayInput("");
  }

  if (isLoading) {
    return <SectionCard title="Business Hours"><div className="p-6 text-sm text-slate-500">Loading…</div></SectionCard>;
  }

  const readOnly = !isSuper;

  return (
    <div className="space-y-4">
      <SectionCard title="Office Hours (drives all internal schedulers)">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 -mt-1 text-xs text-indigo-700">
            <Clock className="size-4" />
            <span>Applied to every internal timer (24h closure, 2h reminder, ticket auto-close).</span>
          </div>
          {!isSuper && (
            <div className="flex items-start gap-2 rounded border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Info className="size-4 shrink-0 mt-0.5" />
              Only Super Admin can edit these settings. You have read-only access.
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <label className="text-sm block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Timezone</span>
              <select
                disabled={readOnly}
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 bg-white disabled:bg-slate-50"
              >
                {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Open time</span>
              <input
                type="time"
                disabled={readOnly}
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 disabled:bg-slate-50"
              />
            </label>
            <label className="text-sm block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Close time</span>
              <input
                type="time"
                disabled={readOnly}
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 disabled:bg-slate-50"
              />
            </label>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Working days</div>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((label, idx) => {
                const active = days.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleDay(idx)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                    } ${readOnly ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Holidays</div>
            <div className="flex gap-2 items-center flex-wrap">
              {holidays.map((h) => (
                <span key={h} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                  {h}
                  {!readOnly && (
                    <button
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => setHolidays((prev) => prev.filter((x) => x !== h))}
                    >×</button>
                  )}
                </span>
              ))}
              {holidays.length === 0 && (
                <span className="text-xs text-slate-400">No holidays configured</span>
              )}
            </div>
            {!readOnly && (
              <div className="mt-2 flex gap-2">
                <input
                  placeholder="YYYY-MM-DD"
                  value={holidayInput}
                  onChange={(e) => setHolidayInput(e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={addHoliday}
                  className="rounded bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium"
                >Add holiday</button>
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="inline-flex items-center gap-1.5 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium shadow-sm"
              >
                <Save className="size-4" />
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Live preview">
        <div className="p-4 grid md:grid-cols-3 gap-3 text-sm">
          <PreviewCard label="Right now" value={openNow ? "🟢 Business hours" : "🔴 Outside hours"} />
          <PreviewCard label="24h closure timer would fire" value={fmt(nextClosureFires, tz)} />
          <PreviewCard label="2h reminder would fire" value={fmt(nextReminderFires, tz)} />
        </div>
        <div className="px-4 pb-4 text-[11px] text-slate-500">
          All internal schedulers (customer-side 24h auto-close, our-side 2h reminder engine, ticket auto-close)
          pause automatically outside these hours and only count business seconds.
        </div>
      </SectionCard>
    </div>
  );
}

function PreviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-medium text-slate-800">{value}</div>
    </div>
  );
}

function fmt(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: tz,
      weekday: "short",
      day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
