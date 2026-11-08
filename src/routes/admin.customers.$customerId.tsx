import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Mail, Phone, MapPin, Copy, FileText, Award, Receipt, Wallet,
  MessageSquareWarning, MessageCircle, StickyNote, Activity as ActivityIcon,
  Calendar, CheckCircle2, ExternalLink, User, ShoppingBag, IndianRupee, FolderOpen, Send,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { getCustomer360, addCustomerNote, updateCustomer, uploadCustomerKyc, getCustomerKycSignedUrl } from "@/lib/crm/customers.functions";
import { SectionCard, StatCard, StatusBadge, Timeline, TableSkeleton } from "@/components/admin/ui";
import { LeadFormSubmissionInline } from "@/components/admin/LeadFormSubmissionInline";
import { computeOrderStage, STAGE_META, STAGE_BADGE_CLASS } from "@/lib/crm/computeOrderStage";
import { useRole } from "@/hooks/useRole";
import { CallButton } from "@/components/admin/telephony/CallButton";

export const Route = createFileRoute("/admin/customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer Profile — CRM" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CustomerProfilePage,
});

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmtDT = (s?: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtD = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type TabKey = "overview" | "orders" | "complaints" | "payments" | "documents" | "activity" | "communication";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "overview", label: "Overview", icon: User },
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "payments", label: "Payments", icon: IndianRupee },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "activity", label: "Activity", icon: ActivityIcon },
  { key: "complaints", label: "Complaints", icon: MessageSquareWarning },
  { key: "communication", label: "Communication", icon: Send },
];

