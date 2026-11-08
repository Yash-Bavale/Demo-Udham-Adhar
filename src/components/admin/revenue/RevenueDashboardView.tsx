import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatIST } from "@/lib/datetime";
import {
  getRevenueOverview, exportRevenueTransactions, exportDayWiseRevenue, type RevenueRangePreset, type RevenueGateway, type RevenueService, type RevenueTrendPoint
} from "@/lib/crm/revenue-admin.functions";
import { PaymentsTransactionLedger } from "./PaymentsTransactionLedger";
import { RevenueExportModal } from "./RevenueExportModal";
import { DateRangePicker, type DateRangePresetKey } from "@/components/ui/DateRangePicker";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend
} from "recharts";
import {
  TrendingUp, TrendingDown, IndianRupee, CreditCard, CheckCircle2, XCircle, Clock, RotateCcw,
  RefreshCw, Download, Calendar, Layers, Award, Zap, ShieldCheck, HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fmtN = (n: number) => new Intl.NumberFormat("en-IN").format(n || 0);
const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

function pctDelta(curr: number, prev: number): { pct: number; up: boolean } | null {
  if (!prev && !curr) return null;
  if (!prev) return { pct: 100, up: true };
  const pct = ((curr - prev) / prev) * 100;
  return { pct: Math.abs(Math.round(pct * 10) / 10), up: pct >= 0 };
}

function DeltaBadge({ d }: { d: { pct: number; up: boolean } | null }) {
  if (!d) return null;
  const Icon = d.up ? TrendingUp : TrendingDown;
  const cls = d.up ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      <Icon className="size-3" /> {d.up ? "+" : "-"}{d.pct}%
    </span>
  );
}

const PRESETS: { value: RevenueRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_fy", label: "This FY" },
  { value: "custom", label: "Custom" },
];

const GW_COLORS: Record<string, string> = {
  PAYU: "#10B981",
  CASHFREE: "#6366F1",
  CCAVENUE: "#3B82F6",
  RAZORPAY: "#0EA5E9",
  PHONEPE: "#8B5CF6",
};

