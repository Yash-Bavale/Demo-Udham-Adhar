// Monthly attendance & payroll view (read-only reporting).
// Sources: employee_sessions (active/idle/away seconds) + get_employee_perf_stream
// (order completions, closures and human actions). Nothing here writes data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FULL_DAY_SECONDS = 6 * 3600; // 6h worked = full day
const MIN_DAY_SECONDS = 30 * 60; // under 30 min with no orders = not counted

const istDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export interface AttendanceDay {
  date: string;
  first_at: string | null;
  last_at: string | null;
  active_seconds: number;
  idle_seconds: number;
  worked_seconds: number;
  completed: number;
  closed: number;
  actions: number;
  status: "full" | "half" | "absent";
}

export interface AttendanceEmployee {
  employee_id: string;
  name: string;
  employee_code: string | null;
  full_days: number;
  half_days: number;
  absent_days: number;
  days_worked: number;
  completed: number;
  closed: number;
  actions: number;
  active_seconds: number;
  idle_seconds: number;
  days: AttendanceDay[];
}

export const getMonthlyAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roles = new Set((roleRows ?? []).map((r: any) => String(r.role)));
    if (!roles.has("admin") && !roles.has("super_admin") && !roles.has("manager")) throw new Error("Forbidden");

    const [y, m] = data.month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const fromIso = new Date(`${data.month}-01T00:00:00+05:30`).toISOString();
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const toIso = new Date(`${nextMonth}-01T00:00:00+05:30`).toISOString();
    const todayIst = istDate(new Date().toISOString());
    const dates = Array.from({ length: daysInMonth }, (_, i) => `${data.month}-${String(i + 1).padStart(2, "0")}`).filter((d) => d <= todayIst);

    // Staff list
    const { data: staffRoles } = await admin.from("user_roles").select("user_id, role");
    const staffIds = [...new Set((staffRoles ?? []).filter((r: any) => r.role !== "customer").map((r: any) => r.user_id as string))];
    const { data: profiles } = staffIds.length
      ? await admin.from("profiles").select("id, full_name, display_name, email, employee_code, is_active").in("id", staffIds)
      : { data: [] as any[] };

    // Sessions
    const sessions: any[] = [];
    for (let off = 0; off < 50_000; off += 1000) {
      const { data: rows, error } = await admin
        .from("employee_sessions")
        .select("employee_id, auth_user_id, login_at, logout_at, last_heartbeat_at, active_seconds, idle_seconds, away_seconds")
        .gte("login_at", fromIso).lt("login_at", toIso).order("login_at").range(off, off + 999);
      if (error) throw new Error(error.message);
      sessions.push(...(rows ?? []));
      if ((rows ?? []).length < 1000) break;
    }

    // Order work stream (as the signed-in manager)
    const stream: any[] = [];
    for (let off = 0; off < 200_000; off += 1000) {
      const { data: rows, error } = await supabase
        .rpc("get_employee_perf_stream", { p_from: fromIso, p_to: toIso, p_employee: null })
        .range(off, off + 999);
      if (error) throw new Error(`Work data unavailable: ${error.message}`);
      stream.push(...(rows ?? []));
      if ((rows ?? []).length < 1000) break;
    }

    type Acc = { first: string | null; last: string | null; active: number; idle: number; completed: Set<string>; closed: Set<string>; actions: number };
    const map = new Map<string, Map<string, Acc>>();
    const get = (emp: string, date: string) => {
      let e = map.get(emp); if (!e) { e = new Map(); map.set(emp, e); }
      let a = e.get(date); if (!a) { a = { first: null, last: null, active: 0, idle: 0, completed: new Set(), closed: new Set(), actions: 0 }; e.set(date, a); }
      return a;
    };
    const touch = (a: Acc, t: string | null) => {
      if (!t) return;
      if (!a.first || t < a.first) a.first = t;
      if (!a.last || t > a.last) a.last = t;
    };

    for (const s of sessions) {
      const emp = s.employee_id ?? s.auth_user_id; if (!emp) continue;
      const a = get(emp, istDate(s.login_at));
      a.active += s.active_seconds ?? 0;
      a.idle += (s.idle_seconds ?? 0) + (s.away_seconds ?? 0);
      touch(a, s.login_at); touch(a, s.logout_at ?? s.last_heartbeat_at);
    }
    for (const r of stream) {
      if (!r.employee_id) continue;
      if (r.kind !== "action" && r.kind !== "completion" && r.kind !== "closure") continue;
      const a = get(r.employee_id, istDate(r.occurred_at));
      touch(a, r.occurred_at);
      a.actions++;
      if (r.kind === "completion") a.completed.add(r.application_id);
      if (r.kind === "closure") a.closed.add(r.application_id);
    }

    const employees: AttendanceEmployee[] = (profiles ?? []).map((p: any) => {
      const e = map.get(p.id);
      const days: AttendanceDay[] = dates.map((date) => {
        const a = e?.get(date);
        if (!a) return { date, first_at: null, last_at: null, active_seconds: 0, idle_seconds: 0, worked_seconds: 0, completed: 0, closed: 0, actions: 0, status: "absent" };
        const span = a.first && a.last ? Math.max(0, (Date.parse(a.last) - Date.parse(a.first)) / 1000) : 0;
        // Logged-in time when session tracking exists; otherwise first→last order action.
        const worked = a.active + a.idle > 0 ? Math.max(a.active + a.idle, span) : span;
        const hasWork = a.actions > 0;
        const status: AttendanceDay["status"] = worked >= FULL_DAY_SECONDS ? "full" : worked >= MIN_DAY_SECONDS || hasWork ? "half" : "absent";
        return { date, first_at: a.first, last_at: a.last, active_seconds: a.active, idle_seconds: a.idle, worked_seconds: Math.round(worked), completed: a.completed.size, closed: a.closed.size, actions: a.actions, status };
      });
      const sum = (f: (d: AttendanceDay) => number) => days.reduce((n, d) => n + f(d), 0);
      return {
        employee_id: p.id,
        name: p.full_name || p.display_name || p.email || "—",
        employee_code: p.employee_code ?? null,
        full_days: days.filter((d) => d.status === "full").length,
        half_days: days.filter((d) => d.status === "half").length,
        absent_days: days.filter((d) => d.status === "absent").length,
        days_worked: days.filter((d) => d.status !== "absent").length,
        completed: sum((d) => d.completed),
        closed: sum((d) => d.closed),
        actions: sum((d) => d.actions),
        active_seconds: sum((d) => d.active_seconds),
        idle_seconds: sum((d) => d.idle_seconds),
        days,
      };
    })
      .filter((e: AttendanceEmployee) => e.days_worked > 0 || (profiles ?? []).find((p: any) => p.id === e.employee_id)?.is_active)
      .sort((a: AttendanceEmployee, b: AttendanceEmployee) => b.days_worked - a.days_worked || a.name.localeCompare(b.name));

    return { month: data.month, dates, employees };
  });
