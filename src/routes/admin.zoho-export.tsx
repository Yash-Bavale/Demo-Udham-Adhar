import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildZohoInvoiceExport } from "@/lib/crm/zoho-export.functions";

export const Route = createFileRoute("/admin/zoho-export")({
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/admin-login" });
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "super_admin", "finance", "accounts"] as any);
    if (!data || data.length === 0) throw redirect({ to: "/admin/my-work" });
  },
  head: () => ({ meta: [{ title: "Zoho Books Export — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ZohoExportPage,
});

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function download(name: string, lines: string[][]) {
  const blob = new Blob(["\uFEFF" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function ZohoExportPage() {
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const fn = useServerFn(buildZohoInvoiceExport);
  const m = useMutation({
    mutationFn: () => fn({ data: { from, to } }),
    onError: (e: any) => toast.error(e?.message ?? "Validation failed"),
  });
  const r = m.data;

  const cards = r ? [
    ["Total Invoices", String(r.summary.totalInvoices)],
    ["Valid", String(r.summary.valid)],
    ["Errors", String(r.summary.errors)],
    ["Taxable Value", inr(r.summary.taxable)],
    ["CGST", inr(r.summary.cgst)],
    ["SGST", inr(r.summary.sgst)],
    ["IGST", inr(r.summary.igst)],
    ["Total", inr(r.summary.total)],
  ] : [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Zoho Books Invoice Export</h1>
        <p className="text-sm text-muted-foreground">GST / Accounting → Zoho. Reads CRM invoices only; nothing is changed.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <label className="text-sm">From<Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); m.reset(); }} /></label>
        <label className="text-sm">To<Input type="date" value={to} onChange={(e) => { setTo(e.target.value); m.reset(); }} /></label>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Validating…" : "Fetch & Validate"}</Button>
        <Button
          variant="secondary"
          disabled={!r || r.rows.length === 0}
          onClick={() => r && download(`zoho-invoices_${from}_${to}.csv`, [r.columns, ...r.rows.map((row) => r.columns.map((c) => (row as any)[c] ?? ""))])}
        >
          Download Zoho Import File{r ? ` (${r.rows.length})` : ""}
        </Button>
        <Button
          variant="secondary"
          disabled={!r || !r.paymentRows?.length}
          onClick={() => r && download(`zoho-payments_${from}_${to}.csv`, [r.paymentColumns, ...r.paymentRows.map((row) => r.paymentColumns.map((c) => (row as any)[c] ?? ""))])}
        >
          Download Zoho Payments File{r ? ` (${r.paymentRows?.length ?? 0})` : ""}
        </Button>
        {r && r.issues.length > 0 && (
          <Button variant="outline" onClick={() => download(`zoho-errors_${from}_${to}.csv`, [["Invoice Number", "Field", "Error"], ...r.issues.map((i) => [i.invoice_number, i.field, i.error])])}>
            Download Error Report
          </Button>
        )}
      </div>

      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map(([k, v]) => (
              <div key={k} className="rounded-2xl border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className={`mt-1 text-lg font-semibold ${k === "Errors" && r.summary.errors ? "text-destructive" : ""}`}>{v}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Export file contains only valid invoices — reconciles to Taxable {inr(r.validTotals.taxable)}, CGST {inr(r.validTotals.cgst)}, SGST {inr(r.validTotals.sgst)}, IGST {inr(r.validTotals.igst)}, Total {inr(r.validTotals.total)}.
          </p>
          <div className="rounded-2xl border bg-card">
            <div className="border-b p-4 font-medium">Error Report ({r.issues.length})</div>
            {r.issues.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">All invoices passed validation.</p>
            ) : (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Invoice Number</th><th className="p-2">Field</th><th className="p-2">Error</th></tr></thead>
                  <tbody>
                    {r.issues.map((i, idx) => (
                      <tr key={idx} className="border-t"><td className="p-2 font-mono">{i.invoice_number}</td><td className="p-2">{i.field}</td><td className="p-2 text-destructive">{i.error}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
