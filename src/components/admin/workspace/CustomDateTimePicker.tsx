import { useState, useMemo, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const RECOMMENDED_SLOTS = [
  { id: "morning", label: "Morning Slot", timeStr: "10:30 AM", hour: 10, minute: 30, period: "AM" as const },
  { id: "post_lunch", label: "Post-Lunch", timeStr: "02:30 PM", hour: 2, minute: 30, period: "PM" as const },
  { id: "evening", label: "Evening Slot", timeStr: "06:00 PM", hour: 6, minute: 0, period: "PM" as const },
  { id: "end_of_shift", label: "End of Shift", timeStr: "08:30 PM", hour: 8, minute: 30, period: "PM" as const },
];

export function CustomDateTimePicker({ value, onChange }: CustomDateTimePickerProps) {
  // Parse incoming value
  const initialDate = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();

  // Internal view state for month & year navigation
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  // Date selection
  const selectedYear = initialDate.getFullYear();
  const selectedMonth = initialDate.getMonth();
  const selectedDay = initialDate.getDate();

  // Time state (12-hour format)
  const rawHours = initialDate.getHours();
  const rawMinutes = initialDate.getMinutes();
  const initialPeriod = rawHours >= 12 ? "PM" : "AM";
  const initial12Hour = rawHours % 12 === 0 ? 12 : rawHours % 12;

  const [hour12, setHour12] = useState<number>(initial12Hour);
  const [minute, setMinute] = useState<number>(rawMinutes);
  const [period, setPeriod] = useState<"AM" | "PM">(initialPeriod);

  // String buffers for typing
  const [hourInput, setHourInput] = useState<string>(initial12Hour.toString().padStart(2, "0"));
  const [minuteInput, setMinuteInput] = useState<string>(rawMinutes.toString().padStart(2, "0"));

  // Keep internal string states in sync when value changes externally
  useEffect(() => {
    const rh = value.getHours();
    const rm = value.getMinutes();
    const p = rh >= 12 ? "PM" : "AM";
    const h12 = rh % 12 === 0 ? 12 : rh % 12;
    setHour12(h12);
    setMinute(rm);
    setPeriod(p);
    setHourInput(h12.toString().padStart(2, "0"));
    setMinuteInput(rm.toString().padStart(2, "0"));
  }, [value]);

  // Helper to commit date & time change
  const commitChange = (
    year: number,
    month: number,
    day: number,
    h12: number,
    min: number,
    pm: "AM" | "PM"
  ) => {
    let hours24 = h12 % 12;
    if (pm === "PM") hours24 += 12;

    const newDate = new Date(year, month, day, hours24, min, 0, 0);
    onChange(newDate);
  };

  const handleSelectDate = (year: number, month: number, day: number) => {
    commitChange(year, month, day, hour12, minute, period);
  };

  const handleHourStep = (delta: number) => {
    let nextH = hour12 + delta;
    if (nextH > 12) nextH = 1;
    if (nextH < 1) nextH = 12;
    setHour12(nextH);
    setHourInput(nextH.toString().padStart(2, "0"));
    commitChange(selectedYear, selectedMonth, selectedDay, nextH, minute, period);
  };

  const handleMinuteStep = (delta: number) => {
    let nextM = minute + delta;
    if (nextM >= 60) nextM = 0;
    if (nextM < 0) nextM = 59;
    setMinute(nextM);
    setMinuteInput(nextM.toString().padStart(2, "0"));
    commitChange(selectedYear, selectedMonth, selectedDay, hour12, nextM, period);
  };

  const handleHourInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setHourInput(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
      setHour12(parsed);
      commitChange(selectedYear, selectedMonth, selectedDay, parsed, minute, period);
    }
  };

  const handleHourBlur = () => {
    const parsed = parseInt(hourInput, 10);
    let finalH = hour12;
    if (isNaN(parsed) || parsed < 1) finalH = 1;
    else if (parsed > 12) finalH = 12;
    else finalH = parsed;

    setHour12(finalH);
    setHourInput(finalH.toString().padStart(2, "0"));
    commitChange(selectedYear, selectedMonth, selectedDay, finalH, minute, period);
  };

  const handleMinuteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setMinuteInput(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 59) {
      setMinute(parsed);
      commitChange(selectedYear, selectedMonth, selectedDay, hour12, parsed, period);
    }
  };

  const handleMinuteBlur = () => {
    const parsed = parseInt(minuteInput, 10);
    let finalM = minute;
    if (isNaN(parsed) || parsed < 0) finalM = 0;
    else if (parsed > 59) finalM = 59;
    else finalM = parsed;

    setMinute(finalM);
    setMinuteInput(finalM.toString().padStart(2, "0"));
    commitChange(selectedYear, selectedMonth, selectedDay, hour12, finalM, period);
  };

  const handlePeriodChange = (newPeriod: "AM" | "PM") => {
    setPeriod(newPeriod);
    commitChange(selectedYear, selectedMonth, selectedDay, hour12, minute, newPeriod);
  };

  const handleSelectSlot = (slot: typeof RECOMMENDED_SLOTS[0]) => {
    setHour12(slot.hour);
    setMinute(slot.minute);
    setPeriod(slot.period);
    setHourInput(slot.hour.toString().padStart(2, "0"));
    setMinuteInput(slot.minute.toString().padStart(2, "0"));
    commitChange(selectedYear, selectedMonth, selectedDay, slot.hour, slot.minute, slot.period);
  };

  // Quick chip options relative to today
  const quickChips = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const plus2 = new Date(today);
    plus2.setDate(today.getDate() + 2);

    // Next Monday calculation
    const nextMon = new Date(today);
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
    const daysUntilNextMon = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    nextMon.setDate(today.getDate() + daysUntilNextMon);

    const formatChipLabel = (d: Date) => {
      const day = d.getDate();
      const month = d.toLocaleString("en-US", { month: "short" });
      return `${day} ${month}`;
    };

    return [
      {
        id: "today",
        label: `Today (${formatChipLabel(today)})`,
        date: today,
      },
      {
        id: "tomorrow",
        label: `Tomorrow (${formatChipLabel(tomorrow)})`,
        date: tomorrow,
      },
      {
        id: "plus2",
        label: `+2 Days (${formatChipLabel(plus2)})`,
        date: plus2,
      },
      {
        id: "next_monday",
        label: "Next Monday",
        date: nextMon,
      },
    ];
  }, []);

  // Calendar Grid calculation (42 cells: previous month tail + current month + next month head)
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth();
    const todayD = now.getDate();

    // Previous month filler
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({
        day: d,
        month: prevM,
        year: prevY,
        isCurrentMonth: false,
        isSelected: prevY === selectedYear && prevM === selectedMonth && d === selectedDay,
        isToday: prevY === todayY && prevM === todayM && d === todayD,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
        isSelected: viewYear === selectedYear && viewMonth === selectedMonth && d === selectedDay,
        isToday: viewYear === todayY && viewMonth === todayM && d === todayD,
      });
    }

    // Next month filler up to 42 cells total (6 full weeks) or 35 cells
    const remaining = (cells.length > 35 ? 42 : 35) - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({
        day: d,
        month: nextM,
        year: nextY,
        isCurrentMonth: false,
        isSelected: nextY === selectedYear && nextM === selectedMonth && d === selectedDay,
        isToday: nextY === todayY && nextM === todayM && d === todayD,
      });
    }

    return cells;
  }, [viewYear, viewMonth, selectedYear, selectedMonth, selectedDay]);

  // Relative trigger countdown text
  const relativeDiffText = useMemo(() => {
    const diffMs = value.getTime() - Date.now();
    if (diffMs <= 0) {
      return "Due right now / immediate trigger";
    }

    const totalMins = Math.round(diffMs / 60_000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const days = Math.floor(hours / 24);

    if (days >= 1) {
      const remHours = hours % 24;
      return `Trigger in ${days} day${days > 1 ? "s" : ""}${remHours > 0 ? ` ${remHours} hr${remHours > 1 ? "s" : ""}` : ""}`;
    }

    if (hours >= 1) {
      return `Trigger in ${hours} hr${hours > 1 ? "s" : ""}${mins > 0 ? ` ${mins} min${mins > 1 ? "s" : ""}` : ""}`;
    }

    return `Trigger in ${totalMins} min${totalMins > 1 ? "s" : ""}`;
  }, [value]);

  // Locked date display string e.g. "Monday, 21 Sep 2026 at 01:18 AM"
  const formattedLockedDate = useMemo(() => {
    const weekday = value.toLocaleDateString("en-US", { weekday: "long" });
    const day = value.getDate();
    const month = value.toLocaleDateString("en-US", { month: "short" });
    const year = value.getFullYear();
    const h = hour12.toString().padStart(2, "0");
    const m = minute.toString().padStart(2, "0");

    return `${weekday}, ${day} ${month} ${year} at ${h}:${m} ${period}`;
  }, [value, hour12, minute, period]);

  const isCurrentSlotActive = (slot: typeof RECOMMENDED_SLOTS[0]) => {
    return hour12 === slot.hour && minute === slot.minute && period === slot.period;
  };

  return (
    <div className="rounded-2xl border border-blue-100 bg-slate-50/80 p-4 shadow-sm space-y-4 animate-in fade-in duration-200">
      {/* Header with Live Timezone */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <CalendarIcon className="size-4" />
          </div>
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            Select Custom Callback Date &amp; Time
          </span>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 shadow-2xs">
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Live Timezone: Asia/Kolkata (IST • UTC +5:30)</span>
        </div>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Quick Chips + Interactive Month Calendar */}
        <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          {/* Quick Date Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {quickChips.map((chip) => {
              const isChipSelected =
                selectedYear === chip.date.getFullYear() &&
                selectedMonth === chip.date.getMonth() &&
                selectedDay === chip.date.getDate();

              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    setViewYear(chip.date.getFullYear());
                    setViewMonth(chip.date.getMonth());
                    handleSelectDate(
                      chip.date.getFullYear(),
                      chip.date.getMonth(),
                      chip.date.getDate()
                    );
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer select-none",
                    isChipSelected
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Month Header Navigation */}
          <div className="flex items-center justify-between pt-1">
            <div className="font-bold text-xs text-slate-900 flex items-center gap-1">
              <span>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11);
                    setViewYear(viewYear - 1);
                  } else {
                    setViewMonth(viewMonth - 1);
                  }
                }}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition"
                aria-label="Previous Month"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0);
                    setViewYear(viewYear + 1);
                  } else {
                    setViewMonth(viewMonth + 1);
                  }
                }}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition"
                aria-label="Next Month"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_NAMES.map((wd) => (
              <div key={wd} className="text-[10px] font-bold text-slate-400 py-0.5 uppercase tracking-wider">
                {wd}
              </div>
            ))}
          </div>

          {/* Calendar Day Matrix */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, idx) => {
              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}-${idx}`}
                  type="button"
                  onClick={() => {
                    setViewYear(cell.year);
                    setViewMonth(cell.month);
                    handleSelectDate(cell.year, cell.month, cell.day);
                  }}
                  className={cn(
                    "h-8 w-full rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition select-none cursor-pointer relative",
                    cell.isSelected
                      ? "bg-blue-600 text-white font-bold shadow-xs"
                      : cell.isCurrentMonth
                      ? "text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                      : "text-slate-300 hover:bg-slate-50",
                    cell.isToday && !cell.isSelected && "border border-blue-400 font-bold text-blue-600"
                  )}
                >
                  <span>{cell.day}</span>
                  {cell.isSelected && (
                    <span className="w-1 h-1 bg-white rounded-full -mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Calendar Footer Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth());
                handleSelectDate(now.getFullYear(), now.getMonth(), now.getDate());
              }}
              className="font-medium text-slate-500 hover:text-slate-800 transition"
            >
              Clear Selection
            </button>

            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth());
                handleSelectDate(now.getFullYear(), now.getMonth(), now.getDate());
              }}
              className="font-bold text-blue-600 hover:text-blue-800 transition"
            >
              Select Today
            </button>
          </div>
        </div>

        {/* Right Column: Recommended Slots + Digital Hour/Minute Stepper + Summary */}
        <div className="space-y-3 flex flex-col justify-between">
          {/* Recommended Ops Slots */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Recommended Ops Slots
            </div>
            <div className="grid grid-cols-2 gap-2">
              {RECOMMENDED_SLOTS.map((slot) => {
                const active = isCurrentSlotActive(slot);
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={cn(
                      "p-2 rounded-xl text-left border transition cursor-pointer select-none",
                      active
                        ? "border-blue-500 bg-blue-50/90 text-blue-900 shadow-2xs"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
                    )}
                  >
                    <div className="text-[10px] font-semibold text-slate-500">{slot.label}</div>
                    <div className={cn("text-xs font-bold mt-0.5", active ? "text-blue-700 font-extrabold" : "text-blue-600")}>
                      {slot.timeStr}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exact Callback Hour & Minute Stepper with Direct Typing Support */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center mb-2">
              Exact Callback Hour &amp; Minute
            </div>

            <div className="flex items-center justify-center gap-3">
              {/* Hour Box & Controls */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleHourStep(1)}
                  className="p-1 rounded hover:bg-blue-100 text-blue-600 transition"
                  aria-label="Increment Hour"
                >
                  <ChevronUp className="size-4" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hourInput}
                  onChange={handleHourInputChange}
                  onBlur={handleHourBlur}
                  className="w-14 py-1 bg-white border border-blue-200 rounded-xl text-xl font-bold text-blue-700 text-center shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleHourStep(-1)}
                  className="p-1 rounded hover:bg-blue-100 text-blue-600 transition"
                  aria-label="Decrement Hour"
                >
                  <ChevronDown className="size-4" />
                </button>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  HRS
                </span>
              </div>

              {/* Colon Separator */}
              <div className="text-xl font-bold text-blue-400 pb-4">:</div>

              {/* Minute Box & Controls */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleMinuteStep(1)}
                  className="p-1 rounded hover:bg-blue-100 text-blue-600 transition"
                  aria-label="Increment Minute"
                >
                  <ChevronUp className="size-4" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={minuteInput}
                  onChange={handleMinuteInputChange}
                  onBlur={handleMinuteBlur}
                  className="w-14 py-1 bg-white border border-blue-200 rounded-xl text-xl font-bold text-blue-700 text-center shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleMinuteStep(-1)}
                  className="p-1 rounded hover:bg-blue-100 text-blue-600 transition"
                  aria-label="Decrement Minute"
                >
                  <ChevronDown className="size-4" />
                </button>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  MIN
                </span>
              </div>

              {/* AM / PM Toggle Column */}
              <div className="flex flex-col gap-1 pl-1 pb-4">
                <button
                  type="button"
                  onClick={() => handlePeriodChange("AM")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition select-none cursor-pointer",
                    period === "AM"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange("PM")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition select-none cursor-pointer",
                    period === "PM"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Summary Confirmation Callout */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-2.5 flex items-start gap-2 shadow-2xs">
            <Clock className="size-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-800 leading-snug">
              <span>Callback locked for </span>
              <strong className="font-bold text-slate-900">{formattedLockedDate}</strong>
              <div className="text-[11px] font-semibold text-blue-700 mt-0.5">
                ({relativeDiffText})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
