import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getGstReport,
  exportGstReportCsv,
  exportGstr1Csv,
  exportGstr1RefundsCsv,
  exportGstRefundReportCsv,
} from "@/lib/finance/gst-report.functions";

export const Route = createFileRoute("/admin/finance/gst")({
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/admin-login" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin", "finance", "accounts"]);
    if (!data || data.length === 0) throw redirect({ to: "/admin/my-work" });
  },
  component: GstReportPage,
});

function GstReportPage() {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [activeTab, setActiveTab] = useState<"invoices" | "refunds">("invoices");

  const getFn = useServerFn(getGstReport);
  const exportFn = useServerFn(exportGstReportCsv);
  const gstr1Fn = useServerFn(exportGstr1Csv);
  const gstr1RefundsFn = useServerFn(exportGstr1RefundsCsv);
  const exportRefundCsvFn = useServerFn(exportGstRefundReportCsv);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.gst", month],
    queryFn: () => getFn({ data: { month } }),
  });

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      const d = new Date(new Date(iso).getTime() + 330 * 60000);
      return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">GST Report</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            GSTR tax report and refund reports for GST filing & accounting reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-2xs font-medium text-slate-700"
          />

          {/* Standard Reports */}
          <button
            onClick={async () => {
              try {
                const res = await exportFn({ data: { month } });
                downloadCsv(res.csv, res.filename);
              } catch (e: any) {
                toast.error(e?.message || "Export failed");
              }
            }}
            className="rounded-lg bg-slate-900 text-white hover:bg-slate-800 px-3 py-1.5 text-sm font-medium shadow-2xs transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={async () => {
              try {
                const res = await gstr1Fn({ data: { month } });
                downloadCsv(res.csv, res.filename);
                toast.success(`GSTR-1 exported (${res.count} invoices)`);
              } catch (e: any) {
                toast.error(e?.message || "GSTR-1 export failed");
              }
            }}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-3 py-1.5 text-sm font-medium shadow-2xs transition-colors"
          >
            Export GSTR-1
          </button>

          {/* Refund Reports */}
          <button
            onClick={async () => {
              try {
                const res = await gstr1RefundsFn({ data: { month } });
                downloadCsv(res.csv, res.filename);
                toast.success(`GSTR-1 Refunds exported (${res.count} orders)`);
              } catch (e: any) {
                toast.error(e?.message || "GSTR-1 Refunds export failed");
              }
            }}
            className="rounded-lg border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-400 px-3 py-1.5 text-sm font-semibold shadow-2xs transition-colors"
            title="Download refunded orders in standard GSTR-1 format"
          >
            Export GSTR-1 (Refunds)
          </button>
          <button
            onClick={async () => {
              try {
                const res = await exportRefundCsvFn({ data: { month } });
                downloadCsv(res.csv, res.filename);
                toast.success(`Refund CSV exported (${res.count} orders)`);
              } catch (e: any) {
                toast.error(e?.message || "Refund CSV export failed");
              }
            }}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-sm font-medium shadow-2xs transition-colors"
            title="Download detailed refund report with invoice and refund dates"
          >
            Export Refund CSV
          </button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="p-8 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
          Loading GST report…
        </div>
      ) : (
        <>
          {/* View Tab Switcher */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "invoices"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Invoices ({data.summary.count})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("refunds")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "refunds"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
              }`}
            >
              Refund Report ({data.refundSummary?.count ?? 0})
            </button>
          </div>

          {activeTab === "invoices" ? (
            <>
              {/* Primary KPI Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KPI label="Taxable" value={fmt(data.summary.taxable)} />
                <KPI label="CGST" value={fmt(data.summary.cgst)} />
                <KPI label="SGST" value={fmt(data.summary.sgst)} />
                <KPI label="IGST" value={fmt(data.summary.igst)} />
                <KPI label={`Total (${data.summary.count})`} value={fmt(data.summary.total)} highlight />
              </div>

              <Card title="By place of supply">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="text-left py-1.5">State</th>
                        <th className="text-right">#</th>
                        <th className="text-right">Taxable</th>
                        <th className="text-right">CGST</th>
                        <th className="text-right">SGST</th>
                        <th className="text-right">IGST</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.byState.map((s) => (
                        <tr key={s.state} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 font-medium text-slate-800">{s.state}</td>
                          <td className="text-right text-slate-600">{s.count}</td>
                          <td className="text-right text-slate-600">{fmt(s.taxable)}</td>
                          <td className="text-right text-slate-600">{fmt(s.cgst)}</td>
                          <td className="text-right text-slate-600">{fmt(s.sgst)}</td>
                          <td className="text-right text-slate-600">{fmt(s.igst)}</td>
                          <td className="text-right font-bold text-slate-900">{fmt(s.total)}</td>
                        </tr>
                      ))}
                      {data.byState.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-500">
                            No invoices in this month.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <>
              {/* Refund KPI Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KPI label="Refunded Taxable" value={fmt(data.refundSummary?.taxable ?? 0)} tone="rose" />
                <KPI label="CGST Reversed" value={fmt(data.refundSummary?.cgst ?? 0)} tone="rose" />
                <KPI label="SGST Reversed" value={fmt(data.refundSummary?.sgst ?? 0)} tone="rose" />
                <KPI label="IGST Reversed" value={fmt(data.refundSummary?.igst ?? 0)} tone="rose" />
                <KPI
                  label={`Total Refunded (${data.refundSummary?.count ?? 0})`}
                  value={fmt(data.refundSummary?.total ?? 0)}
                  highlight
                  tone="rose"
                />
              </div>

              <Card title={`Refunded Orders (${data.refundSummary?.count ?? 0}) — Matching GSTR Format`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold text-slate-600 uppercase tracking-wider text-left">
                        <th className="px-3 py-2">Invoice #</th>
                        <th className="px-3 py-2">Invoice Date</th>
                        <th className="px-3 py-2 text-rose-700">Refund Date</th>
                        <th className="px-3 py-2">Lead / Order</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Place Of Supply</th>
                        <th className="px-3 py-2 text-right">Taxable Value</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right font-bold text-rose-700">Refund Amount</th>
                        <th className="px-3 py-2">Gateway / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data.refundRows ?? []).map((r: any) => (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-3 py-2 font-mono font-medium text-slate-800">{r.invoice_number}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(r.issued_at)}</td>
                          <td className="px-3 py-2 text-rose-600 font-semibold">{formatDate(r.refund_processed_at)}</td>
                          <td className="px-3 py-2 font-mono text-indigo-600">{r.lead_code || "—"}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{r.customer_name || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{r.place_of_supply || "—"}</td>
                          <td className="px-3 py-2 text-right text-slate-700 font-medium">{fmt(r.taxable)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{r.rate}%</td>
                          <td className="px-3 py-2 text-right font-bold text-rose-700">{fmt(r.total_amount)}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-[11px] truncate max-w-[140px]" title={r.refund_gateway_ref || r.transaction_id}>
                            {r.gateway ? `${r.gateway}: ` : ""}{r.refund_gateway_ref || r.transaction_id || "—"}
                          </td>
                        </tr>
                      ))}
                      {(data.refundRows ?? []).length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-500">
                            No refunded orders found for this month (by invoice date or refund processed date).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "default" | "rose";
}) {
  const isRose = tone === "rose";
  return (
    <div
      className={`rounded-xl border p-3.5 shadow-2xs transition-all ${
        isRose
          ? highlight
            ? "bg-rose-50 border-rose-300 text-rose-950"
            : "bg-white border-rose-200 text-slate-800"
          : highlight
          ? "bg-indigo-50/60 border-indigo-200 text-indigo-950"
          : "bg-white border-slate-200 text-slate-800"
      }`}
    >
      <div
        className={`text-[11px] font-bold uppercase tracking-wider truncate ${
          isRose ? "text-rose-600" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div
        className={`text-lg font-bold mt-1 tracking-tight truncate ${
          isRose && highlight ? "text-rose-700" : highlight ? "text-indigo-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 text-xs font-bold uppercase tracking-wider text-slate-700">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

