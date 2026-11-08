import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { formatIST } from "@/lib/datetime";
import { listPaymentLedger, exportRevenueTransactions } from "@/lib/crm/revenue-admin.functions";
import { TransactionDetailDrawer } from "./TransactionDetailDrawer";
import { RevenueExportModal } from "./RevenueExportModal";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import {
  Search, Filter, Download, ChevronLeft, ChevronRight, Eye, RefreshCw, FileText, CheckCircle2,
  Clock, XCircle, RotateCcw, X, ExternalLink
} from "lucide-react";
import { toast } from "sonner";

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

type TabType = "all" | "successful" | "pending" | "failed" | "refunded";

export function PaymentsTransactionLedger({
  rangeDateFrom,
  rangeDateTo,
  rangeLabel = "Selected Range",
  forcedTab,
  onTabChange,
}: {
  rangeDateFrom?: string;
  rangeDateTo?: string;
  rangeLabel?: string;
  forcedTab?: TabType;
  onTabChange?: (t: TabType) => void;
}) {
  const [tabInternal, setTabInternal] = useState<TabType>("successful");
  const tab = forcedTab ?? tabInternal;

  const handleTabClick = (t: TabType) => {
    setTabInternal(t);
    if (onTabChange) onTabChange(t);
    setPage(1);
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [gatewayFilter, setGatewayFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState<number | undefined>();
  const [maxAmount, setMaxAmount] = useState<number | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const activeDateFrom = dateFrom || rangeDateFrom;
  const activeDateTo = dateTo || rangeDateTo;

  const listFn = useServerFn(listPaymentLedger);
  const exportFn = useServerFn(exportRevenueTransactions);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      "admin.paymentLedger", page, pageSize, tab, search, gatewayFilter, methodFilter,
      activeDateFrom, activeDateTo, minAmount, maxAmount
    ],
    queryFn: () =>
      listFn({
        data: {
          page,
          pageSize,
          tab,
          search: search || undefined,
          gateway: gatewayFilter || undefined,
          paymentMethod: methodFilter || undefined,
          dateFrom: activeDateFrom || undefined,
          dateTo: activeDateTo || undefined,
          minAmount,
          maxAmount,
        },
      }),
    staleTime: 30_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const tabCounts = data?.tabCounts ?? { all: 0, successful: 0, pending: 0, failed: 0, refunded: 0 };
  const totalPages = Math.ceil(total / pageSize) || 1;

  const handleExport = async (format: "csv" | "excel") => {
    setExporting(format);
    setExportOpen(false);
    try {
      const res = await exportFn({
        data: {
          tab,
          search: search || undefined,
          gateway: gatewayFilter || undefined,
          paymentMethod: methodFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          minAmount,
          maxAmount,
        },
      });

      if (!res.count) {
        toast.error("No transactions match the selected export criteria.");
        return;
      }

      const content = format === "excel" ? res.excelXml : res.csv;
      const mime = format === "excel" ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8";
      const ext = format === "excel" ? "xls" : "csv";

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue_transactions_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${res.count} transaction(s) to ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setGatewayFilter("");
    setMethodFilter("");
    setDateFrom("");
    setDateTo("");
    setMinAmount(undefined);
    setMaxAmount(undefined);
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    search || gatewayFilter || methodFilter || dateFrom || dateTo || minAmount !== undefined || maxAmount !== undefined
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><CheckCircle2 className="size-3" /> Success</span>;
      case "created":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"><Clock className="size-3" /> Pending</span>;
      case "failed":
      case "attempted":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><XCircle className="size-3" /> Failed</span>;
      case "refunded":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800"><RotateCcw className="size-3" /> Refunded</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const getGatewayBadge = (gw: string) => {
    const g = (gw || "PAYU").toUpperCase();
    const colors: Record<string, string> = {
      PAYU: "bg-emerald-50 text-emerald-700 border-emerald-200",
      CASHFREE: "bg-indigo-50 text-indigo-700 border-indigo-200",
      CCAVENUE: "bg-blue-50 text-blue-700 border-blue-200",
      RAZORPAY: "bg-sky-50 text-sky-700 border-sky-200",
      PHONEPE: "bg-purple-50 text-purple-700 border-purple-200",
    };
    const cls = colors[g] || "bg-slate-50 text-slate-700 border-slate-200";
    return <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-bold ${cls}`}>{g}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Payments & Transactions</h2>
          <p className="text-xs text-slate-500">
            Showing {total.toLocaleString("en-IN")} transaction records across connected gateways.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search TXN ID, Customer, Mobile..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-52 sm:w-64"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${showFilters || hasActiveFilters ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
          >
            <Filter className="size-3.5" /> Filters
            {hasActiveFilters && <span className="size-2 rounded-full bg-indigo-600" />}
          </button>

          {/* Export Button -> opens RevenueExportModal */}
          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium transition-colors"
          >
            <Download className="size-3.5 text-emerald-600" /> Export
          </button>

          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Collapsible Advanced Filters */}
      {showFilters && (
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Advanced Filters</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-indigo-600 hover:underline flex items-center gap-1">
                <X className="size-3" /> Clear All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Gateway</label>
              <select
                value={gatewayFilter}
                onChange={(e) => { setGatewayFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-200 bg-white p-1.5"
              >
                <option value="">All Gateways</option>
                <option value="payu">PayU</option>
                <option value="cashfree">Cashfree</option>
                <option value="ccavenue">CCAvenue</option>
                <option value="razorpay">Razorpay</option>
                <option value="phonepe">PhonePe</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Payment Method</label>
              <select
                value={methodFilter}
                onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-200 bg-white p-1.5"
              >
                <option value="">All Methods</option>
                <option value="upi">UPI</option>
                <option value="card">Credit/Debit Card</option>
                <option value="netbanking">Net Banking</option>
                <option value="wallet">Wallet</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Date Range</label>
              <DateRangePicker
                value={{
                  from: dateFrom ? new Date(dateFrom) : undefined,
                  to: dateTo ? new Date(dateTo) : undefined,
                }}
                onChange={(range) => {
                  const f = range.from ? new Date(range.from) : undefined;
                  if (f) f.setHours(0, 0, 0, 0);
                  const t = range.to ? new Date(range.to) : f ? new Date(f) : undefined;
                  if (t) t.setHours(23, 59, 59, 999);
                  setDateFrom(f ? f.toISOString() : "");
                  setDateTo(t ? t.toISOString() : "");
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick Status Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto text-xs font-medium">
        {(["all", "successful", "pending", "failed", "refunded"] as TabType[]).map((t) => {
          const count = tabCounts[t] ?? 0;
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => handleTabClick(t)}
              className={`px-3.5 py-2.5 -mb-px border-b-2 font-semibold capitalize whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${active ? "border-indigo-600 text-indigo-600 font-bold" : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"}`}
            >
              {t}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-600"}`}>
                {count.toLocaleString("en-IN")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Financial Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3">Sr.</th>
                <th className="px-3.5 py-3">Date & Time (IST)</th>
                <th className="px-3.5 py-3">Transaction ID</th>
                <th className="px-3.5 py-3">Order Ref</th>
                <th className="px-3.5 py-3">Customer</th>
                <th className="px-3.5 py-3">Service</th>
                <th className="px-3.5 py-3 text-right">Amount</th>
                <th className="px-3.5 py-3">Gateway</th>
                <th className="px-3.5 py-3">Status</th>
                <th className="px-3.5 py-3 text-center">Invoice</th>
                <th className="px-3.5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={11} className="px-3.5 py-3.5 h-12 bg-slate-50/50" />
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    No transaction records match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((r: any, idx: number) => {
                  const lead = r.leads;
                  const app = r.applications;
                  const invoice = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
                  const srNo = (page - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedPaymentId(r.id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="px-3.5 py-3 text-slate-400 font-mono">{srNo}</td>
                      <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap">
                        <div>{formatIST(r.payment_date || r.created_at, { dateOnly: true })}</div>
                        <div className="text-[10px] text-slate-400">{formatIST(r.payment_date || r.created_at, { timeOnly: true })} IST</div>
                      </td>
                      <td className="px-3.5 py-3 font-mono font-medium text-slate-800">
                        {r.transaction_id || "—"}
                      </td>
                      <td className="px-3.5 py-3 font-mono font-bold text-indigo-600">
                        {app?.application_code ? (
                          <Link to="/admin/orders" search={{ search: app.application_code }} onClick={(e) => e.stopPropagation()} className="hover:underline flex items-center gap-1">
                            {app.application_code} <ExternalLink className="size-2.5 opacity-50" />
                          </Link>
                        ) : lead?.lead_code ? (
                          <Link to="/admin/leads" search={{ search: lead.lead_code }} onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {lead.lead_code}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3.5 py-3 font-medium text-slate-900">
                        <div>{lead?.name || "—"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{lead?.mobile || "—"}</div>
                      </td>
                      <td className="px-3.5 py-3 text-slate-700 max-w-[180px] truncate" title={lead?.service}>
                        {lead?.service || "UDYAM Registration"}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">
                        {fmtINR(r.amount)}
                      </td>
                      <td className="px-3.5 py-3">
                        {getGatewayBadge(r.gateway_name)}
                      </td>
                      <td className="px-3.5 py-3">
                        {getStatusBadge(r.status)}
                      </td>
                      <td className="px-3.5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {invoice?.invoice_number ? (
                          <a
                            href={`/api/public/invoice/${lead?.lead_code}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-mono text-[11px]"
                            title="View Invoice"
                          >
                            <FileText className="size-3" /> {invoice.invoice_number}
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedPaymentId(r.id)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-600 transition-colors"
                          title="View Transaction Details"
                        >
                          <Eye className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs bg-slate-50">
          <div className="text-slate-500">
            Showing <span className="font-semibold text-slate-800">{rows.length > 0 ? (page - 1) * pageSize + 1 : 0}</span> to{" "}
            <span className="font-semibold text-slate-800">{Math.min(page * pageSize, total)}</span> of{" "}
            <span className="font-semibold text-slate-800">{total.toLocaleString("en-IN")}</span> transactions
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-slate-600">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-2 font-medium">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Detail Side Drawer */}
      <TransactionDetailDrawer
        paymentId={selectedPaymentId}
        onClose={() => setSelectedPaymentId(null)}
      />

      {/* Export Configuration Modal */}
      <RevenueExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        defaultDateFrom={activeDateFrom}
        defaultDateTo={activeDateTo}
        defaultTab={tab}
        defaultGateway={gatewayFilter}
        defaultSearch={search}
      />
    </div>
  );
}
