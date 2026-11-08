// Shared executive / super-admin dashboard. Clean shadcn UI, IST date-range aware.
// Mounted by both /admin/dashboard and /admin/super (super-mode adds quick actions).
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useState, memo, useRef } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Activity, AlertTriangle, Bell, Briefcase, Database, Eye, EyeOff, Mail,
  RefreshCw, Send, ShieldCheck, ShoppingBag, Target, TrendingDown, TrendingUp,
  UserCheck, Users, Wallet, Globe,
} from "lucide-react";
import {
  getDashboardKpis,
  getDashboardCharts,
  getDashboardTopServices,
  getDashboardSecondary,
  processEmailQueueNow,
  seedMissingEmailTemplates,
  type RangePreset,
  type DashboardKpisResult,
  type DashboardChartsResult,
  type DashboardTopServicesResult,
  type DashboardSecondaryResult,
} from "@/lib/crm/super-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatIST } from "@/lib/datetime";
import { DateRangePicker } from "./DateRangePicker";
import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";
import { useDashboardPrivacy } from "@/hooks/useDashboardPrivacy";
import { cn } from "@/lib/utils";

const fmtN = (n: number) => new Intl.NumberFormat("en-IN").format(n || 0);

function pctDelta(curr: number, prev: number): { pct: number; up: boolean } | null {
  if (!prev && !curr) return null;
  if (!prev) return { pct: 100, up: true };
  const pct = ((curr - prev) / prev) * 100;
  return { pct: Math.abs(Math.round(pct * 10) / 10), up: pct >= 0 };
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "15d", label: "15 days" },
  { value: "30d", label: "30 days" },
  { value: "mtd", label: "This month" },
  { value: "custom", label: "Custom" },
];

export type DashboardRange = {
  preset: RangePreset;
  fromIso?: string;
  toIso?: string;
};