function CustomerProfilePage() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const fn = useServerFn(getCustomer360);
  const role = useRole();
  const hideMoney = role.hideMoney();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin.customer360", customerId],
    queryFn: () => fn({ data: { customerId } }),
  });

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !(hideMoney && t.key === "payments")),
    [hideMoney],
  );
  const [tab, setTab] = useState<TabKey>("overview");

  if (error) {
    return (
      <div className="space-y-3">
        <button onClick={() => navigate({ to: "/admin/customers" })} className="text-sm hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Back to customers
        </button>
        <div className="text-sm text-red-700">{(error as Error).message}</div>
      </div>
    );
  }

  if (isLoading || !data) return <TableSkeleton rows={8} cols={4} />;

  const c = data.customer;

  return (
    <div className="space-y-5">
      <Link to="/admin/customers" className="text-sm inline-flex items-center gap-1 hover:underline" style={{ color: "var(--admin-fg-muted)" }}>
        <ArrowLeft className="size-3.5" /> All customers
      </Link>

      {/* Identity header */}
      <SectionCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">{c.name}</h1>
              <span className="rounded-md border px-2 py-0.5 text-[11px] font-mono" style={{ borderColor: "var(--admin-border)" }}>
                {c.customer_code ?? "—"}
              </span>
              <StatusBadge status={c.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--admin-fg-muted)" }}>
              {c.primary_email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3" /> {c.primary_email}
                  <CopyBtn value={c.primary_email} />
                </span>
              )}
              {c.primary_mobile && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3" /> {c.primary_mobile}
                  <CopyBtn value={c.primary_mobile} />
                </span>
              )}
              {c.state && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3" /> {c.state}</span>}
              <span className="inline-flex items-center gap-1.5"><Calendar className="size-3" /> Since {fmtD(c.first_seen_at)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CallButton mobile={c.primary_mobile} customerId={c.id} />
            {c.primary_mobile && (
              <a href={`tel:${c.primary_mobile}`} className="rounded-lg border px-3 py-1.5 text-xs inline-flex items-center gap-1.5 hover:bg-[var(--admin-surface-2)]" style={{ borderColor: "var(--admin-border)" }}>
                <Phone className="size-3.5" /> Call
              </a>
            )}
            {c.primary_mobile && (
              <a href={`https://wa.me/${c.primary_mobile.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5 text-xs inline-flex items-center gap-1.5 hover:bg-[var(--admin-surface-2)]" style={{ borderColor: "var(--admin-border)" }}>
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            )}
            {c.primary_email && (
              <a href={`mailto:${c.primary_email}`} className="rounded-lg border px-3 py-1.5 text-xs inline-flex items-center gap-1.5 hover:bg-[var(--admin-surface-2)]" style={{ borderColor: "var(--admin-border)" }}>
                <Mail className="size-3.5" /> Email
              </a>
            )}
          </div>
        </div>
      </SectionCard>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {!hideMoney && (
          <StatCard index={0} label="Lifetime Value" value={fmtINR(Number(c.lifetime_value))} icon={<Wallet className="size-4" />} gradient="primary" />
        )}
        <StatCard index={1} label="Orders" value={c.total_applications} icon={<FileText className="size-4" />} gradient="primary" hint={`${c.completed_applications} completed · ${c.pending_applications} open`} />
        <StatCard index={2} label="Certificates" value={data.certificates.length} icon={<Award className="size-4" />} gradient="success" />
        {!hideMoney && (
          <StatCard index={3} label="Invoices" value={data.invoices.length} icon={<Receipt className="size-4" />} gradient="warn" />
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 border-b overflow-x-auto"
        style={{ borderColor: "var(--admin-border)" }}
      >
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 text-sm px-4 py-2.5 border-b-2 -mb-px whitespace-nowrap"
              style={{
                borderColor: active ? "var(--admin-primary)" : "transparent",
                color: active ? "var(--admin-fg)" : "var(--admin-fg-muted)",
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon className="size-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab data={data} customerId={customerId} hideMoney={hideMoney} />}
      {tab === "orders" && <OrdersTab data={data} hideMoney={hideMoney} />}
      {tab === "complaints" && <ComplaintsTab data={data} />}
      {tab === "payments" && !hideMoney && <PaymentsTab data={data} />}
      {tab === "documents" && <DocumentsTab data={data} />}
      {tab === "activity" && <ActivityTab data={data} />}
      {tab === "communication" && <CommunicationTab data={data} />}
    </div>
  );
}

/* ---------- Tabs ---------- */

function OverviewTab({ data, customerId, hideMoney }: { data: any; customerId: string; hideMoney: boolean }) {
  const qc = useQueryClient();
  const noteFn = useServerFn(addCustomerNote);
  const [noteDraft, setNoteDraft] = useState("");
  const noteMut = useMutation({
    mutationFn: () => noteFn({ data: { customerId, note: noteDraft } }),
    onSuccess: () => {
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["admin.customer360", customerId] });
      toast.success("Note saved");
    },
  });

  const timeline = useMemo(() => {
    const items: Array<{ id: string; time: string; type: string; description: string }> = [];
    data.applications.forEach((a: any) =>
      items.push({ id: `app-${a.id}`, time: a.created_at, type: "application", description: `Order ${a.application_code ?? a.id.slice(0, 8)} (${a.application_status})` })
    );
    if (!hideMoney) {
      data.payments.forEach((p: any) =>
        items.push({ id: `pay-${p.id}`, time: p.created_at, type: "payment", description: `Payment ${fmtINR(Number(p.amount))} · ${p.gateway_name} · ${p.status}` })
      );
    }
    data.complaints.forEach((c: any) =>
      items.push({ id: `comp-${c.id}`, time: c.created_at, type: "complaint", description: `Complaint ${c.complaint_number ?? ""} · ${c.severity}` })
    );
    return items.sort((a, b) => +new Date(b.time) - +new Date(a.time)).slice(0, 30).map((i) => ({ ...i, time: fmtDT(i.time) }));
  }, [data, hideMoney]);

  const c = data.customer;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4">
        <EditableProfileCard customer={c} customerId={customerId} />

        <SectionCard title="Stats">
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3 text-sm">
            <Field label="Total Orders" value={String(c.total_applications ?? 0)} />
            <Field label="Completed" value={String(c.completed_applications ?? 0)} />
            <Field label="Pending" value={String(c.pending_applications ?? 0)} />
            {!hideMoney && <Field label="Lifetime Value" value={fmtINR(Number(c.lifetime_value ?? 0))} />}
            <Field label="Last Order" value={fmtD(c.last_seen_at)} />
          </dl>
        </SectionCard>

        <SectionCard
          title={`Submissions (${data.leads.length})`}
          action={
            data.leads.length > 1 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                REPEAT CUSTOMER · {data.leads.length} forms
              </span>
            ) : undefined
          }
        >
          {data.leads.length === 0 ? (
            <Empty label="No leads linked" />
          ) : (
            <div className="space-y-2 p-3">
              {data.leads.map((l: any) => (
                <ExpandableLeadRow key={l.id} lead={l} hideMoney={hideMoney} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="space-y-4">
        <SectionCard title="Internal notes">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a private staff note…"
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent resize-none"
            style={{ borderColor: "var(--admin-border)" }}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>Staff-only · audited</div>
            <button
              disabled={!noteDraft.trim() || noteMut.isPending}
              onClick={() => noteMut.mutate()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "var(--admin-primary)" }}
            >
              {noteMut.isPending ? "Saving…" : "Save note"}
            </button>
          </div>
          <div className="space-y-2 pt-3">
            {data.notes.length === 0 ? (
              <Empty label="No notes yet" />
            ) : (
              data.notes.map((n: any) => (
                <div key={n.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--admin-border)" }}>
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                    <StickyNote className="size-3" /> {fmtDT(n.created_at)}
                  </div>
                  <div className="mt-1 text-sm whitespace-pre-wrap">{n.note}</div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Recent activity" action={<ActivityIcon className="size-3.5 opacity-60" />}>
          {timeline.length === 0 ? <Empty label="No activity yet" /> : <Timeline items={timeline} />}
        </SectionCard>
      </div>
    </div>
  );
}

function OrdersTab({ data, hideMoney }: { data: any; hideMoney: boolean }) {
  const leadById = new Map<string, any>();
  for (const l of data.leads ?? []) leadById.set(l.id, l);
  return (
    <SectionCard title={`Orders (${data.applications.length})`}>
      {data.applications.length === 0 ? (
        <Empty label="No orders yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>
                <th className="py-2 pr-3">Order No</th>
                <th className="py-2 pr-3">Service</th>
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3">Fulfillment</th>
                {!hideMoney && <th className="py-2 pr-3 text-right">Amount</th>}
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.applications.map((a: any) => {
                const lead = a.lead_id ? leadById.get(a.lead_id) : null;
                const stage = computeOrderStage(
                  { lead_status_v2: lead?.lead_status_v2, status: lead?.status, payment_successful_at: lead?.payment_successful_at },
                  { form_submitted_at: a.form_submitted_at, certificate_uploaded_at: a.certificate_uploaded_at, fulfillment_status: a.fulfillment_status, application_status: a.application_status, workflow_status: a.workflow_status },
                );
                return (
                  <tr key={a.id} className="border-t hover:bg-[var(--admin-surface-2)]" style={{ borderColor: "var(--admin-border)" }}>
                    <td className="py-2 pr-3">
                      <Link to="/admin/orders/$orderId" params={{ orderId: a.id }} className="font-mono text-xs hover:underline">
                        {a.application_code ?? a.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-xs">{lead?.service ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STAGE_BADGE_CLASS[stage]}`}>
                        {STAGE_META[stage].label}
                      </span>
                    </td>
                    <td className="py-2 pr-3"><StatusBadge status={a.fulfillment_status ?? a.application_status} /></td>
                    {!hideMoney && <td className="py-2 pr-3 text-right font-medium">{fmtINR(Number(a.total_amount ?? lead?.total_amount ?? 0))}</td>}
                    <td className="py-2 pr-3 text-xs" style={{ color: "var(--admin-fg-muted)" }}>{fmtD(a.created_at)}</td>
                    <td className="py-2 pr-3 text-right">
                      <Link to="/admin/orders/$orderId" params={{ orderId: a.id }} className="inline-flex">
                        <ExternalLink className="size-3.5 opacity-60" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function ComplaintsTab({ data }: { data: any }) {
  return (
    <SectionCard title={`Complaints (${data.complaints.length})`}>
      {data.complaints.length === 0 ? (
        <Empty label="No complaints raised" />
      ) : (
        <div className="space-y-1.5">
          {data.complaints.map((c: any) => (
            <Link
              key={c.id}
              to="/admin/complaints/$complaintId"
              params={{ complaintId: c.id }}
              className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-[var(--admin-surface-2)]"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <div>
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <MessageSquareWarning className="size-3.5" />
                  {c.complaint_number ?? c.id.slice(0, 8)}
                </div>
                <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                  {c.category ?? "—"} · severity {c.severity} · {fmtD(c.created_at)}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PaymentsTab({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <SectionCard title={`Payments (${data.payments.length})`}>
        {data.payments.length === 0 ? (
          <Empty label="No payments captured" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Gateway</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p: any) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--admin-border)" }}>
                    <td className="py-2 pr-3 text-xs">{fmtDT(p.payment_date ?? p.created_at)}</td>
                    <td className="py-2 pr-3 text-xs capitalize">{p.gateway_name}</td>
                    <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                    <td className="py-2 pr-3 text-right font-medium">{fmtINR(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Invoices (${data.invoices.length})`}>
        {data.invoices.length === 0 ? (
          <Empty label="No invoices yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>
                  <th className="py-2 pr-3">Invoice</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">PDF</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i: any) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--admin-border)" }}>
                    <td className="py-2 pr-3 font-mono text-xs">{i.invoice_number ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{fmtD(i.issued_at)}</td>
                    <td className="py-2 pr-3 text-right font-medium">{fmtINR(Number(i.total_amount))}</td>
                    <td className="py-2 pr-3 text-xs" style={{ color: "var(--admin-fg-muted)" }}>{i.pdf_path ? "Generated" : "Pending"}</td>
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

function DocumentsTab({ data }: { data: any }) {
  const deletedOrders = (data.applications ?? []).filter((a: any) => a.documents_deleted_at);
  return (
    <div className="space-y-3">
      {deletedOrders.length > 0 && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }}>
          <div className="font-medium mb-1">Documents deleted (privacy policy)</div>
          <ul className="space-y-0.5">
            {deletedOrders.map((a: any) => (
              <li key={a.id} style={{ color: "var(--admin-fg-muted)" }}>
                Order <span className="font-mono">{a.application_code ?? a.id.slice(0, 8)}</span> — documents deleted on {fmtD(a.documents_deleted_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SectionCard title={`Documents (${data.documents.length})`}>
        {data.documents.length === 0 ? (
          <Empty label="No documents uploaded" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">File</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Uploaded</th>
                  <th className="py-2 pr-3">Verified</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((d: any) => (
                  <tr key={d.id} className="border-t" style={{ borderColor: "var(--admin-border)" }}>
                    <td className="py-2 pr-3 text-xs font-medium uppercase">{d.doc_type}</td>
                    <td className="py-2 pr-3 text-xs">{d.file_name}</td>
                    <td className="py-2 pr-3"><StatusBadge status={d.status} /></td>
                    <td className="py-2 pr-3 text-xs" style={{ color: "var(--admin-fg-muted)" }}>{fmtDT(d.uploaded_at)}</td>
                    <td className="py-2 pr-3 text-xs" style={{ color: "var(--admin-fg-muted)" }}>{fmtDT(d.verified_at)}</td>
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

function CommunicationTab({ data }: { data: any }) {
  return (
    <SectionCard title={`Emails (${data.emails.length})`}>
      {data.emails.length === 0 ? (
        <Empty label="No emails sent" />
      ) : (
        <div className="space-y-1.5">
          {data.emails.map((e: any) => (
            <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--admin-border)" }}>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{e.subject}</div>
                <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                  to {e.to_email} · {e.template_code ?? "ad-hoc"} · {fmtDT(e.sent_at)}
                </div>
              </div>
              <StatusBadge status={e.status} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ---------- bits ---------- */

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>{label}</dt>
      <dd className="mt-0.5 text-sm">{value || "—"}</dd>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="p-6 text-sm text-center italic" style={{ color: "var(--admin-fg-muted)" }}>{label}</div>;
}

function ExpandableLeadRow({ lead: l, hideMoney }: { lead: any; hideMoney: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--admin-surface)]">
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1 rounded hover:bg-[var(--admin-surface-2)] shrink-0"
          title={open ? "Collapse" : "Expand"}
          aria-label="Toggle form details"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="font-medium text-sm font-mono">{l.lead_code ?? l.id.slice(0, 8)}</div>
          <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
            {l.service} · {fmtD(l.created_at)}{!hideMoney && ` · ${fmtINR(Number(l.total_amount))}`}
          </div>
        </button>
        <StatusBadge status={l.status} />
        <Link
          to="/admin/leads/$leadId"
          params={{ leadId: l.id }}
          className="p-1 rounded hover:bg-[var(--admin-surface-2)] shrink-0"
          title="Open lead"
        >
          <ExternalLink className="size-3.5" style={{ color: "var(--admin-fg-muted)" }} />
        </Link>
      </div>
      {open && <LeadFormSubmissionInline leadId={l.id} />}
    </div>
  );
}

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
      className="p-0.5 rounded hover:bg-[var(--admin-surface-2)]"
      title="Copy"
    >
      <Copy className="size-3" style={{ color: "var(--admin-fg-muted)" }} />
    </button>
  );
}

/* ---------- Activity Tab ---------- */

function ActivityTab({ data }: { data: any }) {
  const events = (data.events ?? []) as any[];
  return (
    <SectionCard title={`Activity (${events.length})`}>
      {events.length === 0 ? (
        <Empty label="No activity recorded" />
      ) : (
        <ol className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium capitalize">{e.event_type.replace(/_/g, " ")}</div>
                <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>{fmtDT(e.created_at)}</div>
              </div>
              {(e.old_value || e.new_value) && (
                <div className="text-xs mt-1" style={{ color: "var(--admin-fg-muted)" }}>
                  {e.old_value ? <><span className="line-through">{e.old_value}</span> → </> : null}
                  <span className="font-medium" style={{ color: "var(--admin-fg)" }}>{e.new_value ?? "—"}</span>
                </div>
              )}
              <div className="text-[11px] mt-1" style={{ color: "var(--admin-fg-muted)" }}>
                by {e.staff_name ?? "System"}{e.staff_role ? ` · ${e.staff_role}` : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

/* ---------- Editable Profile Card ---------- */

function EditableProfileCard({ customer, customerId }: { customer: any; customerId: string }) {
  const qc = useQueryClient();
  const update = useServerFn(updateCustomer);
  const upload = useServerFn(uploadCustomerKyc);
  const sign = useServerFn(getCustomerKycSignedUrl);

  const save = async (patch: Record<string, any>) => {
    try {
      await update({ data: { customerId, patch } });
      await qc.invalidateQueries({ queryKey: ["admin.customer360", customerId] });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const openDoc = async (path: string) => {
    try {
      const { url } = await sign({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open document");
    }
  };

  const handleUpload = async (docType: "pan" | "aadhaar", file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    const buf = await file.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    try {
      await upload({
        data: {
          customerId,
          docType,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
        },
      });
      await qc.invalidateQueries({ queryKey: ["admin.customer360", customerId] });
      toast.success(`${docType.toUpperCase()} document uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <SectionCard title="Profile">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <EditField label="Full Name" value={customer.name ?? ""} onSave={(v) => save({ name: v })} />
        <EditField label="Mobile" value={customer.primary_mobile ?? ""} onSave={(v) => save({ primary_mobile: v || null })} />
        <EditField label="Email" type="email" value={customer.primary_email ?? ""} onSave={(v) => save({ primary_email: v || null })} />
        <EditField label="State" value={customer.state ?? ""} onSave={(v) => save({ state: v || null })} />
        <EditField label="Address" textarea value={customer.address ?? ""} onSave={(v) => save({ address: v || null })} className="md:col-span-2" />

        <KycField
          label="PAN Number"
          number={customer.pan_number ?? ""}
          docPath={customer.pan_doc_path}
          onSaveNumber={(v) => save({ pan_number: v || null })}
          onUpload={(f) => handleUpload("pan", f)}
          onOpen={openDoc}
        />
        <KycField
          label="Aadhaar Number"
          number={customer.aadhaar_number ?? ""}
          docPath={customer.aadhaar_doc_path}
          onSaveNumber={(v) => save({ aadhaar_number: v || null })}
          onUpload={(f) => handleUpload("aadhaar", f)}
          onOpen={openDoc}
        />

        <EditField label="Business Name" value={customer.business_name ?? ""} onSave={(v) => save({ business_name: v || null })} />
        <EditField label="GST Number" value={customer.gst_number ?? ""} onSave={(v) => save({ gst_number: v || null })} />
        <EditField label="Udyam Number" value={customer.udyam_number ?? ""} onSave={(v) => save({ udyam_number: v || null })} />
      </div>

      <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--admin-border)" }}>
        <EditField
          label="Notes"
          textarea
          value={customer.notes ?? ""}
          onSave={(v) => save({ notes: v || null })}
          placeholder="Free-form notes about this customer…"
        />
      </div>
    </SectionCard>
  );
}

function EditField({
  label,
  value,
  onSave,
  type = "text",
  textarea = false,
  className = "",
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void | Promise<void>;
  type?: string;
  textarea?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  // Sync external updates
  useEffect(() => { setLocal(value); }, [value]);

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed === (value ?? "").trim()) return;
    onSave(trimmed);
  };

  const inputClass = "w-full rounded-md border px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/30";

  return (
    <label className={`block ${className}`}>
      <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--admin-fg-muted)" }}>{label}</div>
      {textarea ? (
        <textarea
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          rows={3}
          placeholder={placeholder}
          className={`${inputClass} resize-none`}
          style={{ borderColor: "var(--admin-border)" }}
        />
      ) : (
        <input
          type={type}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className={inputClass}
          style={{ borderColor: "var(--admin-border)" }}
        />
      )}
    </label>
  );
}

function KycField({
  label,
  number,
  docPath,
  onSaveNumber,
  onUpload,
  onOpen,
}: {
  label: string;
  number: string;
  docPath: string | null | undefined;
  onSaveNumber: (v: string) => void | Promise<void>;
  onUpload: (f: File) => void | Promise<void>;
  onOpen: (path: string) => void;
}) {
  return (
    <div>
      <EditField label={label} value={number} onSave={onSaveNumber} />
      <div className="flex items-center gap-2 mt-1.5">
        {docPath ? (
          <button
            onClick={() => onOpen(docPath)}
            className="text-[11px] inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-[var(--admin-surface-2)]"
            style={{ borderColor: "var(--admin-border)" }}
          >
            <FileText className="size-3" /> View document
          </button>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>No document uploaded</span>
        )}
        <label className="text-[11px] inline-flex items-center gap-1 rounded border px-2 py-1 cursor-pointer hover:bg-[var(--admin-surface-2)]"
          style={{ borderColor: "var(--admin-border)" }}
        >
          {docPath ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
