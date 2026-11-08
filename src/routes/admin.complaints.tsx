import { createFileRoute, Link, useNavigate, Outlet, useChildMatches } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus,
  Search,
  X,
  Loader2,
  Mail,
  MessageSquareWarning,
  ArrowRight,
  User,
  Phone,
  MapPin,
  Globe,
  FileText,
  Copy,
  ExternalLink,
} from "lucide-react";
import { SectionCard, TableSkeleton, StatusBadge, FilterChip } from "@/components/admin/ui";
import {
  listComplaints,
  createComplaint,
  searchLeadsForComplaint,
  listContactSubmissions,
  updateContactSubmissionStatus,
  updateContactSubmissionNotes,
  assignContactSubmission,
  convertContactToComplaint,
} from "@/lib/crm/complaints.functions";
import { listStaffForAssignment } from "@/lib/crm/tasks.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/complaints")({
  head: () => ({
    meta: [
      { title: "Complaints & Contact Submissions — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ComplaintsAndContactPage,
});

const STATUS_PILLS = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "awaiting_response", label: "Awaiting Response" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

const CONTACT_STATUS_PILLS = [
  { key: "lead_created", label: "New / Unread" },
  { key: "under_process", label: "In Progress" },
  { key: "contacted", label: "Contacted" },
  { key: "completed", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

const SEVERITY_PILLS = ["low", "normal", "high", "critical"] as const;

function ComplaintsAndContactPage() {
  const childMatches = useChildMatches();
  const [activeTab, setActiveTab] = useState<"complaints" | "contact_forms">("complaints");

  if (childMatches.length > 0) {
    return <Outlet />;
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs */}
      <div className="border-b" style={{ borderColor: "var(--admin-border)" }}>
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab("complaints")}
            className={`py-3 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-2 transition-colors ${
              activeTab === "complaints"
                ? "border-rose-500 text-rose-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <MessageSquareWarning className="size-4" />
            Complaints
          </button>
          <button
            onClick={() => setActiveTab("contact_forms")}
            className={`py-3 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-2 transition-colors ${
              activeTab === "contact_forms"
                ? "border-rose-500 text-rose-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Mail className="size-4" />
            Contact Form Submissions
          </button>
        </nav>
      </div>

      {activeTab === "complaints" ? <ComplaintsTab /> : <ContactSubmissionsTab />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              COMPLAINTS TAB                                */
/* -------------------------------------------------------------------------- */

function ComplaintsTab() {
  const listFn = useServerFn(listComplaints);
  const [status, setStatus] = useState<string | undefined>();
  const [severity, setSeverity] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.complaints", { status, severity, q }],
    queryFn: () => listFn({ data: { status, severity, q } }),
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? ({ all: 0 } as Record<string, number>);
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--admin-fg)" }}>
            Complaints
          </h1>
          <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Grievances and escalations across services and authorities.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--admin-primary)", color: "#fff" }}
        >
          <Plus className="size-3.5" /> Add Complaint
        </button>
      </header>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={!status} onClick={() => setStatus(undefined)}>
          All ({counts.all ?? 0})
        </FilterChip>
        {STATUS_PILLS.map((s) => (
          <FilterChip key={s.key} active={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label} ({counts[s.key] ?? 0})
          </FilterChip>
        ))}
      </div>

      <SectionCard>
        <div
          className="p-4 flex flex-wrap items-center gap-3 border-b"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <div
            className="flex items-center gap-2 rounded-md border px-3 h-9 flex-1 min-w-[240px] max-w-md"
            style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }}
          >
            <Search className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search complaint #, customer, mobile, order…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={severity ?? ""}
            onChange={(e) => setSeverity(e.target.value || undefined)}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            style={{ borderColor: "var(--admin-border)" }}
          >
            <option value="">All severities</option>
            {SEVERITY_PILLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={10} />
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            No complaints match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "var(--admin-surface-2)" }}>
                <tr className="text-left" style={{ color: "var(--admin-fg-muted)" }}>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">COMPLAINT NO</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">CUSTOMER</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">ORDER</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">SERVICE</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">MESSAGE PREVIEW</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">AUTHORITY</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">AUTH REF #</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">STATUS</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide text-right">DAYS OPEN</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">EXPECTED UPDATE</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">ASSIGNED</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any, i: number) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate({ to: "/admin/complaints/$complaintId", params: { complaintId: c.id } })}
                    className="border-t cursor-pointer hover:bg-[var(--admin-accent-soft)] transition-colors"
                    style={{
                      borderColor: "var(--admin-border)",
                      background: i % 2 ? "var(--admin-surface-2)" : "transparent",
                    }}
                  >
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold" style={{ color: "var(--admin-primary)" }}>
                      {c.complaint_number ?? c.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium" style={{ color: "var(--admin-fg)" }}>
                        {c.customer?.name ?? c.lead?.name ?? "—"}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                        {c.customer?.mobile ?? c.lead?.mobile ?? ""}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs">{c.application?.application_code ?? "—"}</td>
                    <td className="py-2.5 px-4 text-xs">{c.application?.service_name ?? c.lead?.service ?? "—"}</td>
                    <td className="py-2.5 px-4 text-xs max-w-xs truncate" title={c.description || c.notes || c.lead?.notes || ""}>
                      {c.description || c.notes || c.lead?.notes || "—"}
                    </td>
                    <td className="py-2.5 px-4 text-xs" style={{ color: "var(--admin-fg)" }}>
                      {c.authority_name ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs">{c.authority_ref_number ?? "—"}</td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{c.days_open}</td>
                    <td className="py-2.5 px-4 text-xs" style={{ color: "var(--admin-fg-muted)" }}>
                      {c.expected_update_at ? formatIST(c.expected_update_at) : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-xs" style={{ color: "var(--admin-fg-muted)" }}>
                      {c.assigned_name ?? "Unassigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {addOpen && <AddComplaintModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         CONTACT SUBMISSIONS TAB                            */
/* -------------------------------------------------------------------------- */

function ContactSubmissionsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContactSubmissions);
  const statusFn = useServerFn(updateContactSubmissionStatus);
  const assignFn = useServerFn(assignContactSubmission);

  const [status, setStatus] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [convertTarget, setConvertTarget] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.contactSubmissions", { status, q }],
    queryFn: () => listFn({ data: { status, q } }),
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? ({ all: 0 } as Record<string, number>);

  const handleStatusChange = async (id: string, newStatus: any) => {
    try {
      await statusFn({ data: { id, status: newStatus } });
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin.contactSubmissions"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    }
  };

  const handleAssignChange = async (id: string, staffId: string) => {
    try {
      await assignFn({ data: { id, assigned_to: staffId || null } });
      toast.success("Assignee updated");
      qc.invalidateQueries({ queryKey: ["admin.contactSubmissions"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to assign");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--admin-fg)" }}>
            Contact Form Submissions
          </h1>
          <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Public contact us submissions, general inquiries, and pre-sales questions.
          </p>
        </div>
      </header>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={!status} onClick={() => setStatus(undefined)}>
          All ({counts.all ?? 0})
        </FilterChip>
        {CONTACT_STATUS_PILLS.map((s) => (
          <FilterChip key={s.key} active={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label} ({counts[s.key] ?? 0})
          </FilterChip>
        ))}
      </div>

      <SectionCard>
        <div
          className="p-4 flex flex-wrap items-center gap-3 border-b"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <div
            className="flex items-center gap-2 rounded-md border px-3 h-9 flex-1 min-w-[240px] max-w-md"
            style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }}
          >
            <Search className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search contact name, email, mobile, message, state…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            No contact submissions match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "var(--admin-surface-2)" }}>
                <tr className="text-left" style={{ color: "var(--admin-fg-muted)" }}>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">DATE</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">CONTACT NAME</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">MOBILE & EMAIL</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">STATE / LANG</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">MESSAGE PREVIEW</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">STATUS</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">ASSIGNED</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedContact(r)}
                    className="border-t cursor-pointer hover:bg-[var(--admin-accent-soft)] transition-colors"
                    style={{
                      borderColor: "var(--admin-border)",
                      background: i % 2 ? "var(--admin-surface-2)" : "transparent",
                    }}
                  >
                    <td className="py-2.5 px-4 text-xs font-mono whitespace-nowrap" style={{ color: "var(--admin-fg-muted)" }}>
                      {formatIST(r.created_at)}
                    </td>
                    <td className="py-2.5 px-4 font-medium" style={{ color: "var(--admin-fg)" }}>
                      <span className="font-semibold text-rose-700 hover:underline">
                        {r.name || "Anonymous"}
                      </span>
                      {r.lead_code && (
                        <div className="text-[10px] font-mono text-slate-400">{r.lead_code}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <div>{r.mobile ? `+91 ${r.mobile}` : "—"}</div>
                      <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                        {r.email || "—"}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <div>{r.state || "—"}</div>
                      <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                        {r.language || "English"}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs max-w-xs truncate" title={r.notes}>
                      {r.notes || "—"}
                    </td>
                    <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        className="h-7 rounded border bg-transparent text-xs px-1.5 font-medium"
                        style={{ borderColor: "var(--admin-border)" }}
                      >
                        {CONTACT_STATUS_PILLS.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      <AssigneeSelect
                        value={r.assigned_to ?? ""}
                        onChange={(staffId) => handleAssignChange(r.id, staffId)}
                      />
                    </td>
                    <td className="py-2.5 px-4 text-xs text-right whitespace-nowrap space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedContact(r)}
                        className="px-2 py-1 rounded text-xs border font-medium hover:bg-slate-100"
                        style={{ borderColor: "var(--admin-border)" }}
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => setConvertTarget(r)}
                        className="px-2 py-1 rounded text-xs font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 inline-flex items-center gap-1"
                      >
                        <MessageSquareWarning className="size-3" /> Escalated
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* View Contact Detail Modal */}
      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onEscalate={() => {
            const c = selectedContact;
            setSelectedContact(null);
            setConvertTarget(c);
          }}
        />
      )}

      {/* Convert to Complaint Modal */}
      {convertTarget && (
        <ConvertContactToComplaintModal
          contact={convertTarget}
          onClose={() => setConvertTarget(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         CONTACT DETAIL MODAL                               */
/* -------------------------------------------------------------------------- */

function ContactDetailModal({
  contact,
  onClose,
  onEscalate,
}: {
  contact: any;
  onClose: () => void;
  onEscalate: () => void;
}) {
  const qc = useQueryClient();
  const saveNotesFn = useServerFn(updateContactSubmissionNotes);
  const statusFn = useServerFn(updateContactSubmissionStatus);

  const [notes, setNotes] = useState(contact.notes ?? "");
  const [status, setStatus] = useState(contact.status ?? "lead_created");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await Promise.all([
        saveNotesFn({ data: { id: contact.id, notes } }),
        statusFn({ data: { id: contact.id, status } }),
      ]);
      toast.success("Contact inquiry updated");
      qc.invalidateQueries({ queryKey: ["admin.contactSubmissions"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const copyText = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${label} copied`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg shadow-xl overflow-hidden"
        style={{ background: "var(--admin-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--admin-border)" }}>
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-rose-500" />
            <h2 className="text-base font-semibold" style={{ color: "var(--admin-fg)" }}>
              Contact Form Submission Details
            </h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[var(--admin-surface-2)]" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Metadata Grid (Matching Website Contact Form Fields) */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">
              Received Contact Form Fields
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Applicant Name</span>
                <span className="text-xs font-semibold text-slate-900 block truncate">{contact.name || "Anonymous"}</span>
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Mobile No</span>
                {contact.mobile ? (
                  <a href={`tel:+91${contact.mobile}`} className="text-xs font-mono font-semibold text-rose-700 hover:underline flex items-center gap-1">
                    <Phone className="size-3" /> +91 {contact.mobile}
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">Not provided</span>
                )}
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Email Address</span>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="text-xs font-semibold text-rose-700 hover:underline flex items-center gap-1 truncate block">
                    <Mail className="size-3" /> {contact.email}
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">Not provided</span>
                )}
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">State</span>
                <span className="text-xs font-semibold text-slate-800">{contact.state || "Not Provided"}</span>
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Preferred Language</span>
                <span className="text-xs font-semibold text-slate-800">{contact.language || "English"}</span>
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Submitted Date</span>
                <span className="text-xs font-mono text-slate-700">{formatIST(contact.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Received Purpose of Contact / Message Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] uppercase tracking-wide font-bold text-slate-500">
                Purpose of Contact / Message Body
              </label>
              {contact.notes && (
                <button
                  onClick={() => copyText(contact.notes, "Message")}
                  className="text-xs text-rose-700 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <Copy className="size-3" /> Copy Message
                </button>
              )}
            </div>
            <div className="p-3.5 rounded-lg border border-slate-200 text-sm bg-white whitespace-pre-wrap leading-relaxed shadow-inner font-sans">
              {contact.notes || "(No message body provided)"}
            </div>
          </div>

          {/* Status & Operational Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3" style={{ borderColor: "var(--admin-border)" }}>
            <div>
              <label className="block text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1">
                Response Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border p-2 text-sm bg-transparent"
                style={{ borderColor: "var(--admin-border)" }}
              >
                {CONTACT_STATUS_PILLS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1">
                Lead Reference ID
              </label>
              <div className="p-2 text-sm font-mono text-slate-600 bg-slate-50 rounded border" style={{ borderColor: "var(--admin-border)" }}>
                {contact.lead_code || contact.id.slice(0, 8)}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between px-5 py-3.5 border-t bg-slate-50/50" style={{ borderColor: "var(--admin-border)" }}>
          <button
            onClick={onEscalate}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-300 inline-flex items-center gap-1.5"
          >
            <MessageSquareWarning className="size-3.5" /> Convert to Complaint
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm" style={{ color: "var(--admin-fg-muted)" }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium"
              style={{ background: "var(--admin-primary)", color: "#fff" }}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                    CONVERT CONTACT TO COMPLAINT MODAL                      */
/* -------------------------------------------------------------------------- */

function ConvertContactToComplaintModal({
  contact,
  onClose,
}: {
  contact: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const convertFn = useServerFn(convertContactToComplaint);
  const navigate = useNavigate();

  const [authority, setAuthority] = useState("Internal Grievance Cell");
  const [authorityRef, setAuthorityRef] = useState("");
  const [description, setDescription] = useState(contact.notes ?? "");
  const [severity, setSeverity] = useState<(typeof SEVERITY_PILLS)[number]>("normal");
  const [assignedTo, setAssignedTo] = useState<string>(contact.assigned_to ?? "");
  const [busy, setBusy] = useState(false);

  const handleConvert = async () => {
    if (!authority.trim()) {
      toast.error("Authority name is required");
      return;
    }
    setBusy(true);
    try {
      const out = await convertFn({
        data: {
          lead_id: contact.id,
          authority_name: authority.trim(),
          authority_ref_number: authorityRef.trim() || undefined,
          description: description.trim() || undefined,
          severity,
          assigned_to: assignedTo || null,
        },
      });
      toast.success(`Converted to Complaint ${out.complaint_number}`);
      qc.invalidateQueries({ queryKey: ["admin.complaints"] });
      qc.invalidateQueries({ queryKey: ["admin.contactSubmissions"] });
      onClose();
      navigate({ to: "/admin/complaints/$complaintId", params: { complaintId: out.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to convert to complaint");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg shadow-xl"
        style={{ background: "var(--admin-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--admin-border)" }}>
          <h2 className="text-base font-semibold text-rose-700 flex items-center gap-2">
            <MessageSquareWarning className="size-4" /> Escalation: Convert to Complaint
          </h2>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[var(--admin-surface-2)]">
            <X className="size-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-md border text-xs bg-slate-50 space-y-1" style={{ borderColor: "var(--admin-border)" }}>
            <div><span className="font-semibold">Customer:</span> {contact.name} ({contact.mobile || contact.email || "No contact"})</div>
            <div><span className="font-semibold">Lead Ref:</span> <span className="font-mono">{contact.lead_code}</span></div>
          </div>

          <Field label="Authority Name" required>
            <input
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              placeholder="e.g. Ministry of MSME / Internal Support Desk"
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--admin-border)" }}
            />
          </Field>

          <Field label="Authority Reference #">
            <input
              value={authorityRef}
              onChange={(e) => setAuthorityRef(e.target.value)}
              placeholder="Grievance Ref / Diary No."
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent font-mono"
              style={{ borderColor: "var(--admin-border)" }}
            />
          </Field>

          <Field label="Complaint Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--admin-border)" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--admin-border)" }}
              >
                {SEVERITY_PILLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assignee">
              <AssigneeSelect value={assignedTo} onChange={setAssignedTo} />
            </Field>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "var(--admin-border)" }}>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Confirm Escalation
          </button>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            ADD COMPLAINT MODAL                             */
/* -------------------------------------------------------------------------- */

function AddComplaintModal({
  onClose,
  defaultLeadId,
  defaultLeadLabel,
  defaultApplicationId,
}: {
  onClose: () => void;
  defaultLeadId?: string | null;
  defaultLeadLabel?: string | null;
  defaultApplicationId?: string | null;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createComplaint);
  const searchFn = useServerFn(searchLeadsForComplaint);

  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<{ id: string; name: string; lead_code?: string; service?: string } | null>(
    defaultLeadId && defaultLeadLabel ? { id: defaultLeadId, name: defaultLeadLabel } : null,
  );
  const [authority, setAuthority] = useState("");
  const [authorityRef, setAuthorityRef] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITY_PILLS)[number]>("normal");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: searchData, isFetching } = useQuery({
    queryKey: ["complaint-lead-search", leadQuery],
    queryFn: () => searchFn({ data: { q: leadQuery } }),
    enabled: leadQuery.length >= 2 && !selectedLead,
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!selectedLead) e.lead = "Customer / lead is required.";
    if (authority.trim().length < 1) e.authority = "Authority name is required.";
    if (description.trim().length < 1) e.description = "Complaint description is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    try {
      const out = await createFn({
        data: {
          lead_id: selectedLead!.id,
          application_id: defaultApplicationId ?? null,
          severity,
          description,
          authority_name: authority.trim(),
          authority_ref_number: authorityRef.trim() || undefined,
          expected_update_at: expected || undefined,
          assigned_to: assignedTo || null,
        },
      });
      toast.success(`Complaint ${out.complaint_number ?? "created"} added`);
      qc.invalidateQueries({ queryKey: ["admin.complaints"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create complaint");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-lg"
        style={{ background: "var(--admin-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--admin-border)" }}>
          <h2 className="text-base font-medium" style={{ color: "var(--admin-fg)" }}>Add Complaint</h2>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[var(--admin-surface-2)]" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <Field label="Customer / Lead" required error={errors.lead}>
            {selectedLead ? (
              <div className="flex items-center justify-between rounded-md border p-2.5" style={{ borderColor: "var(--admin-border)" }}>
                <div>
                  <div className="text-sm font-medium">{selectedLead.name}</div>
                  {(selectedLead.lead_code || selectedLead.service) && (
                    <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                      {[selectedLead.lead_code, selectedLead.service].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedLead(null); setLeadQuery(""); }}
                  className="text-xs"
                  style={{ color: "var(--admin-accent)" }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  autoFocus
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Search by name, email, mobile, or lead code"
                  className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                  style={{ borderColor: "var(--admin-border)" }}
                />
                {leadQuery.length >= 2 && (
                  <div
                    className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border z-10"
                    style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
                  >
                    {isFetching ? (
                      <div className="p-3 text-xs flex items-center gap-2" style={{ color: "var(--admin-fg-muted)" }}>
                        <Loader2 className="size-3 animate-spin" /> Searching…
                      </div>
                    ) : (searchData?.leads ?? []).length === 0 ? (
                      <div className="p-3 text-xs" style={{ color: "var(--admin-fg-muted)" }}>No matches.</div>
                    ) : (
                      <ul>
                        {searchData!.leads.map((l: any) => (
                          <li key={l.id}>
                            <button
                              onClick={() => setSelectedLead({ id: l.id, name: l.name, lead_code: l.lead_code, service: l.service })}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--admin-surface-2)]"
                            >
                              <div className="font-medium">{l.name}</div>
                              <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                                {l.lead_code} · {l.email ?? ""} {l.mobile ? `· +91 ${l.mobile}` : ""}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Authority Name" required error={errors.authority}>
              <input
                value={authority}
                onChange={(e) => setAuthority(e.target.value)}
                placeholder="e.g. Ministry of MSME"
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--admin-border)" }}
              />
            </Field>
            <Field label="Authority Reference #">
              <input
                value={authorityRef}
                onChange={(e) => setAuthorityRef(e.target.value)}
                placeholder="Ticket/Diary No."
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--admin-border)" }}
              />
            </Field>
          </div>

          <Field label="Complaint Description" required error={errors.description}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What went wrong, dates, supporting facts"
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--admin-border)" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected Update">
              <input
                type="date"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--admin-border)" }}
              />
            </Field>
            <Field label="Severity">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--admin-border)" }}
              >
                {SEVERITY_PILLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Assign To (optional)">
            <AssigneeSelect value={assignedTo} onChange={setAssignedTo} />
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "var(--admin-border)" }}>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--admin-primary)", color: "#fff" }}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Create complaint
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide font-medium mb-1" style={{ color: "var(--admin-fg-muted)" }}>
        {label}
        {required && <span style={{ color: "var(--admin-danger)" }}> *</span>}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-[11px]" style={{ color: "var(--admin-danger)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function AssigneeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fn = useServerFn(listStaffForAssignment);
  const { data } = useQuery({
    queryKey: ["staff-assign"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
      style={{ borderColor: "var(--admin-border)" }}
    >
      <option value="">Unassigned</option>
      {(data?.staff ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

function formatIST(iso: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
