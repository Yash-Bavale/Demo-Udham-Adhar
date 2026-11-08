import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import {
  listInvoicesAdmin,
  getInvoiceSignedUrl,
  regenerateInvoice,
  updateInvoiceGstin,
  getPaymentsFilterMeta,
} from "@/lib/crm/invoices.functions";

export const Route = createFileRoute("/admin/invoices")({
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
  head: () => ({ meta: [{ title: "Invoices — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: InvoicesPage,
});

import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

function InvoicesPage() {
  const { formatINR } = useFinancialVisibility();
  const listFn = useServerFn(listInvoicesAdmin);
  const metaFn = useServerFn(getPaymentsFilterMeta);
  const urlFn = useServerFn(getInvoiceSignedUrl);
  const regenFn = useServerFn(regenerateInvoice);
  const gstinFn = useServerFn(updateInvoiceGstin);

  const [filters, setFilters] = useState({
    q: "", gstType: "", serviceId: "", from: "", to: "", page: 1,
  });

  const meta = useQuery({ queryKey: ["payments.meta"], queryFn: () => metaFn() });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin.invoices", filters],
    queryFn: () =>
      listFn({
        data: {
          q: filters.q || undefined,
          gstType: (filters.gstType || undefined) as any,
          serviceId: filters.serviceId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page,
          pageSize: 25,
        } as any,
      }),
  });

  const regen = useMutation({
    mutationFn: (invoiceId: string) => regenFn({ data: { invoiceId } }),
    onSuccess: () => { toast.success("Invoice PDF regenerated"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Could not regenerate"),
  });

  const gstinMut = useMutation({
    mutationFn: (v: { invoiceId: string; gstin: string }) =>
      gstinFn({ data: { ...v, sendEmail: false } }),
    onSuccess: (r) => { toast.success(`GSTIN ${r.gstin} saved — invoice regenerated (no email sent)`); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Could not update GSTIN"),
  });

  const openPdf = async (invoiceId: string) => {
    try {
      const r = await urlFn({ data: { invoiceId } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e: any) { toast.error(e.message ?? "Could not open PDF"); }
  };

  const gstBadge = (t: string) => {
    if (t === "igst") return <Badge variant="secondary" className="bg-violet-100 text-violet-700 text-[10px]">IGST 18%</Badge>;
    if (t === "cgst_sgst") return <Badge variant="secondary" className="bg-sky-100 text-sky-700 text-[10px]">CGST+SGST 18%</Badge>;
    return <Badge variant="secondary" className="text-[10px]">—</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <div className="text-xs text-slate-500">{data ? `${data.total} invoices` : ""}</div>
      </div>

      <div className="rounded-lg border bg-white p-3" style={{ borderColor: "var(--admin-border)" }}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Input
            placeholder="Search invoice no, customer, code…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
            className="md:col-span-2"
          />
          <select
            value={filters.gstType}
            onChange={(e) => setFilters({ ...filters, gstType: e.target.value, page: 1 })}
            className="rounded border px-2 py-1.5 text-sm">
            <option value="">All GST types</option>
            <option value="cgst_sgst">CGST + SGST</option>
            <option value="igst">IGST</option>
          </select>
          <select
            value={filters.serviceId}
            onChange={(e) => setFilters({ ...filters, serviceId: e.target.value, page: 1 })}
            className="rounded border px-2 py-1.5 text-sm">
            <option value="">All services</option>
            {meta.data?.services.map((s) => <option key={s.id} value={s.id}>{s.service_name}</option>)}
          </select>
          <DateRangePicker
            value={{
              from: filters.from ? new Date(filters.from) : undefined,
              to: filters.to ? new Date(filters.to) : undefined,
            }}
            onChange={(range) =>
              setFilters({
                ...filters,
                from: range.from ? range.from.toISOString().slice(0, 10) : "",
                to: range.to ? range.to.toISOString().slice(0, 10) : "",
                page: 1,
              })
            }
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto" style={{ borderColor: "var(--admin-border)" }}>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
            <tr className="text-left">
              <th className="px-3 py-2">Invoice No</th>
              <th className="px-3 py-2">Order No</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Base</th>
              <th className="px-3 py-2 text-right">GST</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">GST Type</th>
              <th className="px-3 py-2">PDF</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-500">No invoices found.</td></tr>
            )}
            {data?.rows.map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-slate-50/50">
                <td className="px-3 py-2 font-mono">{r.invoice_number}</td>
                <td className="px-3 py-2">
                  {r.application_id ? (
                    <Link to="/admin/orders/$orderId" params={{ orderId: r.application_id }}
                      className="text-sky-700 hover:underline font-mono">{r.application_code ?? "view"}</Link>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.customer_name || "—"}</div>
                  <div className="text-[10px] text-slate-500">{r.lead_code}</div>
                  {r.customer_gstin_snapshot && (
                    <div className="text-[10px] font-mono font-semibold text-emerald-700">GSTIN: {r.customer_gstin_snapshot}</div>
                  )}
                </td>
                <td className="px-3 py-2">{r.service}</td>
                <td className="px-3 py-2 text-slate-600">{fmtDate(r.issued_at)}</td>
                <td className="px-3 py-2 text-right">{formatINR(r.base_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right">{formatINR(r.gst_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatINR(r.total_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2">{gstBadge(r.gst_type)}</td>
                <td className="px-3 py-2">
                  {r.pdf_path ? (
                    <button onClick={() => openPdf(r.id)} className="text-sky-700 hover:underline text-[11px]">Download</button>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 text-[10px]"
                      disabled={regen.isPending}
                      onClick={() => regen.mutate(r.id)}>
                      Regenerate
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-[10px]"
                      disabled={gstinMut.isPending}
                      title={r.customer_gstin_snapshot ? `GSTIN: ${r.customer_gstin_snapshot}` : "Add customer GSTIN"}
                      onClick={() => {
                        const v = window.prompt("Customer GSTIN (15 characters). The invoice will be regenerated. No email will be sent.", r.customer_gstin_snapshot ?? "");
                        if (v && v.trim()) gstinMut.mutate({ invoiceId: r.id, gstin: v.trim() });
                      }}>
                      {r.customer_gstin_snapshot ? "Edit GSTIN" : "Add GSTIN"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 25 && (
        <div className="flex items-center justify-between text-xs">
          <div className="text-slate-500">Page {filters.page} of {Math.max(1, Math.ceil(data.total / 25))}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={filters.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</Button>
            <Button size="sm" variant="outline" disabled={filters.page * 25 >= data.total}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