export function SuperAdminDashboard({
  superMode = false,
  range,
  onRangeChange,
  title = "Executive Dashboard",
}: {
  superMode?: boolean;
  range: DashboardRange;
  onRangeChange: (r: DashboardRange) => void;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const fetchKpis = useServerFn(getDashboardKpis);
  const fetchCharts = useServerFn(getDashboardCharts);
  const fetchTopServices = useServerFn(getDashboardTopServices);
  const fetchSecondary = useServerFn(getDashboardSecondary);

  const isToday = range.preset === "today";
  const kpiStaleTime = isToday ? 30_000 : 300_000;
  const analyticsStaleTime = isToday ? 60_000 : 300_000;

  // 1. Critical KPIs query (priority 1 — loads first)
  const kpisQuery = useQuery<DashboardKpisResult>({
    queryKey: ["dash-kpis", range.preset, range.fromIso ?? "", range.toIso ?? ""],
    queryFn: () => fetchKpis({ data: range }),
    placeholderData: keepPreviousData,
    refetchInterval: isToday ? 60_000 : false,
    staleTime: kpiStaleTime,
  });

  // 2. Trend chart query (loads independently)
  const chartsQuery = useQuery<DashboardChartsResult>({
    queryKey: ["dash-charts", range.preset, range.fromIso ?? "", range.toIso ?? ""],
    queryFn: () => fetchCharts({ data: range }),
    placeholderData: keepPreviousData,
    refetchInterval: isToday ? 60_000 : false,
    staleTime: analyticsStaleTime,
  });

  // 3. Top services query (loads independently)
  const topServicesQuery = useQuery<DashboardTopServicesResult>({
    queryKey: ["dash-top-services", range.preset, range.fromIso ?? "", range.toIso ?? ""],
    queryFn: () => fetchTopServices({ data: range }),
    placeholderData: keepPreviousData,
    refetchInterval: isToday ? 60_000 : false,
    staleTime: analyticsStaleTime,
  });

  // 4. Secondary features query (loads independently)
  const secondaryQuery = useQuery<DashboardSecondaryResult>({
    queryKey: ["dash-secondary", range.preset, range.fromIso ?? "", range.toIso ?? ""],
    queryFn: () => fetchSecondary({ data: range }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  // Staggered background prefetch for common ranges (after Today loads)
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!kpisQuery.data || prefetchedRef.current || range.preset !== "today") return;
    prefetchedRef.current = true;

    const commonPresets: RangePreset[] = ["7d", "15d", "30d", "mtd"];
    const timeouts: NodeJS.Timeout[] = [];

    commonPresets.forEach((preset, index) => {
      const delay = (index + 1) * 800; // 800ms, 1600ms, 2400ms, 3200ms
      const t = setTimeout(() => {
        const prefetchRange: DashboardRange = { preset };
        queryClient.prefetchQuery({
          queryKey: ["dash-kpis", preset, "", ""],
          queryFn: () => fetchKpis({ data: prefetchRange }),
          staleTime: 300_000,
        });
        queryClient.prefetchQuery({
          queryKey: ["dash-charts", preset, "", ""],
          queryFn: () => fetchCharts({ data: prefetchRange }),
          staleTime: 300_000,
        });
      }, delay);
      timeouts.push(t);
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [kpisQuery.data, range.preset, queryClient, fetchKpis, fetchCharts]);

  const handleRefresh = () => {
    kpisQuery.refetch();
    chartsQuery.refetch();
    topServicesQuery.refetch();
    secondaryQuery.refetch();
  };

  // Live IST clock
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const customFrom = range.fromIso ? new Date(range.fromIso) : undefined;
  const customTo = range.toIso ? new Date(range.toIso) : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live · {formatIST(now, { timeOnly: true })} IST
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {kpisQuery.data?.range.label ?? "Loading…"} · auto-refresh every 60s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={range.preset}
            onValueChange={(v) =>
              onRangeChange({ preset: v as RangePreset, fromIso: range.fromIso, toIso: range.toIso })
            }
          >
            <TabsList className="h-9">
              {PRESETS.map((p) => (
                <TabsTrigger key={p.value} value={p.value} className="text-xs px-2.5">
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {range.preset === "custom" && (
            <DateRangePicker
              from={customFrom}
              to={customTo}
              onChange={(r) =>
                onRangeChange({
                  preset: "custom",
                  fromIso: r.from?.toISOString(),
                  toIso: r.to?.toISOString(),
                })
              }
            />
          )}
        </div>
      </div>

      <KpiGrid data={kpisQuery.data} loading={kpisQuery.isLoading} range={range} />

      <div className="grid gap-4 lg:grid-cols-3">
        <TrendCard data={chartsQuery.data} rangePreset={range.preset} loading={chartsQuery.isLoading} className="lg:col-span-2" />
        <TopServicesCard data={topServicesQuery.data} loading={topServicesQuery.isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <WorkflowCard data={secondaryQuery.data?.workflow} loading={secondaryQuery.isLoading} />
        <EmailQueueCard data={secondaryQuery.data?.emailQueue} loading={secondaryQuery.isLoading} />
        <AlertsCard data={secondaryQuery.data?.alerts} loading={secondaryQuery.isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityCard data={secondaryQuery.data?.activity} loading={secondaryQuery.isLoading} className={superMode ? "lg:col-span-2" : "lg:col-span-3"} />
        {superMode && <SuperActionsCard onChanged={handleRefresh} />}
      </div>
    </div>
  );
}

/* ---------------- KPI (modern light) ---------------- */

type Tone = "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet" | "slate" | "teal";

const TONE_STYLES: Record<Tone, { chip: string; ring: string; value: string; barA: string; barB: string }> = {
  indigo:  { chip: "bg-indigo-50 text-indigo-600",   ring: "ring-indigo-100",  value: "text-slate-900", barA: "bg-indigo-500",  barB: "bg-indigo-200"  },
  emerald: { chip: "bg-emerald-50 text-emerald-600", ring: "ring-emerald-100", value: "text-slate-900", barA: "bg-emerald-500", barB: "bg-emerald-200" },
  amber:   { chip: "bg-amber-50 text-amber-600",     ring: "ring-amber-100",   value: "text-slate-900", barA: "bg-amber-500",   barB: "bg-amber-200"   },
  rose:    { chip: "bg-rose-50 text-rose-600",       ring: "ring-rose-100",    value: "text-slate-900", barA: "bg-rose-500",    barB: "bg-rose-200"    },
  sky:     { chip: "bg-sky-50 text-sky-600",         ring: "ring-sky-100",     value: "text-slate-900", barA: "bg-sky-500",     barB: "bg-sky-200"     },
  violet:  { chip: "bg-violet-50 text-violet-600",   ring: "ring-violet-100",  value: "text-slate-900", barA: "bg-violet-500",  barB: "bg-violet-200"  },
  slate:   { chip: "bg-slate-100 text-slate-600",    ring: "ring-slate-200",   value: "text-slate-900", barA: "bg-slate-500",   barB: "bg-slate-200"   },
  teal:    { chip: "bg-teal-50 text-teal-600",       ring: "ring-teal-100",    value: "text-slate-900", barA: "bg-teal-500",    barB: "bg-teal-200"    },
};

function DeltaPill({ d }: { d: { pct: number; up: boolean } | null }) {
  if (!d) return null;
  const Icon = d.up ? TrendingUp : TrendingDown;
  const cls = d.up ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      <Icon className="size-2.5" /> {d.pct}%
    </span>
  );
}

function StatChip({
  label, value, tone, href,
}: {
  label: string;
  value: string | number;
  tone: "emerald" | "rose" | "amber" | "sky" | "slate" | "indigo" | "violet" | "teal";
  href?: string;
}) {
  const navigate = useNavigate();
  const { isPrivacyEnabled } = useDashboardPrivacy();
  const cls: Record<string, string> = {
    emerald: "text-emerald-700 bg-emerald-50 hover:bg-emerald-100",
    rose: "text-rose-700 bg-rose-50 hover:bg-rose-100",
    amber: "text-amber-700 bg-amber-50 hover:bg-amber-100",
    sky: "text-sky-700 bg-sky-50 hover:bg-sky-100",
    slate: "text-slate-600 bg-slate-100 hover:bg-slate-200",
    indigo: "text-indigo-700 bg-indigo-50 hover:bg-indigo-100",
    violet: "text-violet-700 bg-violet-50 hover:bg-violet-100",
    teal: "text-teal-700 bg-teal-50 hover:bg-teal-100",
  };
  const displayVal = isPrivacyEnabled ? "•••" : (typeof value === "number" ? fmtN(value) : value);
  const body = (
    <>
      <span className="opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">{displayVal}</span>
    </>
  );
  const base = `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls[tone]}`;
  if (href) {
    const [path, qs] = href.split("?");
    const search: Record<string, string> = {};
    if (qs) for (const kv of qs.split("&")) { const [k, v] = kv.split("="); if (k) search[k] = decodeURIComponent(v ?? ""); }
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate({ to: path as never, search: search as never }); }}
        className={`${base} transition-colors cursor-pointer`}
      >
        {body}
      </button>
    );
  }
  return <span className={base}>{body}</span>;
}

function ModernKpi({
  icon, label, value, tone, delta, subs, footer, href, action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: Tone;
  delta?: { pct: number; up: boolean } | null;
  subs?: React.ReactNode;
  footer?: React.ReactNode;
  href?: string;
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { isPrivacyEnabled } = useDashboardPrivacy();
  const t = TONE_STYLES[tone];
  const displayVal = isPrivacyEnabled ? "•••" : value;
  const displayFooter = isPrivacyEnabled && typeof footer === "string" && footer.includes("(")
    ? footer.replace(/\([^)]+\)/, "(••• / •••)")
    : footer;
  const body = (
    <div
      onClick={() => {
        if (!href) return;
        const [path, qs] = href.split("?");
        const search: Record<string, string> = {};
        if (qs) for (const kv of qs.split("&")) { const [k, v] = kv.split("="); if (k) search[k] = decodeURIComponent(v ?? ""); }
        navigate({ to: path as never, search: search as never });
      }}
      className={`group relative flex h-full flex-col rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ring-1 ${t.ring} ${href ? "hover:shadow-md hover:border-slate-300 cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {delta !== undefined && !isPrivacyEnabled && <DeltaPill d={delta ?? null} />}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${t.chip}`}>{icon}</div>
          <div className={`text-2xl font-bold leading-tight tabular-nums truncate ${t.value}`}>{displayVal}</div>
        </div>
        {action}
      </div>
      {subs && <div className="mt-2 flex flex-wrap gap-1">{subs}</div>}
      {displayFooter && <div className="mt-auto pt-2 text-[10px] text-slate-500">{displayFooter}</div>}
    </div>
  );
  return body;
}

const KpiGrid = memo(function KpiGrid({ data, loading, range }: { data?: DashboardKpisResult; loading: boolean; range: DashboardRange }) {
  const { formatShortINR, isFinancialPrivacyEnabled, toggleFinancialPrivacy } = useFinancialVisibility();
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 auto-rows-fr">
        {Array.from({ length: 13 }).map((_, i) => <Skeleton key={i} className="h-[112px] rounded-xl" />)}
      </div>
    );
  }
  const m = data.metrics;
  const leadsDelta = pctDelta(m.uniqueLeads, m.uniqueLeadsPrev);
  const paidDelta = pctDelta(m.paidOrders, m.paidOrdersPrev);
  const ticketsDelta = pctDelta(m.ticketsRaised, m.ticketsRaisedPrev);
  const revDelta = pctDelta(m.revenueInclTax, m.revenueInclTaxPrev);
  const convDelta = pctDelta(m.conversionRate, m.conversionRatePrev);

  const rangeQuery = range.preset === "custom"
    ? (range.fromIso && range.toIso ? `dateFrom=${range.fromIso.slice(0, 10)}&dateTo=${range.toIso.slice(0, 10)}` : "")
    : `preset=${range.preset}`;

  const withRange = (url: string) => {
    if (!rangeQuery) return url;
    return url.includes("?") ? `${url}&${rangeQuery}` : `${url}?${rangeQuery}`;
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 auto-rows-fr">
      <ModernKpi
        icon={<Users className="size-4" />} label="Unique Leads" value={fmtN(m.uniqueLeads)} tone="indigo" delta={leadsDelta}
        href={withRange("/admin/leads")}
        subs={<>
          <StatChip label="Not Contacted" value={m.leadsNotContacted} tone="rose" href={withRange("/admin/leads?filter=not_contacted")} />
          <StatChip label="Contacted" value={m.leadsContacted} tone="sky" href={withRange("/admin/leads?status=contacted")} />
          <StatChip label="Converted" value={m.leadsConverted} tone="emerald" href={withRange("/admin/leads?filter=converted")} />
          <StatChip label="Repeated" value={m.repeatedLeads} tone="amber" href={withRange("/admin/leads?filter=repeated")} />
        </>}
      />
      <ModernKpi
        icon={<ShoppingBag className="size-4" />} label="Orders" value={fmtN(m.paidOrders)} tone="emerald" delta={paidDelta}
        href={withRange("/admin/orders")}
        subs={<>
          <StatChip label="Pending" value={m.paidOrdersPending} tone="amber" href={withRange("/admin/orders?filter=pending")} />
          <StatChip label="Closed" value={m.paidOrdersClosed} tone="emerald" href={withRange("/admin/orders?filter=closed")} />
        </>}
      />
      <ModernKpi
        icon={<AlertTriangle className="size-4" />} label="Technical Delay" value={fmtN(m.technicalDelay)}
        tone={m.technicalDelay > 0 ? "amber" : "slate"}
        href={withRange("/admin/orders?filter=technical_delay")}
        subs={<>
          <StatChip label="Customer Delay" value={m.customerDelay} tone="rose" href={withRange("/admin/orders?filter=customer_delay")} />
          <StatChip label="Form Not Submitted Delay" value={m.formNotSubmitted} tone="amber" href={withRange("/admin/orders?filter=form_not_submitted")} />
        </>}
      />
      <ModernKpi
        icon={<Bell className="size-4" />} label="Order Alerts" value={fmtN(m.ordersDelayed3d)}
        tone={m.ordersDelayed7d > 0 ? "rose" : m.ordersDelayed3d > 0 ? "amber" : "slate"}
        href={withRange("/admin/orders?filter=delayed_3d")}
        subs={<>
          <StatChip label="3+ Days" value={m.ordersDelayed3d} tone="amber" href={withRange("/admin/orders?filter=delayed_3d")} />
          <StatChip label="7+ Days" value={m.ordersDelayed7d} tone="rose" href={withRange("/admin/orders?filter=delayed_7d")} />
        </>}
      />
      <ModernKpi
        icon={<ShieldCheck className="size-4" />} label="Support Tickets Raised" value={fmtN(m.ticketsRaised)} tone={m.ticketsRaised > 0 ? "sky" : "slate"} delta={ticketsDelta}
        href={withRange("/admin/support/tickets")}
        subs={<>
          <StatChip label="Closed" value={m.ticketsClosed} tone="emerald" href={withRange("/admin/support/tickets?status=closed")} />
          <StatChip label="Pending 3+d" value={m.ticketsPending3d} tone="rose" href={withRange("/admin/support/tickets?status=open")} />
        </>}
      />
      <ModernKpi
        icon={<RefreshCw className="size-4" />} label="Refund Requests" value={fmtN(m.refundAccepted + m.refundRejected)} tone="violet"
        href={withRange("/admin/refunds")}
        subs={<>
          <StatChip label="Accepted" value={m.refundAccepted} tone="emerald" href={withRange("/admin/refunds?status=approved")} />
          <StatChip label="Rejected" value={m.refundRejected} tone="rose" href={withRange("/admin/refunds?status=rejected")} />
        </>}
      />
      <ModernKpi
        icon={<Mail className="size-4" />} label="Email Delivery" value={fmtN(m.emailSent + m.emailQueued + m.emailFailed)}
        tone={m.emailFailed > 0 ? "rose" : "teal"}
        href={withRange("/admin/help/email-matrix")}
        subs={<>
          <StatChip label="Sent" value={m.emailSent} tone="emerald" />
          <StatChip label="Queued" value={m.emailQueued} tone="amber" />
          <StatChip label="Failed" value={m.emailFailed} tone="rose" />
        </>}
      />
      <ModernKpi
        icon={<Briefcase className="size-4" />} label="Active Staff" value={fmtN(m.staffActiveToday)} tone="indigo"
        href="/admin/performance"
        subs={<>
          <StatChip label="Total" value={m.staffTotal} tone="slate" />
          <StatChip label="Inactive" value={m.staffInactive} tone="rose" />
        </>}
        footer="Signed in today (IST)"
      />
      <ModernKpi
        icon={<UserCheck className="size-4" />} label="Orders Not Contacted" value={fmtN(m.ordersNotContacted3h)}
        tone={m.ordersNotContacted5h > 0 ? "rose" : m.ordersNotContacted3h > 0 ? "amber" : "slate"}
        href={withRange("/admin/orders?filter=not_contacted")}
        subs={<>
          <StatChip label="3+ hrs" value={m.ordersNotContacted3h} tone="amber" href={withRange("/admin/orders?filter=not_contacted")} />
          <StatChip label="5+ hrs" value={m.ordersNotContacted5h} tone="rose" href={withRange("/admin/orders?filter=not_contacted_5h")} />
        </>}
      />
      <ModernKpi
        icon={<Wallet className="size-4" />} label="Revenue (excl. Tax)" value={formatShortINR(m.revenueExclTax)} tone="emerald" delta={revDelta}
        href="/admin/finance"
        action={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              toggleFinancialPrivacy();
            }}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50/80 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer shadow-2xs"
            title={isFinancialPrivacyEnabled ? "Show financial amounts" : "Hide financial amounts"}
            aria-label="Toggle financial privacy"
          >
            {isFinancialPrivacyEnabled ? (
              <EyeOff className="size-3.5 text-slate-400" />
            ) : (
              <Eye className="size-3.5 text-emerald-600" />
            )}
          </button>
        }
        subs={<>
          <StatChip label="Incl. Tax" value={formatShortINR(m.revenueInclTax)} tone="emerald" href="/admin/finance" />
          <StatChip label="Tax" value={formatShortINR(m.taxCollected)} tone="slate" href="/admin/finance/gst" />
        </>}
      />
      <ModernKpi
        icon={<Target className="size-4" />} label="Conversion %" value={`${m.conversionRate.toFixed(1)}%`} tone="teal" delta={convDelta}
        href="/admin/leads?filter=converted"
        footer={`Paid ÷ Unique Leads (${fmtN(m.paidOrders)} / ${fmtN(m.uniqueLeads)})`}
      />
      <ModernKpi
        icon={<Activity className="size-4" />} label="Webhook Errors (24h)" value={fmtN(m.webhookErrors24h)}
        tone={m.webhookErrors24h > 0 ? "rose" : "emerald"}
        footer={m.webhookErrors24h > 0 ? "Investigate failures" : "All webhooks healthy"}
      />
      <ModernKpi
        icon={<Globe className="size-4" />}
        label="Gateway Status"
        value={
          (data.gatewaysCollected ?? []).filter((g) => g.revenue > 0).length > 1
            ? `${(data.gatewaysCollected ?? []).filter((g) => g.revenue > 0).length} Gateways`
            : (data.gatewaysCollected?.[0]?.name ?? "PayU")
        }
        tone={data.payu.isProduction ? "emerald" : "amber"}
        href="/admin/settings?tab=gateways"
        subs={<>
          {(data.gatewaysCollected ?? []).slice(0, 3).map((gw) => (
            <StatChip
              key={gw.code}
              label={gw.name}
              value={formatShortINR(gw.revenue)}
              tone={gw.revenue > 0 ? "emerald" : "slate"}
              href="/admin/settings?tab=gateways"
            />
          ))}
        </>}
        footer={data.payu.isProduction ? "Live production mode" : "All webhooks healthy"}
      />
    </div>
  );
});

