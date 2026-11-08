// All admin timestamps render in IST (Asia/Kolkata).
// Tiny, no-deps formatter. Use this everywhere instead of bare toLocaleString.

const IST = "Asia/Kolkata" as const;

export function formatIST(
  value: string | number | Date | null | undefined,
  opts: { dateOnly?: boolean; timeOnly?: boolean; withYear?: boolean } = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  if (opts.timeOnly) {
    return d.toLocaleTimeString("en-IN", {
      timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }
  if (opts.dateOnly) {
    // Always DD/MM/YYYY (project-wide standard).
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: IST, day: "2-digit", month: "2-digit",
      year: opts.withYear === false ? undefined : "numeric",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return opts.withYear === false
      ? `${get("day")}/${get("month")}`
      : `${get("day")}/${get("month")}/${get("year")}`;
  }
  const time = d.toLocaleTimeString("en-IN", {
    timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true,
  });
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, day: "2-digit", month: "2-digit",
    year: opts.withYear === false ? undefined : "numeric",
  }).formatToParts(d);
  const get = (t: string) => dateParts.find((p) => p.type === t)?.value ?? "";
  const datePart = opts.withYear === false
    ? `${get("day")}/${get("month")}`
    : `${get("day")}/${get("month")}/${get("year")}`;
  return `${datePart}, ${time}`;
}

/** Returns YYYY-MM-DD in IST for grouping rows by day. */
export function istDateKey(value: string | number | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Human label for an IST date key: "Today", "Yesterday", or e.g. "Mon, 29 Jun 2026". */
export function istDayLabel(value: string | number | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const key = istDateKey(d);
  const todayKey = istDateKey(new Date());
  const yKey = istDateKey(new Date(Date.now() - 86400000));
  const base = d.toLocaleDateString("en-IN", {
    timeZone: IST, weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
  if (key === todayKey) return `${base} · Today`;
  if (key === yKey) return `${base} · Yesterday`;
  return base;
}

export function relativeIST(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatIST(d, { dateOnly: true });
}

/**
 * Format a date as DD/MM/YYYY in IST.
 * Tolerates malformed inputs like "12021-08-31" (recovers as 31/08/2021)
 * by trimming to the last 10 chars when year is out of plausible range.
 */
export function formatDateDMY(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  let d = value instanceof Date ? value : new Date(value as any);
  // Recovery: legacy bad records like "12021-08-31" parse as year 12021 → use last 10 chars
  if (typeof value === "string" && (Number.isNaN(d.getTime()) || d.getUTCFullYear() > 9999 || d.getUTCFullYear() < 1900)) {
    const tail = value.trim().slice(-10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tail);
    if (m) d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+05:30`);
  }
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}
