import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { exportRevenueTransactions } from "@/lib/crm/revenue-admin.functions";
import {
  X, Download, FileSpreadsheet, FileText, CheckSquare, Square, Filter, Calendar, Layers, ShieldCheck
} from "lucide-react";
import { toast } from "sonner";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  defaultTab?: "all" | "successful" | "pending" | "failed" | "refunded";
  defaultGateway?: string;
  defaultSearch?: string;
}

const AVAILABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "srNo", label: "Sr. No." },
  { key: "date", label: "Date & Time (IST)" },
  { key: "txnId", label: "Transaction ID" },
  { key: "orderCode", label: "Order Code" },
  { key: "customerName", label: "Customer Name" },
  { key: "mobile", label: "Mobile Number" },
  { key: "email", label: "Email Address" },
  { key: "state", label: "State" },
  { key: "service", label: "Service Name" },
  { key: "baseAmount", label: "Base Amount (Excl. Tax)" },
  { key: "gstAmount", label: "GST Amount (18%)" },
  { key: "totalAmount", label: "Total Amount (₹)" },
  { key: "gateway", label: "Payment Gateway" },
  { key: "method", label: "Payment Method" },
  { key: "status", label: "Payment Status" },
  { key: "invoiceNo", label: "Invoice Number" },
  { key: "gatewayRef", label: "Gateway Ref ID" },
];

export function RevenueExportModal({
  isOpen,
  onClose,
  defaultDateFrom,
  defaultDateTo,
  defaultTab = "all",
  defaultGateway = "",
  defaultSearch = "",
}: ExportModalProps) {
  const [format, setFormat] = useState<"csv" | "excel">("csv");
  const [scope, setScope] = useState<"filtered" | "range" | "all">("filtered");
  const [tab, setTab] = useState<"all" | "successful" | "pending" | "failed" | "refunded">(defaultTab);
  const [gateway, setGateway] = useState<string>(defaultGateway);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [selectedCols, setSelectedCols] = useState<string[]>(AVAILABLE_COLUMNS.map((c) => c.key));
  const [isExporting, setIsExporting] = useState(false);

  const exportFn = useServerFn(exportRevenueTransactions);

  if (!isOpen) return null;

  const toggleColumn = (key: string) => {
    if (selectedCols.includes(key)) {
      if (selectedCols.length === 1) {
        toast.error("At least one column must be selected.");
        return;
      }
      setSelectedCols(selectedCols.filter((k) => k !== key));
    } else {
      setSelectedCols([...selectedCols, key]);
    }
  };

  const selectAllCols = () => setSelectedCols(AVAILABLE_COLUMNS.map((c) => c.key));
  const deselectAllCols = () => setSelectedCols(["srNo", "date", "txnId", "customerName", "totalAmount", "status"]);

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const res = await exportFn({
        data: {
          format,
          scope,
          tab,
          gateway: gateway || undefined,
          paymentMethod: paymentMethod || undefined,
          dateFrom: scope === "all" ? undefined : (customFrom || defaultDateFrom),
          dateTo: scope === "all" ? undefined : (customTo || defaultDateTo),
          search: defaultSearch || undefined,
          columns: selectedCols,
        },
      });

      if (!res.count) {
        toast.error("No transactions found matching your chosen export filters.");
        return;
      }

      const content = format === "excel" ? res.excelXml : res.csv;
      const mime = format === "excel" ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8";
      const ext = format === "excel" ? "xls" : "csv";

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue_export_${scope}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${res.count} transaction(s) successfully!`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Download className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Export Financial Transactions</h2>
              <p className="text-xs text-slate-500">Configure file format, data filters, and fields to export</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
          {/* 1. File Format */}
          <div className="space-y-2">
            <label className="font-bold text-slate-900 block text-xs">1. Export Format</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("csv")}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${format === "csv" ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20" : "bg-white border-slate-200 hover:bg-slate-50"}`}
              >
                <FileText className={`size-5 mt-0.5 ${format === "csv" ? "text-emerald-700" : "text-slate-400"}`} />
                <div>
                  <div className="font-bold text-slate-900">CSV File (.csv)</div>
                  <div className="text-[11px] text-slate-500">Standard UTF-8 BOM, universal compatibility</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat("excel")}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${format === "excel" ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20" : "bg-white border-slate-200 hover:bg-slate-50"}`}
              >
                <FileSpreadsheet className={`size-5 mt-0.5 ${format === "excel" ? "text-indigo-700" : "text-slate-400"}`} />
                <div>
                  <div className="font-bold text-slate-900">Excel Spreadsheet (.xls)</div>
                  <div className="text-[11px] text-slate-500">XML format with styled navy headers & totals</div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Data Scope */}
          <div className="space-y-2">
            <label className="font-bold text-slate-900 block text-xs">2. Export Scope</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScope("filtered")}
                className={`p-2.5 rounded-lg border text-center transition-all ${scope === "filtered" ? "bg-indigo-600 text-white font-bold border-indigo-600 shadow-xs" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                Current Active Filters
              </button>

              <button
                type="button"
                onClick={() => setScope("range")}
                className={`p-2.5 rounded-lg border text-center transition-all ${scope === "range" ? "bg-indigo-600 text-white font-bold border-indigo-600 shadow-xs" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                Selected Date Range
              </button>

              <button
                type="button"
                onClick={() => setScope("all")}
                className={`p-2.5 rounded-lg border text-center transition-all ${scope === "all" ? "bg-indigo-600 text-white font-bold border-indigo-600 shadow-xs" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                All Time History
              </button>
            </div>
          </div>

          {/* 3. Filters Customization */}
          {scope !== "all" && (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="font-bold text-slate-900 text-xs">Filter Transactions To Include</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Status</label>
                  <select
                    value={tab}
                    onChange={(e) => setTab(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5"
                  >
                    <option value="all">All Statuses</option>
                    <option value="successful">Successful (Paid) Only</option>
                    <option value="failed">Failed Attempts Only</option>
                    <option value="pending">Pending Only</option>
                    <option value="refunded">Refunded Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Gateway</label>
                  <select
                    value={gateway}
                    onChange={(e) => setGateway(e.target.value)}
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
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5"
                  >
                    <option value="">All Methods</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="netbanking">Net Banking</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 4. Select Columns / Data Fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 block text-xs">3. Select Columns to Include ({selectedCols.length}/{AVAILABLE_COLUMNS.length})</label>
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={selectAllCols} className="text-indigo-600 hover:underline">Select All</button>
                <span>·</span>
                <button type="button" onClick={deselectAllCols} className="text-slate-500 hover:underline">Reset Default</button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl border border-slate-200 bg-white max-h-40 overflow-y-auto">
              {AVAILABLE_COLUMNS.map((col) => {
                const isSelected = selectedCols.includes(col.key);
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggleColumn(col.key)}
                    className={`flex items-center gap-2 p-1.5 rounded text-left transition-colors ${isSelected ? "text-slate-900 font-medium" : "text-slate-400"}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="size-4 text-indigo-600 shrink-0" />
                    ) : (
                      <Square className="size-4 text-slate-300 shrink-0" />
                    )}
                    <span className="truncate">{col.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 font-semibold transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting}
            className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="size-4" />
            {isExporting ? "Generating Export…" : "Export & Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
