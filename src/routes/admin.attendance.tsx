import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { CalendarCheck, Download, ChevronDown, ChevronRight } from "lucide-react";
import { getMonthlyAttendance, type AttendanceEmployee } from "@/lib/crm/attendance-payroll.functions";
import { SectionCard } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance & Payroll — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AttendancePage,
});

const hm = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return s <= 0 ? "—" : `${h}h ${m}m`;
};
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";
const weekday = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });

const STATUS: Record<string, { label: string; cls: string }> = {
  full: { label: "Full Day", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  half: { label: "Half Day", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  absent: { label: "Absent / Off", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

function exportCsv(month: string, rows: AttendanceEmployee[]) {
  const lines = [
    ["Employee", "Code", "Date", "Day", "Status", "First", "Last", "Worked", "Active", "Idle", "Completed", "Closed", "Actions"].join(","),
  ];
  for (const e of rows) {
    for (const d of e.days) {
      lines.push([`"${e.name}"`, e.employee_code ?? "", d.date, weekday(d.date), STATUS[d.status].label, time(d.first_at), time(d.last_at), hm(d.worked_seconds), hm(d.active_seconds), hm(d.idle_seconds), d.completed, d.closed, d.actions].join(","));
    }
    lines.push([`"${e.name} TOTAL"`, e.employee_code ?? "", "", "", `Full ${e.full_days} / Half ${e.half_days} / Absent ${e.absent_days}`, "", "", "", hm(e.active_seconds), hm(e.idle_seconds), e.completed, e.closed, e.actions].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `attendance-payroll-${month}.csv`;
  a.click();
}

function AttendancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState<string | null>(null);
  const fn = useServerFn(getMonthlyAttendance);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin.attendance", month],
    queryFn: () => fn({ data: { month } }),
    staleTime: 60_000,
  });
  const rows = data?.employees ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarCheck className="size-5" /> Attendance & Payroll</h1>
          <p className="text-xs text-muted-foreground">Full day = 6h+ worked. Half day = less than 6h, or any order work. Click an employee for the day-by-day view.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportCsv(month, rows)}>
            <Download className="mr-1 size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-center">Days Worked</th>
                <th className="px-3 py-2 text-center">Full</th>
                <th className="px-3 py-2 text-center">Half</th>
                <th className="px-3 py-2 text-center">Absent</th>
                <th className="px-3 py-2 text-center">Completed</th>
                <th className="px-3 py-2 text-center">Closed</th>
                <th className="px-3 py-2 text-center">Active</th>
                <th className="px-3 py-2 text-center">Idle</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</td></tr>}
              {error && <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-destructive">{(error as Error).message}</td></tr>}
              {!isLoading && !error && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">No data for this month.</td></tr>}
              {rows.map((e) => (
                <Fragment key={e.employee_id}>
                  <tr className="cursor-pointer border-b hover:bg-muted/40" onClick={() => setOpen(open === e.employee_id ? null : e.employee_id)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 font-medium">
                        {open === e.employee_id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        {e.name}
                      </div>
                      <div className="pl-5 font-mono text-[11px] text-muted-foreground">{e.employee_code ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">{e.days_worked}</td>
                    <td className="px-3 py-2 text-center text-emerald-700">{e.full_days}</td>
                    <td className="px-3 py-2 text-center text-amber-700">{e.half_days}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{e.absent_days}</td>
                    <td className="px-3 py-2 text-center">{e.completed}</td>
                    <td className="px-3 py-2 text-center">{e.closed}</td>
                    <td className="px-3 py-2 text-center">{hm(e.active_seconds)}</td>
                    <td className="px-3 py-2 text-center">{hm(e.idle_seconds)}</td>
                  </tr>
                  {open === e.employee_id && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={9} className="p-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                              <th className="px-2 py-1">Date</th><th className="px-2 py-1">Status</th>
                              <th className="px-2 py-1">First</th><th className="px-2 py-1">Last</th>
                              <th className="px-2 py-1">Worked</th><th className="px-2 py-1">Active</th><th className="px-2 py-1">Idle</th>
                              <th className="px-2 py-1">Completed</th><th className="px-2 py-1">Closed</th><th className="px-2 py-1">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {e.days.map((d) => (
                              <tr key={d.date} className="border-t">
                                <td className="px-2 py-1">{d.date} <span className={weekday(d.date) === "Sun" ? "text-destructive" : "text-muted-foreground"}>{weekday(d.date)}</span></td>
                                <td className="px-2 py-1"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span></td>
                                <td className="px-2 py-1">{time(d.first_at)}</td>
                                <td className="px-2 py-1">{time(d.last_at)}</td>
                                <td className="px-2 py-1">{hm(d.worked_seconds)}</td>
                                <td className="px-2 py-1">{hm(d.active_seconds)}</td>
                                <td className="px-2 py-1">{hm(d.idle_seconds)}</td>
                                <td className="px-2 py-1">{d.completed || "—"}</td>
                                <td className="px-2 py-1">{d.closed || "—"}</td>
                                <td className="px-2 py-1">{d.actions || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
