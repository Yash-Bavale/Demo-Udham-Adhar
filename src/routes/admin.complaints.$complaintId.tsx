import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getComplaintDetail, updateComplaintNotes } from "@/lib/crm/complaints-detail.functions";
import { updateComplaint, updateComplaintStatus } from "@/lib/crm/complaints.functions";
import { listStaffForAssignment } from "@/lib/crm/tasks.functions";
import { StatusTransition } from "@/components/admin/StatusTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  MessageSquareWarning,
  User,
  FileText,
  History,
  Loader2,
  Save,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  Copy,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/complaints/$complaintId")({
  head: () => ({
    meta: [{ title: "Complaint Details — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: ComplaintDetailPage,
});

function fmtIST(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(",", "");
}

function ComplaintDetailPage() {
  const { complaintId } = Route.useParams();
  const qc = useQueryClient();
  const fetchFn = useServerFn(getComplaintDetail);
  const saveNotesFn = useServerFn(updateComplaintNotes);
  const updateFn = useServerFn(updateComplaint);
  const updateStatusFn = useServerFn(updateComplaintStatus);
  const listStaffFn = useServerFn(listStaffForAssignment);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin.complaint", complaintId],
    queryFn: () => fetchFn({ data: { id: complaintId } }),
  });

  const { data: staffData } = useQuery({
    queryKey: ["staff-assign"],
    queryFn: () => listStaffFn(),
    staleTime: 60_000,
  });

  const [notes, setNotes] = useState("");
  const [notesInit, setNotesInit] = useState(false);
  const [busy, setBusy] = useState(false);

  // Authority editable card state
  const [authority, setAuthority] = useState("");
  const [authorityRef, setAuthorityRef] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authInit, setAuthInit] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-32 animate-pulse rounded-lg border" style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }} />
        <div className="h-64 animate-pulse rounded-lg border" style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }} />
      </div>
    );
  }
  if (!data) return null;
  const { complaint, audits } = data as any;

  if (!notesInit) {
    setNotes(complaint.notes ?? "");
    setNotesInit(true);
  }
  if (!authInit) {
    setAuthority(complaint.authority_name ?? "");
    setAuthorityRef(complaint.authority_ref_number ?? "");
    setDescription(complaint.description ?? "");
    setExpected(complaint.expected_update_at ? complaint.expected_update_at.slice(0, 10) : "");
    setAssignedTo(complaint.assigned_to ?? "");
    setAuthInit(true);
  }

  const handleSaveNotes = async () => {
    setBusy(true);
    try {
      await saveNotesFn({ data: { id: complaintId, notes } });
      toast.success("Notes saved");
      qc.invalidateQueries({ queryKey: ["admin.complaint", complaintId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAuthority = async () => {
    if (!authority.trim()) {
      toast.error("Authority name is required");
      return;
    }
    setAuthBusy(true);
    try {
      await updateFn({
        data: {
          id: complaintId,
          patch: {
            authority_name: authority.trim(),
            authority_ref_number: authorityRef.trim() || null,
            description: description || null,
            expected_update_at: expected || null,
            assigned_to: assignedTo || null,
          },
        },
      });
      toast.success("Authority & Assignment updated");
      qc.invalidateQueries({ queryKey: ["admin.complaint", complaintId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleQuickStatus = async (newStatus: any) => {
    try {
      await updateStatusFn({ data: { id: complaintId, status: newStatus } });
      toast.success(`Complaint status changed to ${newStatus.replace(/_/g, " ")}`);
      refetch();
      qc.invalidateQueries({ queryKey: ["admin.complaints"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed status update");
    }
  };

  // Days open calculation
  const createdMs = new Date(complaint.created_at || Date.now()).getTime();
  const daysOpen = Math.max(0, Math.floor((Date.now() - createdMs) / 86_400_000));

  // Extract application reference if formatted as "Ref: XXXX"
  const extractedRef =
    complaint.application?.application_code ||
    (complaint.notes?.match(/^Ref:\s*([^\n]+)/)?.[1]) ||
    "None Specified";

  // Clean submitted grievance text
  const rawNotes = complaint.notes || complaint.lead?.notes || "";
  const cleanGrievanceText =
    rawNotes.replace(/^Ref:\s*[^\n]+\n*/i, "").trim() ||
    complaint.description ||
    "No detailed text provided.";

  const customerName = complaint.customer?.name || complaint.lead?.name || "Complainant";
  const customerEmail = complaint.customer?.primary_email || complaint.lead?.email || null;
  const customerMobile = complaint.customer?.primary_mobile || complaint.lead?.mobile || null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/complaints" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 gap-1 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to complaints & contact forms
      </Link>

      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold shadow-xs">
            <MessageSquareWarning className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900 font-mono tracking-tight">{complaint.complaint_number || "Complaint"}</h1>
              <Badge variant="outline" className="capitalize text-xs font-bold bg-rose-50 text-rose-800 border-rose-200">
                {complaint.severity || "normal"} severity
              </Badge>
              <Badge variant="secondary" className="text-xs font-semibold">
                {daysOpen} day{daysOpen === 1 ? "" : "s"} open
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span>Submitted on {fmtIST(complaint.submitted_at || complaint.created_at)}</span>
              <span>·</span>
              <span>Assigned: <strong className="text-slate-800">{complaint.assigned_name || "Unassigned"}</strong></span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusTransition kind="complaint" entityId={complaintId} current={complaint.status} onChanged={refetch} />
        </div>
      </div>

      {/* Quick Status Bar */}
      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-100/70 text-xs overflow-x-auto">
        <span className="font-bold text-slate-500 text-[11px] uppercase tracking-wider px-2">Quick Status Action:</span>
        {(["submitted", "under_review", "awaiting_response", "resolved", "closed"] as const).map((st) => (
          <button
            key={st}
            onClick={() => handleQuickStatus(st)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap ${
              complaint.status === st
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-200"
            }`}
          >
            {st.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Primary Card: Original Received Complaint Details */}
      <Card className="border-rose-200 bg-gradient-to-br from-rose-50/40 via-white to-slate-50/50 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="py-3.5 px-5 border-b border-rose-100 bg-rose-50/60 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-rose-950 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            Original Grievance & Submitter Details
          </CardTitle>
          <span className="text-xs text-rose-800 font-mono font-bold bg-white/80 px-2.5 py-1 rounded-md border border-rose-200">
            Ref: {extractedRef}
          </span>
        </CardHeader>
        <CardContent className="p-5 space-y-4 text-sm">
          {/* Submitter Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs">
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Full Name</span>
              <span className="text-sm font-bold text-slate-900">{customerName}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mobile Number</span>
              {customerMobile ? (
                <a href={`tel:+91${customerMobile}`} className="text-sm font-mono font-bold text-rose-700 hover:underline flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> +91 {customerMobile}
                </a>
              ) : (
                <span className="text-sm text-slate-400">Not provided</span>
              )}
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email Address</span>
              {customerEmail ? (
                <a href={`mailto:${customerEmail}`} className="text-sm font-semibold text-rose-700 hover:underline flex items-center gap-1 truncate block">
                  <Mail className="w-3.5 h-3.5" /> {customerEmail}
                </a>
              ) : (
                <span className="text-sm text-slate-400">Not provided</span>
              )}
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Application Ref</span>
              <span className="text-sm font-mono font-bold text-slate-800">{extractedRef}</span>
            </div>
          </div>

          {/* Received Complaint / Grievance Text */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Submitted Grievance Message
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(cleanGrievanceText, "Grievance message")}
                className="text-xs text-rose-700 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Message
              </button>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm leading-relaxed whitespace-pre-wrap font-sans shadow-inner">
              {cleanGrievanceText}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Section: Authority Filing & Escalation Status */}
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="py-3.5 px-5 border-b bg-slate-50/50 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Authority & Filing Details (Internal Ops)
          </CardTitle>
          <Button onClick={handleSaveAuthority} disabled={authBusy} size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-semibold">
            {authBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save Filing Info
          </Button>
        </CardHeader>
        <CardContent className="p-5 grid md:grid-cols-3 gap-4 text-sm">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide font-bold mb-1 text-slate-500">Authority Name *</span>
            <input
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              placeholder="e.g. Ministry of MSME / Grievance Officer"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white font-medium"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide font-bold mb-1 text-slate-500">Authority Reference #</span>
            <input
              value={authorityRef}
              onChange={(e) => setAuthorityRef(e.target.value)}
              placeholder="Ticket / Diary / Reference No."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono bg-white"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide font-bold mb-1 text-slate-500">Expected Update Date</span>
            <input
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white"
            />
          </label>
          <label className="block md:col-span-3">
            <span className="block text-[11px] uppercase tracking-wide font-bold mb-1 text-slate-500">Assign To Staff</span>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white font-medium"
            >
              <option value="">Unassigned</option>
              {(staffData?.staff ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-3">
            <span className="block text-[11px] uppercase tracking-wide font-bold mb-1 text-slate-500">Investigation & Action Summary</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Summary of actions taken with authority or resolutions provided"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm bg-white"
            />
          </label>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 rounded-2xl border-slate-200">
          <CardHeader className="py-3.5 px-5 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-bold text-slate-900">Internal Ops Notes</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Internal investigation notes, calls made, customer responses, follow-up reminders…"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white"
            />
            <Button onClick={handleSaveNotes} disabled={busy} size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-semibold">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Save className="w-3.5 h-3.5 mr-2" />} Save Internal Notes
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200">
          <CardHeader className="py-3.5 px-5 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <User className="w-4 h-4" /> Linked CRM Context
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {complaint.lead && (
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Lead Entry</div>
                <Link
                  to="/admin/leads/$leadId"
                  params={{ leadId: complaint.lead.id }}
                  className="text-sm font-bold hover:underline text-rose-700 block"
                >
                  {complaint.lead.name}
                </Link>
                <div className="text-xs text-slate-500">{complaint.lead.email}</div>
                <div className="text-xs text-slate-500 font-mono">{complaint.lead.lead_code}</div>
              </div>
            )}
            {complaint.application && (
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Linked Order</div>
                <Link
                  to="/admin/orders/$orderId"
                  params={{ orderId: complaint.application.id }}
                  className="text-sm font-mono font-bold hover:underline flex items-center gap-1 text-slate-900"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" /> {complaint.application.application_code}
                </Link>
                <Badge variant="outline" className="mt-1 text-[10px] uppercase font-bold">
                  {complaint.application.application_status?.replace(/_/g, " ")}
                </Badge>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Reminders Sent</div>
              <div className="text-sm font-bold text-slate-800">{complaint.reminder_count || 0}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-slate-200 overflow-hidden">
        <CardHeader className="py-3.5 px-5 border-b bg-slate-50/50">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4" /> Audit & Activity Trail
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {audits.length === 0 ? (
            <div className="p-6 text-sm text-center text-slate-400 italic">No activity logged yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {audits.map((a: any) => (
                <li key={a.id} className="py-3.5 px-5 text-sm hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{a.action.replace(/_/g, " ")}</span>
                    <span className="text-[11px] font-mono text-slate-400">{fmtIST(a.created_at)}</span>
                  </div>
                  {a.actor_email && <div className="text-xs text-slate-500 mt-0.5">by {a.actor_email}</div>}
                  {(a.old_value || a.new_value) && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium">Show details</summary>
                      <pre className="mt-1.5 p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-auto leading-relaxed">
                        {JSON.stringify({ before: a.old_value, after: a.new_value }, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

