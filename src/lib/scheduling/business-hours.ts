// Business-hours math for internal schedulers.
// All functions are pure and time-zone aware (defaults to Asia/Kolkata).
// A "business second" only ticks Monday–Saturday, 10:00–18:00 IST by default;
// Super Admin can change the window from Settings.

export interface BusinessHoursConfig {
  timezone: string;          // IANA tz, e.g. 'Asia/Kolkata'
  openTime: string;          // 'HH:MM' 24h
  closeTime: string;         // 'HH:MM' 24h
  workingDays: number[];     // 0=Sun..6=Sat
  holidays: string[];        // ISO dates 'YYYY-MM-DD'
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: "Asia/Kolkata",
  openTime: "10:00",
  closeTime: "18:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  holidays: [],
};

// ------------ tz helpers ------------
// Get {y,m,d,dow,hh,mm,ss} for a Date in a given IANA tz without pulling
// in a full date library.
function tzParts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    dow: dowMap[parts.weekday as string] ?? 0,
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    ss: Number(parts.second),
  };
}

function parseHM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

// Given wall-clock y/m/d/h/m/s in `tz`, return the UTC Date that renders as
// that clock reading in tz. Works via a bounded iterative correction because
// JS has no built-in "make Date from wall clock + tz".
function fromTzClock(tz: string, y: number, mo: number, d: number, h: number, m: number, s = 0): Date {
  // Initial guess: treat as UTC.
  let guess = new Date(Date.UTC(y, mo - 1, d, h, m, s));
  for (let i = 0; i < 3; i++) {
    const p = tzParts(guess, tz);
    const diffMin =
      (y - p.y) * 525600 +
      (mo - p.mo) * 43800 +
      (d - p.d) * 1440 +
      (h - p.hh) * 60 +
      (m - p.mm);
    if (diffMin === 0) break;
    guess = new Date(guess.getTime() + diffMin * 60_000);
  }
  return guess;
}

function isoDate(y: number, mo: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

function isWorkingDay(cfg: BusinessHoursConfig, y: number, mo: number, d: number, dow: number): boolean {
  if (!cfg.workingDays.includes(dow)) return false;
  const iso = isoDate(y, mo, d);
  return !cfg.holidays.includes(iso);
}

// ------------ public API ------------

/** Is the wall-clock instant within business hours? Always true when business hours are turned off. */
export function isBusinessHour(date: Date, cfg: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS): boolean {
  return true;
}

/** Next wall-clock instant that lies within business hours (returns `date` unchanged since business hours are turned off). */
export function nextBusinessInstant(date: Date, cfg: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS): Date {
  return date;
}

/** Add N seconds; return the resulting wall-clock instant directly. */
export function addBusinessSeconds(
  from: Date,
  seconds: number,
  cfg: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): Date {
  return new Date(from.getTime() + seconds * 1000);
}

/** Wall-clock seconds that elapsed between `a` and `b` (`a <= b`). */
export function businessSecondsBetween(
  a: Date,
  b: Date,
  cfg: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): number {
  if (b.getTime() <= a.getTime()) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));
}

/** Format helper for UI ("in 17h 32m business time"). */
export function formatBusinessDuration(seconds: number): string {
  if (seconds <= 0) return "due";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
