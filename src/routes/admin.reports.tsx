import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  IndianRupee,
  Receipt,
  TrendingUp,
  Users,
  ShieldCheck,
} from "lucide-react";
import {
  getDailyReport,
  getMonthlyReport,
  getFinanceReport,
  listAuditLog,
} from "@/lib/crm/reports.functions";
import { SectionCard, TableSkeleton } from "@/components/admin/ui";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [{ title: "Reports — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: ReportsPage,
});

type Tab = "daily" | "monthly" | "finance" | "audit";

function ReportsPage() {
  const role = useRole();
  const [tab, setTab] = useState<Tab>("daily");

  const tabs: { id: Tab; label: string; gated?: boolean }[] = [
    { id: "daily", label: "Daily" },
    { id: "monthly", label: "Monthly" },
    { id: "finance", label: "Finance" },
    { id: "audit", label: "Audit Log", gated: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--admin-fg)" }}>
          Reports
        </h1>
        <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
          Daily snapshots, monthly performance, finance reconciliation, and audit trail.
        </p>
      </div>

      <div
        className="inline-flex overflow-hidden rounded-md border text-xs font-medium"
        style={{ borderColor: "var(--admin-border)" }}
      >
        {tabs
          .filter((t) => !t.gated || role.hasAny(["super_admin", "admin"]))
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-1.5"
              style={{
                background: tab === t.id ? "var(--admin-accent)" : "var(--admin-surface)",
                color: tab === t.id ? "var(--admin-accent-fg)" : "var(--admin-fg)",
                borderRight: "1px solid var(--admin-border)",
              }}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "daily" && <DailyTab />}
      {tab === "monthly" && <MonthlyTab />}
      {tab === "finance" && <FinanceTab />}
      {tab === "audit" && role.hasAny(["super_admin", "admin"]) && <AuditTab />}
    </div>
  );
}

import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";

function fmtN(n: number) {
  return new Intl.NumberFormat("en-IN").format(n || 0);
}
function formatIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .replace(",", "");
}
function todayIST(): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // YYYY-MM-DD
  return fmt;
}
function monthIST(): string {
  return todayIST().slice(0, 7);
}

// ─────────────────────────── DAILY TAB ───────────────────────────
function DailyTab() {
  const { formatINR } = useFinancialVisibility();
  const [date, setDate] = useState(todayIST());
  const fn = useServerFn(getDailyReport);
  const { data, isLoading } = useQuery({
    queryKey: ["daily-report", date],
    queryFn: () => fn({ data: { date } }),
  });

  const cards = [
    { label: "New Leads", icon: Users, value: data?.counts.leads, fmt: fmtN },
    { label: "New Orders", icon: Receipt, value: data?.counts.orders, fmt: fmtN },
    { label: "Revenue", icon: IndianRupee, value: data?.counts.revenue, fmt: (v: number) => formatINR(v) },
    { label: "Pending Cases", icon: Activity, value: data?.counts.pending, fmt: fmtN },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border p-4"
            style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-medium uppercase tracking-wide"
                style={{ color: "var(--admin-fg-muted)" }}
              >
                {c.label}
              </span>
              <c.icon className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
            </div>
            {isLoading ? (
              <div
                className="mt-2 h-7 w-24 animate-pulse rounded"
                style={{ background: "var(--admin-surface-2)" }}
              />
            ) : (
              <div
                className="mt-1 text-2xl font-medium tabular-nums"
                style={{ color: "var(--admin-fg)" }}
              >
                {c.fmt(c.value ?? 0)}
              </div>
            )}
          </div>
        ))}
      </div>

      <Expandable
        title={`New Leads (${data?.leads.length ?? 0})`}
        loading={isLoading}
        rows={(data?.leads ?? []).map((l: any) => ({
          id: l.id,
          primary: `${l.lead_code} — ${l.name ?? "—"}`,
          secondary: [l.service, l.mobile].filter(Boolean).join(" · "),
          tail: formatIST(l.created_at),
        }))}
      />
      <Expandable
        title={`New Orders (${data?.orders.length ?? 0})`}
        loading={isLoading}
        rows={(data?.orders ?? []).map((o: any) => ({
          id: o.id,
          primary: `${o.application_code} — ${o.service_name ?? "—"}`,
          secondary: [o.customers?.name, o.fulfillment_status].filter(Boolean).join(" · "),
          tail: formatIST(o.created_at),
        }))}
      />
      <Expandable
        title={`Payments Received (${data?.payments.length ?? 0})`}
        loading={isLoading}
        rows={(data?.payments ?? []).map((p: any) => ({
          id: p.id,
          primary: p.leads?.name ?? p.leads?.lead_code ?? "—",
          secondary: formatINR(Number(p.amount ?? 0)),
          tail: formatIST(p.created_at),
        }))}
      />
      <Expandable
        title={`Pending Cases (${data?.pending.length ?? 0})`}
        loading={isLoading}
        rows={(data?.pending ?? []).map((o: any) => ({
          id: o.id,
          primary: `${o.application_code} — ${o.service_name ?? "—"}`,
          secondary: [o.customers?.name, o.fulfillment_status].filter(Boolean).join(" · "),
          tail: formatIST(o.created_at),
        }))}
      />
    </div>
  );
}