export function RevenueDashboardView() {
  const [preset, setPreset] = useState<RevenueRangePreset>("today");
  const [fromIso, setFromIso] = useState<string | undefined>();
  const [toIso, setToIso] = useState<string | undefined>();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const getOverviewFn = useServerFn(getRevenueOverview);
  const exportFn = useServerFn(exportRevenueTransactions);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin.revenueOverview", preset, fromIso, toIso],
    queryFn: () => getOverviewFn({ data: { preset, fromIso, toIso } }),
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const handleManualRefresh = async () => {
    try {
      await getOverviewFn({ data: { preset, fromIso, toIso, forceRefresh: true } });
      await refetch();
      toast.success("Revenue data refreshed from DB");
    } catch {
      toast.error("Failed to refresh revenue data");
    }
  };

  const m = data?.metrics;
  const gateways = (data?.gateways ?? []) as RevenueGateway[];
  const services = (data?.services ?? []) as RevenueService[];
  const trends = (data?.trends ?? []) as RevenueTrendPoint[];

  const revDelta = pctDelta(m?.grossRevenue ?? 0, m?.grossRevenuePrev ?? 0);
  const netDelta = pctDelta(m?.netRevenue ?? 0, m?.netRevenuePrev ?? 0);
  const paidDelta = pctDelta(m?.successfulPaymentsCount ?? 0, m?.successfulPaymentsCountPrev ?? 0);
  const aovDelta = pctDelta(m?.averageOrderValue ?? 0, m?.averageOrderValuePrev ?? 0);
  const srDelta = pctDelta(m?.paymentSuccessRate ?? 0, m?.paymentSuccessRatePrev ?? 0);

  const handleExport = async (format: "csv" | "excel") => {
    setExporting(format);
    setExportModalOpen(false);
    try {
      const res = await exportFn({
        data: {
          dateFrom: data?.range?.startIso,
          dateTo: data?.range?.endIso,
        },
      });

      if (!res.count) {
        toast.error("No revenue data to export.");
        return;
      }

      const content = format === "excel" ? res.excelXml : res.csv;
      const mime = format === "excel" ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8";
      const ext = format === "excel" ? "xls" : "csv";

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue_overview_${preset}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${res.count} record(s) to ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const [dayExporting, setDayExporting] = useState<"csv" | "excel" | null>(null);
  const dayWiseFn = useServerFn(exportDayWiseRevenue);
  const handleDayWiseExport = async (format: "csv" | "excel") => {
    setDayExporting(format);
    try {
      const res = await dayWiseFn({ data: { preset, fromIso, toIso } });
      const content = format === "excel" ? res.excelXml : res.csv;
      const blob = new Blob([content], { type: format === "excel" ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daywise_revenue_${preset}_${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xls" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.days} day(s) of revenue`);
    } catch (e: any) {
      toast.error(e?.message || "Day-wise export failed");
    } finally {
      setDayExporting(null);
    }
  };

  const donutData = gateways.map((g) => ({
    name: g.name,
    value: g.grossRevenue,
    color: GW_COLORS[g.name] || "#64748B",
  }));

  const [ledgerTab, setLedgerTab] = useState<"all" | "successful" | "pending" | "failed" | "refunded">("successful");

  const filterLedger = (tab: "all" | "successful" | "pending" | "failed" | "refunded") => {
    setLedgerTab(tab);
    const el = document.getElementById("transaction-ledger");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Date Controls */}
      <div className="flex flex-col gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Financial Engine · {formatIST(now, { timeOnly: true })} IST
              {data?.isCached && (
                <span className="bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full text-[10px] uppercase">
                  ⚡ Cache (Fast)
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Revenue & Payments</h1>
            <p className="text-xs text-slate-500">
              {data?.range?.label ?? "Loading…"} overview · Gross, Base Revenue (Excl. Tax), Gateway split & Audit ledger
            </p>
          </div>

          {/* Date Filter & Export Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              preset={preset as DateRangePresetKey}
              onPresetChange={() => {
                /* handled in onChange so custom dates are not wiped */
              }}
              value={{
                from: fromIso ? new Date(fromIso) : undefined,
                to: toIso ? new Date(toIso) : undefined,
              }}
              onChange={(range, pKey) => {
                // Hand-picked dates must be applied as a custom range covering whole days,
                // otherwise the server keeps using the previous preset (e.g. "Today").
                const isPreset = pKey && pKey !== "custom" && pKey !== "15d";
                if (isPreset) {
                  setPreset(pKey as RevenueRangePreset);
                  setFromIso(undefined);
                  setToIso(undefined);
                  return;
                }
                setPreset("custom" as RevenueRangePreset);
                const from = range.from ? new Date(range.from) : undefined;
                if (from) from.setHours(0, 0, 0, 0);
                const to = range.to ? new Date(range.to) : from ? new Date(from) : undefined;
                if (to) to.setHours(23, 59, 59, 999);
                setFromIso(from ? from.toISOString() : undefined);
                setToIso(to ? to.toISOString() : undefined);
              }}
            />

            {/* Export Button -> opens RevenueExportModal */}
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Download className="size-4 text-emerald-600" /> Export
            </button>

            <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-xs text-xs font-semibold overflow-hidden">
              <span className="flex items-center gap-1.5 px-3 py-2 text-slate-700 border-r border-slate-200">
                <Calendar className="size-4 text-emerald-600" /> Day-wise
              </span>
              <button
                onClick={() => handleDayWiseExport("csv")}
                disabled={!!dayExporting}
                className="px-2.5 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                {dayExporting === "csv" ? "…" : "CSV"}
              </button>
              <button
                onClick={() => handleDayWiseExport("excel")}
                disabled={!!dayExporting}
                className="px-2.5 py-2 text-slate-700 hover:bg-slate-50 border-l border-slate-200 disabled:opacity-50 cursor-pointer"
              >
                {dayExporting === "excel" ? "…" : "Excel"}
              </button>
            </div>

            <button
              onClick={handleManualRefresh}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-xs transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
              title="Refresh Data from DB"
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Date Range Preset Strip */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick Range:</span>
          {[
            { key: "today", label: "Today" },
            { key: "yesterday", label: "Yesterday" },
            { key: "7d", label: "Last 7 Days" },
            { key: "30d", label: "Last 30 Days" },
            { key: "this_month", label: "This Month" },
            { key: "last_month", label: "Last Month" },
            { key: "this_fy", label: "This FY" },
          ].map((item) => {
            const isActive = preset === item.key && !fromIso && !toIso;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setPreset(item.key as RevenueRangePreset);
                  setFromIso(undefined);
                  setToIso(undefined);
                }}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none border",
                  isActive
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 1: Primary Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Revenue */}
        <div
          onClick={() => filterLedger("successful")}
          className="p-4 rounded-2xl border border-emerald-200/80 bg-linear-to-br from-emerald-50/50 to-white shadow-xs relative overflow-hidden cursor-pointer hover:border-emerald-400 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Gross Revenue</span>
            <DeltaBadge d={revDelta} />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono">
            {isLoading ? "…" : fmtINR(m?.grossRevenue ?? 0)}
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 font-medium group-hover:underline">
            Click to view successful transactions ↓
          </div>
        </div>

        {/* Revenue Excl. Tax (Base Amount) */}
        <div
          onClick={() => filterLedger("successful")}
          className="p-4 rounded-2xl border border-indigo-200/80 bg-linear-to-br from-indigo-50/50 to-white shadow-xs relative overflow-hidden cursor-pointer hover:border-indigo-400 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">Revenue (Excl. Tax)</span>
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">BASE AMOUNT</span>
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono">
            {isLoading ? "…" : fmtINR(m?.grossBase ?? 0)}
          </div>
          <div className="mt-2 text-[11px] text-indigo-600 font-medium group-hover:underline">
            18% GST ({fmtINR(m?.grossGst ?? 0)}) excluded
          </div>
        </div>

        {/* Successful Payments */}
        <div
          onClick={() => filterLedger("successful")}
          className="p-4 rounded-2xl border border-emerald-200/80 bg-white shadow-xs cursor-pointer hover:border-emerald-400 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Successful Payments</span>
            <DeltaBadge d={paidDelta} />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono">
            {isLoading ? "…" : fmtN(m?.successfulPaymentsCount ?? 0)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 group-hover:underline">
            {m?.totalAttempts ?? 0} total attempt(s) in this range
          </div>
        </div>

        {/* Refunded Amount */}
        <div
          onClick={() => filterLedger("refunded")}
          className="p-4 rounded-2xl border border-purple-200/80 bg-linear-to-br from-purple-50/30 to-white shadow-xs cursor-pointer hover:border-purple-400 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Refunded Amount</span>
            <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
              {m?.refundsCount ?? 0} refund(s)
            </span>
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono">
            {isLoading ? "…" : fmtINR(m?.refundedAmount ?? 0)}
          </div>
          <div className="mt-2 text-[11px] text-purple-600 font-medium group-hover:underline">
            Approved refunds in this range
          </div>
        </div>
      </div>

      {/* Row 2: Secondary Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => filterLedger("failed")}
          className="p-3.5 rounded-xl border border-slate-200 bg-white text-xs cursor-pointer hover:border-rose-300 transition-all group"
        >
          <div className="text-slate-500 flex items-center justify-between">
            <span>Failed Payments</span>
            <span className="text-[10px] text-rose-600 font-medium group-hover:underline">Filter ↓</span>
          </div>
          <div className="text-lg font-bold text-rose-600 font-mono mt-0.5">{m?.failedPaymentsCount ?? 0}</div>
          <div className="text-[10px] text-slate-400">{fmtINR(m?.failedPaymentsAmount ?? 0)} failed attempt volume</div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-xs">
          <div className="text-slate-500 flex items-center justify-between">
            <span>Average Order Value</span>
            <DeltaBadge d={aovDelta} />
          </div>
          <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">{fmtINR(m?.averageOrderValue ?? 0)}</div>
          <div className="text-[10px] text-slate-400">Gross ÷ Paid Orders</div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-xs">
          <div className="text-slate-500 flex items-center justify-between">
            <span>Payment Success Rate</span>
            <DeltaBadge d={srDelta} />
          </div>
          <div className="text-lg font-bold text-emerald-600 font-mono mt-0.5">{m?.paymentSuccessRate ?? 0}%</div>
          <div className="text-[10px] text-slate-400">Paid ÷ Total Attempts</div>
        </div>
      </div>

      {/* Row 3: Revenue Trend & Gateway Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Revenue Trend Analysis</h3>
              <p className="text-xs text-slate-500">Gross vs Net Revenue collection trajectory</p>
            </div>
          </div>

          <div className="h-64 w-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Loading chart…</div>
            ) : trends.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No revenue data for this range</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "12px" }}
                    formatter={(val: any) => [fmtINR(Number(val)), ""]}
                  />
                  <Bar dataKey="grossRevenue" name="Gross Revenue" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Line type="monotone" dataKey="netRevenue" name="Net Revenue" stroke="#6366F1" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gateway Revenue Share Chart */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Gateway Revenue Split</h3>
            <p className="text-xs text-slate-500">Distribution across active gateways</p>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {isLoading ? (
              <div className="text-xs text-slate-400">Loading donut…</div>
            ) : donutData.length === 0 ? (
              <div className="text-xs text-slate-400">No gateway transactions</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [fmtINR(Number(v)), "Revenue"]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Gateway Analysis Table */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Gateway Performance Analysis</h3>
            <p className="text-xs text-slate-500">Detailed metric breakdown by payment gateway</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-2.5">Gateway</th>
                <th className="px-3.5 py-2.5 text-center">Attempts</th>
                <th className="px-3.5 py-2.5 text-center">Successful</th>
                <th className="px-3.5 py-2.5 text-center">Failed</th>
                <th className="px-3.5 py-2.5 text-center">Pending</th>
                <th className="px-3.5 py-2.5 text-right">Gross Revenue</th>
                <th className="px-3.5 py-2.5 text-right">Net Revenue</th>
                <th className="px-3.5 py-2.5 text-center">Success Rate</th>
                <th className="px-3.5 py-2.5 text-right">Avg Txn Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="px-3.5 py-3 h-10 bg-slate-50/50" />
                  </tr>
                ))
              ) : gateways.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No gateway data recorded</td>
                </tr>
              ) : (
                gateways.map((g) => (
                  <tr key={g.name} className="hover:bg-slate-50/80">
                    <td className="px-3.5 py-3 font-bold text-slate-900 flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: GW_COLORS[g.name] || "#64748B" }} />
                      {g.name}
                    </td>
                    <td className="px-3.5 py-3 text-center font-mono">{fmtN(g.totalAttempts)}</td>
                    <td className="px-3.5 py-3 text-center font-mono font-semibold text-emerald-700">{fmtN(g.successfulCount)}</td>
                    <td className="px-3.5 py-3 text-center font-mono text-rose-600">{fmtN(g.failedCount)}</td>
                    <td className="px-3.5 py-3 text-center font-mono text-amber-600">{fmtN(g.pendingCount)}</td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">{fmtINR(g.grossRevenue)}</td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-700">{fmtINR(g.netRevenue)}</td>
                    <td className="px-3.5 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${g.successRate}%` }} />
                        </div>
                        <span className="font-mono font-bold text-slate-800">{g.successRate}%</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono text-slate-700">{fmtINR(g.avgTransactionValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 5: Service Revenue Analysis Table */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Service-Wise Revenue</h3>
          <p className="text-xs text-slate-500">Revenue generation breakdown by service offering</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-2.5">Service Name</th>
                <th className="px-3.5 py-2.5 text-center">Paid Orders</th>
                <th className="px-3.5 py-2.5 text-right">Gross Revenue</th>
                <th className="px-3.5 py-2.5 text-right">Refunds</th>
                <th className="px-3.5 py-2.5 text-right">Net Revenue</th>
                <th className="px-3.5 py-2.5 text-right">Avg Order Value</th>
                <th className="px-3.5 py-2.5 text-right">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-3.5 py-3 h-10 bg-slate-50/50" />
                  </tr>
                ))
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No service revenue data recorded</td>
                </tr>
              ) : (
                services.map((s) => (
                  <tr key={s.serviceName} className="hover:bg-slate-50/80">
                    <td className="px-3.5 py-3 font-semibold text-slate-900">{s.serviceName}</td>
                    <td className="px-3.5 py-3 text-center font-mono font-semibold">{fmtN(s.paidOrders)}</td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">{fmtINR(s.grossRevenue)}</td>
                    <td className="px-3.5 py-3 text-right font-mono text-purple-700">{fmtINR(s.refunds)}</td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-700">{fmtINR(s.netRevenue)}</td>
                    <td className="px-3.5 py-3 text-right font-mono text-slate-700">{fmtINR(s.avgOrderValue)}</td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-indigo-600">{s.pctTotal}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 6: Embedded Detailed Transactions Ledger */}
      <div id="transaction-ledger">
        <PaymentsTransactionLedger
          rangeDateFrom={data?.range?.startIso}
          rangeDateTo={data?.range?.endIso}
          rangeLabel={data?.range?.label}
          forcedTab={ledgerTab}
          onTabChange={setLedgerTab}
        />
      </div>

      {/* Export Configuration Modal */}
      <RevenueExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        defaultDateFrom={data?.range?.startIso}
        defaultDateTo={data?.range?.endIso}
        defaultTab={ledgerTab}
      />
    </div>
  );
}
