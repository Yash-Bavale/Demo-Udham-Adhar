import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useState } from "react";
import { Inbox, FileCheck2, Sparkles, Bell, ArrowRight, PackageOpen } from "lucide-react";
import { getMyWorkSummary, type MyWorkSummary } from "@/lib/crm/my-work.functions";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/my-work")({
  head: () => ({ meta: [{ title: "My Work — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: MyWorkPage,
});

function MyWorkPage() {
  const fetchSummary = useServerFn(getMyWorkSummary);
  const [hasSession, setHasSession] = useState(false);
  const role = useRole();
  const { can } = usePermissions();
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setHasSession(!!data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setHasSession(!!session));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  const { data, isLoading, refetch } = useQuery<MyWorkSummary>({
    queryKey: ["my-work"],
    queryFn: () => fetchSummary(),
    enabled: hasSession,
  });

  useRealtimeTable("notifications", () => refetch());
  useRealtimeTable("applications", () => refetch());
  useRealtimeTable("documents", () => refetch());
  useRealtimeTable("leads", () => refetch());

  const counters = data?.counters;
  const isAdmin = role.hasAny(["super_admin", "admin"]);
  const canOrders = isAdmin || can("orders");
  const canLeads = isAdmin || can("leads");

  const cards = useMemo(
    () => {
      const base: Array<{ label: string; value: number; icon: any; accent: string; to: string; search?: Record<string, string>; show: boolean }> = [
        { label: "Total Leads", value: counters?.totalLeads ?? 0, icon: Inbox, accent: "var(--admin-accent)", to: "/admin/leads", search: isAdmin ? undefined : { assignee: "me" }, show: canLeads },
        { label: "Orders", value: counters?.orderReceived ?? 0, icon: PackageOpen, accent: "#F97316", to: "/admin/orders", search: isAdmin ? { fulfillment: "order_received" } : { assignee: "me", fulfillment: "order_received" }, show: canOrders },
        { label: "Active Leads", value: counters?.assignedLeads ?? 0, icon: Sparkles, accent: "var(--admin-success)", to: "/admin/leads", search: isAdmin ? { status: "new_lead" } : { assignee: "me", status: "new_lead" }, show: canLeads },
        { label: "Unread notifications", value: counters?.unreadNotifications ?? 0, icon: Bell, accent: "var(--admin-accent)", to: "/admin/notifications", show: true },
      ];
      if (isAdmin) {
        base.splice(3, 0, { label: "Documents to review", value: counters?.pendingDocs ?? 0, icon: FileCheck2, accent: "var(--admin-warn)", to: "/admin/review", show: true });
      }
      return base.filter((c) => c.show);
    },
    [counters, isAdmin, canOrders, canLeads],
  );

  const hasAssignedOrders = (data?.assignedApplications?.length ?? 0) > 0;

  const OrdersSection = canOrders ? (
    <Section
      key="orders"
      title="Paid orders — process now"
      subtitle="Payment received. Start the fulfillment workflow."
      empty="No assigned orders — you're clear."
      href="/admin/orders"
    >
      {[...(data?.assignedApplications ?? [])]
        .sort((a, b) => {
          const actNow = ["order_received", "S01", "S02", "awaiting_customer_form"];
          const aFresh = actNow.includes(a.fulfillment_status ?? "order_received") ? 0 : 1;
          const bFresh = actNow.includes(b.fulfillment_status ?? "order_received") ? 0 : 1;
          if (aFresh !== bFresh) return aFresh - bFresh;
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        })
        .slice(0, 12)
        .map((a) => {
          const actNow = ["order_received", "S01", "S02", "awaiting_customer_form"];
          const fresh = actNow.includes(a.fulfillment_status ?? "order_received");
          return (
            <Link
              key={a.id}
              to="/admin/applications/$applicationId"
              params={{ applicationId: a.id }}
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm border"
              style={
                fresh
                  ? { background: "rgba(249, 115, 22, 0.10)", borderColor: "rgba(249, 115, 22, 0.45)" }
                  : { borderColor: "transparent" }
              }
            >
              {fresh && (
                <span
                  className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                  style={{ background: "#F97316", color: "white" }}
                >
                  Start now
                </span>
              )}
              <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}>
                {a.application_code ?? a.id.slice(0, 8)}
              </code>
              <span className="font-medium truncate flex-1" style={{ color: fresh ? "#F97316" : "var(--admin-fg)" }}>
                {a.lead?.name ?? "Unknown"}
              </span>
              <StatusPill status={a.fulfillment_status ?? a.application_status} fresh={fresh} />
              <span className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                {formatRelative(a.updated_at)}
              </span>
              <ArrowRight className="size-3.5" style={{ color: "var(--admin-fg-subtle)" }} />
            </Link>
          );
        })}
    </Section>
  ) : null;

  const LeadsSection = canLeads ? (
    <Section
      key="leads"
      title="Active leads — contact now"
      subtitle="Not-contacted leads, oldest first. Red = >3h, amber = >1h"
      empty="No uncontacted leads assigned."
      href="/admin/leads"
    >
      {(data?.assignedLeads ?? []).slice(0, 12).map((l) => {
        const ageMs = Date.now() - new Date(l.created_at).getTime();
        const overdue3h = ageMs > 3 * 3600 * 1000;
        const overdue1h = !overdue3h && ageMs > 1 * 3600 * 1000;
        const tone = overdue3h
          ? { fg: "#EF4444", label: "3h+" }
          : overdue1h
          ? { fg: "#F59E0B", label: "1h+" }
          : null;
        return (
          <Link
            key={l.id}
            to="/admin/leads/$leadId"
            params={{ leadId: l.id }}
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[var(--admin-surface-2)] transition-colors text-sm border border-transparent"
          >
            {tone && (
              <span
                className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded text-white"
                style={{ background: tone.fg }}
              >
                {tone.label}
              </span>
            )}
            <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}>
              {l.lead_code ?? l.id.slice(0, 8)}
            </code>
            <span className="font-medium truncate flex-1" style={{ color: "var(--admin-fg)" }}>{l.name}</span>
            <span className="text-xs truncate max-w-[200px]" style={{ color: "var(--admin-fg-muted)" }}>{l.service}</span>
            <StatusPill status={l.status} />
            <span className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>{formatRelative(l.created_at)}</span>
          </Link>
        );
      })}
    </Section>
  ) : null;

  // If orders exist → Orders on top, Leads below. If no orders → Leads on top, empty Orders below.
  const orderedSections = hasAssignedOrders
    ? [OrdersSection, LeadsSection]
    : [LeadsSection, OrdersSection];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--admin-fg)" }}>My Work</h1>
          <p className="text-sm mt-1" style={{ color: "var(--admin-fg-muted)" }}>
            Your personal queue — assignments, leads, and live alerts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            search={c.search as never}
            className="rounded-xl border p-4 transition-colors hover:border-[var(--admin-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]"
            style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--admin-fg-muted)" }}>
                {c.label}
              </span>
              <c.icon className="size-4" style={{ color: c.accent }} />
            </div>
            <div className="text-2xl font-semibold mt-1" style={{ color: "var(--admin-fg)" }}>
              {isLoading ? "—" : c.value}
            </div>
          </Link>
        ))}
      </div>

      {orderedSections}

      {isAdmin && (
        <Section
          title="Documents pending review"
          subtitle="Oldest uploads first"
          empty="No pending documents."
          href="/admin/review"
        >
          {(data?.pendingDocuments ?? []).slice(0, 8).map((d) => (
            <Link
              key={d.id}
              to="/admin/review"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[var(--admin-surface-2)] transition-colors text-sm"
            >
              <FileCheck2 className="size-4" style={{ color: "var(--admin-warn)" }} />
              <span className="font-medium truncate flex-1" style={{ color: "var(--admin-fg)" }}>
                {d.doc_type}
              </span>
              <span className="text-xs truncate max-w-[260px]" style={{ color: "var(--admin-fg-muted)" }}>
                {d.file_name}
              </span>
              <span className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                {formatRelative(d.uploaded_at)}
              </span>
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title, subtitle, children, empty, href,
}: { title: string; subtitle?: string; children: React.ReactNode; empty: string; href: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasContent = arr.filter(Boolean).length > 0;
  return (
    <section
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--admin-border)" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--admin-fg)" }}>{title}</h2>
          {subtitle && <p className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>{subtitle}</p>}
        </div>
        <Link to={href} className="text-xs flex items-center gap-1 hover:underline" style={{ color: "var(--admin-accent)" }}>
          View all <ArrowRight className="size-3" />
        </Link>
      </header>
      <div className="p-2">
        {hasContent ? (
          <div className="space-y-0.5">{children}</div>
        ) : (
          <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--admin-fg-muted)" }}>{empty}</div>
        )}
      </div>
    </section>
  );
}

function StatusPill({ status, fresh }: { status: string; fresh?: boolean }) {
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
      style={
        fresh
          ? { borderColor: "rgba(249,115,22,0.5)", color: "#F97316", background: "rgba(249,115,22,0.10)" }
          : { borderColor: "var(--admin-border)", color: "var(--admin-fg-muted)", background: "var(--admin-surface-2)" }
      }
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}


function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