function Expandable({
  title,
  loading,
  rows,
}: {
  title: string;
  loading: boolean;
  rows: { id: string; primary: string; secondary?: string; tail?: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium"
        style={{ color: "var(--admin-fg)" }}
      >
        <span>{title}</span>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {open && (
        <div
          className="max-h-80 divide-y overflow-y-auto border-t"
          style={{ borderColor: "var(--admin-border)" }}
        >
          {loading && <TableSkeleton rows={4} cols={3} />}
          {!loading && rows.length === 0 && (
            <div
              className="px-4 py-6 text-center text-xs"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              Nothing to show.
            </div>
          )}
          {!loading &&
            rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <div>
                  <div style={{ color: "var(--admin-fg)" }}>{r.primary}</div>
                  {r.secondary && (
                    <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                      {r.secondary}
                    </div>
                  )}
                </div>
                {r.tail && (
                  <span className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                    {r.tail}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─────────────────────────── MONTHLY TAB ───────────────────────────
function MonthlyTab() {
  const { formatINR } = useFinancialVisibility();
  const [month, setMonth] = useState(monthIST());
  const fn = useServerFn(getMonthlyReport);
  const { data, isLoading } = useQuery({
    queryKey: ["monthly-report", month],
    queryFn: () => fn({ data: { month } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Total Revenue"
          value={data ? formatINR(data.totalRevenue) : "—"}
          loading={isLoading}
        />
        <Stat
          label="Total Leads"
          value={data ? fmtN(data.conversion.totalLeads) : "—"}
          loading={isLoading}
        />
        <Stat
          label="Conversion Rate"
          value={data ? `${data.conversion.conversionRate}%` : "—"}
          loading={isLoading}
          hint={data ? `${fmtN(data.conversion.convertedLeads)} converted` : undefined}
        />
      </div>

      <SectionCard title="Service-wise Revenue">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-[11px] uppercase tracking-wide"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              <th className="px-4 py-2">Service</th>
              <th className="px-4 py-2 text-right">Orders</th>
              <th className="px-4 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3}>
                  <TableSkeleton rows={4} cols={3} />
                </td>
              </tr>
            )}
            {!isLoading && (data?.serviceRevenue ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-xs"
                  style={{ color: "var(--admin-fg-muted)" }}
                >
                  No revenue recorded this month.
                </td>
              </tr>
            )}
            {(data?.serviceRevenue ?? []).map((s, i) => (
              <tr
                key={s.service}
                className="border-t"
                style={{
                  borderColor: "var(--admin-border)",
                  background: i % 2 ? "var(--admin-surface-2)" : "transparent",
                }}
              >
                <td className="px-4 py-2" style={{ color: "var(--admin-fg)" }}>
                  {s.service}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtN(s.count)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatINR(s.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Staff Performance">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-[11px] uppercase tracking-wide"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2 text-right">Assigned</th>
              <th className="px-4 py-2 text-right">Completed</th>
              <th className="px-4 py-2 text-right">Pending</th>
              <th className="px-4 py-2 text-right">Completion %</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5}>
                  <TableSkeleton rows={4} cols={5} />
                </td>
              </tr>
            )}
            {!isLoading && (data?.staffPerformance ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-xs"
                  style={{ color: "var(--admin-fg-muted)" }}
                >
                  No assigned orders this month.
                </td>
              </tr>
            )}
            {(data?.staffPerformance ?? []).map((s, i) => {
              const pct = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
              return (
                <tr
                  key={s.user_id}
                  className="border-t"
                  style={{
                    borderColor: "var(--admin-border)",
                    background: i % 2 ? "var(--admin-surface-2)" : "transparent",
                  }}
                >
                  <td className="px-4 py-2" style={{ color: "var(--admin-fg)" }}>
                    {s.name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtN(s.assigned)}</td>
                  <td
                    className="px-4 py-2 text-right tabular-nums"
                    style={{ color: "var(--admin-success)" }}
                  >
                    {fmtN(s.completed)}
                  </td>
                  <td
                    className="px-4 py-2 text-right tabular-nums"
                    style={{ color: "var(--admin-warn)" }}
                  >
                    {fmtN(s.pending)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
    >
      <div
        className="text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--admin-fg-muted)" }}
      >
        {label}
      </div>
      {loading ? (
        <div
          className="mt-2 h-7 w-24 animate-pulse rounded"
          style={{ background: "var(--admin-surface-2)" }}
        />
      ) : (
        <div
          className="mt-1 text-2xl font-medium tabular-nums"
          style={{ color: "var(--admin-fg)" }}
        >
          {value}
        </div>
      )}
      {hint && !loading && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── FINANCE TAB ───────────────────────────
function FinanceTab() {
  const { formatINR } = useFinancialVisibility();
  const today = todayIST();
  const [from, setFrom] = useState(monthIST() + "-01");
  const [to, setTo] = useState(today);
  const fn = useServerFn(getFinanceReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["finance-report", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });

  if (error) {
    return (
      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--admin-border)", color: "var(--admin-danger)" }}
      >
        {(error as any)?.message ?? "Failed to load finance report"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={{
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
          }}
          onChange={(range) => {
            setFrom(range.from ? range.from.toISOString().slice(0, 10) : "");
            setTo(range.to ? range.to.toISOString().slice(0, 10) : "");
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Total Revenue"
          value={data ? formatINR(data.revenue) : "—"}
          loading={isLoading}
        />
        <Stat
          label="GST Collected"
          value={data ? formatINR(data.gst.total) : "—"}
          loading={isLoading}
        />
        <Stat
          label="Refunds Issued"
          value={data ? formatINR(data.refunds.total) : "—"}
          loading={isLoading}
          hint={data ? `${data.refunds.count} refunds` : undefined}
        />
        <Stat
          label="Pending Payments"
          value={data ? formatINR(data.pending.total) : "—"}
          loading={isLoading}
          hint={data ? `${data.pending.count} unpaid` : undefined}
        />
      </div>

      <SectionCard title="GST Breakdown">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Taxable Base", data?.gst.base ?? 0],
              ["CGST", data?.gst.cgst ?? 0],
              ["SGST", data?.gst.sgst ?? 0],
              ["IGST", data?.gst.igst ?? 0],
              ["Total GST", data?.gst.total ?? 0],
            ].map(([label, val], i) => (
              <tr
                key={label as string}
                className="border-t"
                style={{
                  borderColor: "var(--admin-border)",
                  background: i % 2 ? "var(--admin-surface-2)" : "transparent",
                }}
              >
                <td className="px-4 py-2" style={{ color: "var(--admin-fg)" }}>
                  {label}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatINR(val as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <Expandable
        title={`Refunds (${data?.refunds.count ?? 0})`}
        loading={isLoading}
        rows={(data?.refunds.rows ?? []).map((r: any) => ({
          id: r.id,
          primary: r.leads?.name ?? r.leads?.lead_code ?? "—",
          secondary: formatINR(Number(r.amount ?? 0)),
          tail: formatIST(r.created_at),
        }))}
      />
      <Expandable
        title={`Pending Payments (${data?.pending.count ?? 0})`}
        loading={isLoading}
        rows={(data?.pending.rows ?? []).map((p: any) => ({
          id: p.id,
          primary: p.leads?.name ?? p.leads?.lead_code ?? "—",
          secondary: formatINR(Number(p.amount ?? 0)),
          tail: formatIST(p.created_at),
        }))}
      />
    </div>
  );
}

// ─────────────────────────── AUDIT TAB ───────────────────────────
function AuditTab() {
  const [page, setPage] = useState(1);
  const [tableName, setTableName] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const fn = useServerFn(listAuditLog);
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", page, tableName, from, to],
    queryFn: () =>
      fn({
        data: {
          page,
          pageSize: 25,
          tableName: tableName || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      }),
  });

  if (error) {
    return (
      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--admin-border)", color: "var(--admin-danger)" }}
      >
        {(error as any)?.message ?? "Failed to load audit log"}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tableName}
          onChange={(e) => {
            setTableName(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
        >
          <option value="">All tables</option>
          {(data?.tableNames ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <DateRangePicker
          value={{
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
          }}
          onChange={(range) => {
            setFrom(range.from ? range.from.toISOString().slice(0, 10) : "");
            setTo(range.to ? range.to.toISOString().slice(0, 10) : "");
            setPage(1);
          }}
        />
      </div>

      <SectionCard>
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-[11px] uppercase tracking-wide"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              <th className="px-4 py-2">Timestamp (IST)</th>
              <th className="px-4 py-2">Staff</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Table</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Changes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6}>
                  <TableSkeleton rows={6} cols={6} />
                </td>
              </tr>
            )}
            {!isLoading && (data?.rows ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-xs"
                  style={{ color: "var(--admin-fg-muted)" }}
                >
                  No audit entries match these filters.
                </td>
              </tr>
            )}
            {(data?.rows ?? []).map((r: any, i: number) => (
              <AuditRow key={r.id} row={r} alt={i % 2 === 1} />
            ))}
          </tbody>
        </table>

        <footer
          className="flex items-center justify-between border-t px-4 py-2 text-xs"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg-muted)" }}
        >
          <span>
            {data?.total ? `Page ${page} of ${totalPages} · ${fmtN(data.total)} entries` : "0 entries"}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-40"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <ChevronLeft className="size-3" /> Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-40"
              style={{ borderColor: "var(--admin-border)" }}
            >
              Next <ChevronRight className="size-3" />
            </button>
          </div>
        </footer>
      </SectionCard>
    </div>
  );
}

function AuditRow({ row, alt }: { row: any; alt: boolean }) {
  const [open, setOpen] = useState(false);
  const fields = Array.isArray(row.changed_fields) ? row.changed_fields : [];
  return (
    <>
      <tr
        className="border-t"
        style={{
          borderColor: "var(--admin-border)",
          background: alt ? "var(--admin-surface-2)" : "transparent",
        }}
      >
        <td className="px-4 py-2 text-xs" style={{ color: "var(--admin-fg-muted)" }}>
          {formatIST(row.created_at)}
        </td>
        <td className="px-4 py-2 text-xs" style={{ color: "var(--admin-fg)" }}>
          {row.changed_by_name ?? "System"}
        </td>
        <td className="px-4 py-2 text-[11px] uppercase" style={{ color: "var(--admin-fg-muted)" }}>
          {row.changed_by_role ?? "—"}
        </td>
        <td className="px-4 py-2 font-mono text-xs">{row.table_name}</td>
        <td className="px-4 py-2 text-xs">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
            style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg)" }}
          >
            {row.action}
          </span>
        </td>
        <td className="px-4 py-2 text-xs">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1"
            style={{ color: "var(--admin-accent)" }}
          >
            {open ? "Hide" : `${fields.length || "View"} changes`}
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        </td>
      </tr>
      {open && (
        <tr style={{ background: "var(--admin-surface-2)" }}>
          <td colSpan={6} className="px-4 py-2 text-[11px]">
            <pre
              className="overflow-x-auto whitespace-pre-wrap"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              {JSON.stringify(
                {
                  record_id: row.record_id,
                  changed_fields: row.changed_fields,
                  old: row.old_data,
                  new: row.new_data,
                },
                null,
                2
              )}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}
