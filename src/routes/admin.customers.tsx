import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Users, TrendingUp, Repeat, Wallet } from "lucide-react";
import { listCustomers, getRepeatPurchaseMetrics } from "@/lib/crm/customers.functions";
import { StatCard, SectionCard, TableSkeleton } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({ meta: [{ title: "Customers — CRM" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/admin-login" });
    const { data: rows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const roles = (rows ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      throw redirect({ to: "/admin/my-work" });
    }
  },
  component: CustomersPage,
});

import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";

function CustomersPage() {
  const { formatINR } = useFinancialVisibility();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const list = useServerFn(listCustomers);
  const metrics = useServerFn(getRepeatPurchaseMetrics);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.customers", q, status],
    queryFn: () => list({ data: { q, status, limit: 200 } }),
    placeholderData: (p) => p,
  });
  const { data: m } = useQuery({ queryKey: ["admin.customers.metrics"], queryFn: () => metrics() });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Unified Customer 360 — every person who ever bought a service, deduplicated across leads.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard index={0} label="Total Customers" value={m?.totalCustomers ?? 0} icon={<Users className="size-4" />} gradient="primary" loading={!m} />
        <StatCard index={1} label="Repeat Customers" value={m?.repeatCustomers ?? 0} icon={<Repeat className="size-4" />} gradient="success" loading={!m} hint={m ? `${Math.round((m.repeatRate ?? 0) * 100)}% repeat rate` : undefined} />
        <StatCard index={2} label="Lifetime Value" value={formatINR(m?.lifetimeValue ?? 0)} icon={<Wallet className="size-4" />} gradient="primary" loading={!m} />
        <StatCard index={3} label="Avg LTV" value={formatINR(m?.avgLtv ?? 0)} icon={<TrendingUp className="size-4" />} gradient="warn" loading={!m} />
      </div>

      <SectionCard title="All customers" action={<div className="text-xs" style={{ color: "var(--admin-fg-muted)" }}>{rows.length} shown</div>}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--admin-fg-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, mobile, customer code…"
              className="w-full rounded-lg border pl-8 pr-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--admin-border)" }}
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: "var(--admin-border)" }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <div className="text-sm py-10 text-center" style={{ color: "var(--admin-fg-muted)" }}>No customers match.</div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">Apps</th>
                  <th className="py-2 pr-3">LTV</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-[var(--admin-surface-2)] transition-colors" style={{ borderColor: "var(--admin-border)" }}>
                    <td className="py-2.5 pr-3">
                      <Link to="/admin/customers/$customerId" params={{ customerId: r.id }} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>{r.customer_code ?? "—"}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="text-xs">{r.primary_mobile ?? "—"}</div>
                      <div className="text-[11px] truncate max-w-[220px]" style={{ color: "var(--admin-fg-muted)" }}>{r.primary_email ?? "—"}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold">{r.total_applications}</span>{" "}
                      <span className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                        ({r.completed_applications} done · {r.pending_applications} open)
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-medium">{formatINR(Number(r.lifetime_value ?? 0))}</td>
                    <td className="py-2.5 pr-3 text-xs">{r.state ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-xs" style={{ color: "var(--admin-fg-muted)" }}>{new Date(r.last_seen_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