/* ---------------- Custom Tooltip for Chart ---------------- */

function CustomTrendTooltip({ active, payload, label }: any) {
  const { formatINR } = useFinancialVisibility();
  const { isPrivacyEnabled } = useDashboardPrivacy();
  if (!active || !payload || !payload.length) return null;

  const leads = payload.find((p: any) => p.dataKey === "Leads")?.value ?? 0;
  const orders = payload.find((p: any) => p.dataKey === "Orders")?.value ?? 0;
  const revenue = payload.find((p: any) => p.dataKey === "Revenue")?.value ?? 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-md min-w-[175px] text-xs">
      <div className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 mb-2 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] text-slate-400 font-medium">IST</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="size-2 rounded-sm bg-indigo-500" /> Leads
          </span>
          <span className="font-bold font-mono text-indigo-600">{isPrivacyEnabled ? "•••" : fmtN(leads)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="size-2 rounded-sm bg-sky-500" /> Orders
          </span>
          <span className="font-bold font-mono text-sky-600">{isPrivacyEnabled ? "•••" : fmtN(orders)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <span className="size-2 rounded-full bg-emerald-500" /> Revenue
          </span>
          <span className="font-extrabold font-mono text-emerald-600">{isPrivacyEnabled ? "₹••••••" : formatINR(revenue)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Trend (Day-wise & Hourly Time-wise) ---------------- */

const TrendCard = memo(function TrendCard({ data, rangePreset = "today", loading, className }: { data?: DashboardChartsResult; rangePreset?: RangePreset; loading: boolean; className?: string }) {
  const { formatShortINR } = useFinancialVisibility();
  const { isPrivacyEnabled } = useDashboardPrivacy();
  const isSingleDay = rangePreset === "today" || rangePreset === "yesterday";
  const [viewMode, setViewMode] = useState<"days" | "hourly">("days");

  useEffect(() => {
    if (isSingleDay) {
      setViewMode("hourly");
    } else {
      setViewMode("days");
    }
  }, [isSingleDay, rangePreset]);

  const chartData = useMemo(() => {
    if (!data) return [];
    if (viewMode === "hourly" && data.hourly) {
      return data.hourly.hours.map((h, i) => ({
        label: h,
        Leads: data.hourly.leads[i] ?? 0,
        Orders: data.hourly.orders?.[i] ?? 0,
        Revenue: data.hourly.revenueInr[i] ?? 0,
      }));
    }
    return data.days.map((d, i) => ({
      label: d.slice(5), // MM-DD
      Leads: data.leads[i] ?? 0,
      Orders: data.orders?.[i] ?? 0,
      Revenue: data.revenueInr[i] ?? 0,
    }));
  }, [data, viewMode]);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-600" /> Revenue, Leads & Orders ({viewMode === "hourly" ? "Hourly Time-wise" : "Day-wise"})
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">All times in IST · paid payments only · exact counts</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode("days")}
                className={cn(
                  "px-2 py-0.5 rounded-md font-semibold transition cursor-pointer",
                  viewMode === "days" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Day-wise
              </button>
              <button
                type="button"
                onClick={() => setViewMode("hourly")}
                className={cn(
                  "px-2 py-0.5 rounded-md font-semibold transition cursor-pointer",
                  viewMode === "hourly" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Time-wise (Hourly)
              </button>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-indigo-500" /> Leads</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-sky-500" /> Orders</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500" /> Revenue</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">No data in range</div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 12, right: 14, left: -4, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-100" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  stroke="#cbd5e1"
                  tickFormatter={(v) => (isPrivacyEnabled ? "•••" : fmtN(Number(v)))}
                  domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax * 1.15, 10))]}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  stroke="#cbd5e1"
                  tickFormatter={(v) => (isPrivacyEnabled ? "•••" : formatShortINR(Number(v)))}
                  domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax * 1.15, 1000))]}
                />
                <Tooltip content={<CustomTrendTooltip />} />
                <Bar yAxisId="left" dataKey="Leads" fill="#6366F1" radius={[3, 3, 0, 0]} maxBarSize={18} name="Leads" />
                <Bar yAxisId="left" dataKey="Orders" fill="#0EA5E9" radius={[3, 3, 0, 0]} maxBarSize={18} name="Orders" />
                <Area yAxisId="right" type="monotone" dataKey="Revenue" stroke="#10B981" fill="url(#revenueGrad)" strokeWidth={2.5} name="Revenue" dot={false} activeDot={{ r: 5, fill: "#10B981", stroke: "#fff", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

/* ---------------- Top services ---------------- */

const TopServicesCard = memo(function TopServicesCard({ data, loading }: { data?: DashboardTopServicesResult; loading: boolean }) {
  const { formatShortINR } = useFinancialVisibility();
  const { isPrivacyEnabled } = useDashboardPrivacy();
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.revenueInr));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Top Services</CardTitle>
        <p className="text-[11px] text-muted-foreground">By revenue in selected range</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No orders in range</div>
        ) : (
          rows.map((r) => (
            <div key={r.name}>
              <div className="flex justify-between text-xs">
                <span className="truncate pr-2 font-medium">{r.name}</span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {isPrivacyEnabled ? "•••" : formatShortINR(r.revenueInr)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  style={{ width: `${(r.revenueInr / max) * 100}%` }}
                />
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{isPrivacyEnabled ? "••• orders" : `${r.orders} orders`}</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
});

/* ---------------- Workflow ---------------- */

const WorkflowCard = memo(function WorkflowCard({ data, loading }: { data?: DashboardSecondaryResult["workflow"]; loading: boolean }) {
  const { isPrivacyEnabled } = useDashboardPrivacy();
  const items = [
    { label: "External Delay", value: data?.externalDelay ?? 0 },
    { label: "Waiting on Customer", value: data?.onHold ?? 0 },
    { label: "Refunds Pending", value: data?.refundPending ?? 0 },
    { label: "Reminders Due", value: data?.remindersDue ?? 0 },
    { label: "Closed in Range", value: data?.closedInRange ?? 0 },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="size-4" /> Workflow Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
          : items.map((it) => (
              <div key={it.label} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span className="text-sm text-muted-foreground">{it.label}</span>
                <Badge variant={it.value > 0 ? "secondary" : "outline"} className="tabular-nums">
                  {isPrivacyEnabled ? "•••" : fmtN(it.value)}
                </Badge>
              </div>
            ))}
      </CardContent>
    </Card>
  );
});

/* ---------------- Email queue ---------------- */

const EmailQueueCard = memo(function EmailQueueCard({ data, loading }: { data?: DashboardSecondaryResult["emailQueue"]; loading: boolean }) {
  const { isPrivacyEnabled } = useDashboardPrivacy();
  const items = [
    { label: "Queued", value: data?.queued ?? 0, tone: "default" as const },
    { label: "Processing", value: data?.processing ?? 0, tone: "default" as const },
    { label: "Failed", value: data?.failed ?? 0, tone: (data?.failed ?? 0) > 0 ? ("bad" as const) : ("default" as const) },
    { label: "Sent", value: data?.sent ?? 0, tone: "good" as const },
  ];
  const tones: Record<string, string> = {
    default: "",
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-rose-600 dark:text-rose-400",
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Mail className="size-4" /> Email Queue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
          : items.map((it) => (
              <div key={it.label} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span className="text-sm text-muted-foreground">{it.label}</span>
                <span className={`font-semibold tabular-nums ${tones[it.tone]}`}>
                  {isPrivacyEnabled ? "•••" : fmtN(it.value)}
                </span>
              </div>
            ))}
      </CardContent>
    </Card>
  );
});

/* ---------------- Alerts ---------------- */

const AlertsCard = memo(function AlertsCard({ data, loading }: { data?: DashboardSecondaryResult["alerts"]; loading: boolean }) {
  const alerts = data ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4" /> System Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <Skeleton className="h-16 w-full" />}
        {!loading && alerts.length === 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            ✓ All systems healthy. No active alerts.
          </div>
        )}
        {alerts.map((a) => {
          const isHigh = a.severity === "high";
          return (
            <div
              key={a.id}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                isHigh
                  ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"
                  : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
              }`}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{a.message}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
});

/* ---------------- Activity ---------------- */

const ActivityCard = memo(function ActivityCard({
  data, loading, className,
}: {
  data?: DashboardSecondaryResult["activity"]; loading: boolean; className?: string;
}) {
  const items = data ?? [];
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bell className="size-4" /> Recent Activity
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">All timestamps in IST</p>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No recent activity</div>
        ) : (
          <ScrollArea className="h-[260px] pr-3">
            <div className="divide-y divide-border">
              {items.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="text-sm">{a.description}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatIST(a.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
});

/* ---------------- Super actions ---------------- */

function SuperActionsCard({ onChanged }: { onChanged: () => void }) {
  const processQueue = useServerFn(processEmailQueueNow);
  const seed = useServerFn(seedMissingEmailTemplates);

  const processMut = useMutation({
    mutationFn: () => processQueue(),
    onSuccess: () => { toast.success("Email queue processed"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const seedMut = useMutation({
    mutationFn: () => seed(),
    onSuccess: (r) => { toast.success(`Seed complete · ${r.inserted}/${r.total}`); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Database className="size-4" /> Super Actions
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">Super-admin only</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          onClick={() => processMut.mutate()}
          disabled={processMut.isPending}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Send className="size-3.5" />
          {processMut.isPending ? "Processing…" : "Process Email Queue"}
        </Button>
        <Button
          onClick={() => seedMut.mutate()}
          disabled={seedMut.isPending}
          variant="outline"
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Mail className="size-3.5" />
          {seedMut.isPending ? "Seeding…" : "Seed Email Templates"}
        </Button>
        <Separator className="my-2" />
        <Button asChild variant="ghost" size="sm" className="w-full justify-start">
          <a href="/admin/employees">Manage Employees</a>
        </Button>
        <Button asChild variant="ghost" size="sm" className="w-full justify-start">
          <a href="/admin/audit">View Audit Log</a>
        </Button>
      </CardContent>
    </Card>
  );
}
