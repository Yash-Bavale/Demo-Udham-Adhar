import { isVisibleService } from "@/lib/crm/visible-services";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import {
  listPaymentsAdmin,
  generateInvoice,
  getInvoiceSignedUrl,
  getPaymentsFilterMeta,
} from "@/lib/crm/invoices.functions";

export const Route = createFileRoute("/admin/payments")({
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
  head: () => ({ meta: [{ title: "Payments — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PaymentsPage,
});

import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

function PaymentsPage() {
  const { formatINR } = useFinancialVisibility();
  const listFn = useServerFn(listPaymentsAdmin);
  const metaFn = useServerFn(getPaymentsFilterMeta);
  const genFn = useServerFn(generateInvoice);
  const urlFn = useServerFn(getInvoiceSignedUrl);
  const qc = useQueryClient();

  const [filters, setFilters] = useState({
    q: "", status: "", gateway: "", serviceId: "", from: "", to: "", page: 1,
  });

  const meta = useQuery({ queryKey: ["payments.meta"], queryFn: () => metaFn() });
  const { data, isLoading } = useQuery({
    queryKey: ["admin.payments", filters],
    queryFn: () =>
      listFn({
        data: {
          q: filters.q || undefined,
          status: filters.status || undefined,
          gateway: filters.gateway || undefined,
          serviceId: filters.serviceId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page,
          pageSize: 25,
        } as any,
      }),
  });

  const gen = useMutation({
    mutationFn: (paymentId: string) => genFn({ data: { paymentId } }),
    onSuccess: () => {
      toast.success("Invoice generated");
      qc.invalidateQueries({ queryKey: ["admin.payments"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not generate invoice"),
  });

  const openInvoice = async (invoiceId: string) => {
    try {
      const r = await urlFn({ data: { invoiceId } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? "Could not open invoice");
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      paid: "bg-emerald-100 text-emerald-700",
      failed: "bg-rose-100 text-rose-700",
      refunded: "bg-amber-100 text-amber-700",
      attempted: "bg-sky-100 text-sky-700",
      created: "bg-slate-100 text-slate-600",
    };
    return <Badge variant="secondary" className={`text-[10px] ${map[s] ?? ""}`}>{s.replace(/_/g, " ")}</Badge>;
  };

  const groupedServices = useMemo(() => {
    const raw = (meta.data?.services ?? []) as any[];
    const activeOnly = raw.filter((s) => isVisibleService(s));
    const map = new Map<string, { websiteName: string; domain: string; services: any[] }>();

    for (const s of activeOnly) {
      const webId = s.website_id || s.website?.id || "main";
      const webName = s.website?.name || s.website?.domain || "Main Website";
      const domain = s.website?.domain || "";

      if (!map.has(webId)) {
        map.set(webId, { websiteName: webName, domain, services: [] });
      }
      map.get(webId)!.services.push(s);
    }

    return Array.from(map.entries()).map(([id, group]) => ({
      id,
      ...group,
    }));
  }, [meta.data?.services]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Payments Audit & Ledger</h1>
          <p className="text-xs text-slate-500">Every Razorpay, PayU, CCAvenue, Cashfree webhook + system receipt</p>
        </div>
        <div className="text-xs text-slate-500">{data ? `${data.total} payments` : ""}</div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-white p-3" style={{ borderColor: "var(--admin-border)" }}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Input
            placeholder="Search name, email, mobile, ref…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
            className="md:col-span-2"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            className="rounded border px-2 py-1.5 text-sm">
            <option value="">All status</option>
            {meta.data?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filters.gateway}
            onChange={(e) => setFilters({ ...filters, gateway: e.target.value, page: 1 })}
            className="rounded border px-2 py-1.5 text-sm">
            <option value="">All gateways</option>
            {meta.data?.gateways.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select
            value={filters.serviceId}
            onChange={(e) => setFilters({ ...filters, serviceId: e.target.value, page: 1 })}
            className="rounded border px-2 py-1.5 text-sm max-w-[220px]">
            <option value="">All active services</option>
            {groupedServices.map((g) => (
              <optgroup key={g.id} label="Udyam Aadhar Services">
                {g.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.service_name}
                  </option>
                ))}
              </optgroup>
            ))}
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

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-x-auto" style={{ borderColor: "var(--admin-border)" }}>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
            <tr className="text-left">
              <th className="px-3 py-2">Payment Ref</th>
              <th className="px-3 py-2">Order No</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">GST</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Gateway</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-500">No payments match these filters.</td></tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-slate-50/50">
                <td className="px-3 py-2 font-mono text-[10px]">{r.transaction_id ?? r.id.slice(0, 8)}</td>
                <td className="px-3 py-2">
                  {r.application_id ? (
                    <Link to="/admin/orders/$orderId" params={{ orderId: r.application_id }}
                      className="text-sky-700 hover:underline font-mono">{r.application_code ?? "view"}</Link>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.customer_name || "—"}</div>
                  <div className="text-[10px] text-slate-500">{r.lead_code}</div>
                </td>
                <td className="px-3 py-2">{r.service}</td>
                <td className="px-3 py-2 text-right">{formatINR(r.base_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right">{formatINR(r.gst_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatINR(r.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 capitalize">{r.gateway_name}</td>
                <td className="px-3 py-2">{statusBadge(r.status)}</td>
                <td className="px-3 py-2 text-slate-600">{fmtDate(r.payment_date ?? r.created_at)}</td>
                <td className="px-3 py-2">
                  {r.invoice_id && r.has_pdf ? (
                    <button onClick={() => openInvoice(r.invoice_id!)}
                      className="text-sky-700 hover:underline text-[11px]">{r.invoice_number ?? "View PDF"}</button>
                  ) : r.status === "paid" ? (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]"
                      disabled={gen.isPending}
                      onClick={() => gen.mutate(r.id)}>
                      {gen.isPending && gen.variables === r.id ? "Generating…" : "Generate"}
                    </Button>
                  ) : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
