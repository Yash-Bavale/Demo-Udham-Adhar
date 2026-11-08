import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CallButton } from "@/components/admin/telephony/CallButton";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar as CalendarIcon,
  FileText,
  Receipt,
  Trash2,
  Phone,
  FileWarning,
  Sparkles,
  Clock,
  Copy,
  Mail,
  MessageCircle,
  Link2,
} from "lucide-react";
import { CopyButton } from "@/components/admin/primitives/CopyButton";
import { formatIST } from "@/lib/datetime";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  getAllowedLeadTransitions,
  type LeadStatusV2,
} from "@/lib/crm/lead-transitions";
import { transitionLeadStatus, addManualNote, listLeadEvents } from "@/lib/crm/lead-status.functions";
import { approveRefund, markRefundProcessed, rejectRefund } from "@/lib/crm/refunds.functions";
import { createFollowUp, listFollowUpsForLead } from "@/lib/crm/follow-ups.functions";
import { createPaymentLink, getPaymentLinkStatusForLead, sendPaymentLinkEmail as sendPaymentLinkEmailFn } from "@/lib/payments/payment-links.functions";
import { useRole } from "@/hooks/useRole";
import { ConvertConsultationPanel } from "./ConvertConsultationPanel";
import { LogContactDialog } from "./LogContactDialog";
import { listContactEvents } from "@/lib/crm/performance.functions";
import { isUnconvertedConsultationLead } from "@/lib/crm/consultation";
import { formatLeadSource } from "@/lib/crm/format-lead-source";

type Staff = { id: string; display_name: string | null; email: string | null };


type LeadShape = {
  id: string;
  lead_code: string;
  name: string;
  email?: string | null;
  mobile?: string | null;
  status: string;
  lead_status_v2?: LeadStatusV2 | null;
  customer_id?: string | null;
  service?: string | null;
  lead_source?: string | null;
  state?: string | null;
  language?: string | null;
  base_amount?: number | string | null;
  gst_amount?: number | string | null;
  total_amount?: number | string | null;
  created_at?: string | null;
};

export function LeadWorkspacePanel({
  lead,
  applications,
  staff,
}: {
  lead: LeadShape;
  applications: any[];
  staff: Staff[];
}) {
  const currentStatus: LeadStatusV2 = (lead.lead_status_v2 ?? "new_lead") as LeadStatusV2;
  const role = useRole();
  const hideMoney = role.hideMoney();
  const hasPaidOrder = (applications ?? []).some(
    (a) =>
      a?.application_status &&
      !["awaiting_payment", "payment_pending", "payment_failed", "cancelled"].includes(a.application_status),
  );
  return (
    <div className="space-y-5">
      {(currentStatus === "refund_requested" || currentStatus === "refund_approved") && (
        <RefundDecisionPanel lead={lead} currentStatus={currentStatus} />
      )}
      {isUnconvertedConsultationLead(lead) && (
        <ConvertConsultationPanel
          leadId={lead.id}
          leadCode={lead.lead_code}
          mode="select"
          customerName={lead.name}
          customerMobile={lead.mobile ?? null}
          service={lead.service ?? null}
          totalAmount={lead.total_amount != null ? Number(lead.total_amount) : null}
        />
      )}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <CustomerQuickCard lead={lead} />
        </div>
        <div className="lg:col-span-5">
          <QuickActionsCard lead={lead} currentStatus={currentStatus} hideMoney={hideMoney} />
        </div>
        <div className="lg:col-span-12">
          <FollowUpScheduler leadId={lead.id} staff={staff} />
        </div>
        {hasPaidOrder && applications.length > 0 && (
          <div className="lg:col-span-12">
            <LinkedOrderPanel applications={applications} hideMoney={hideMoney} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------- Customer Quick Card ------------------- */

function relativeTime(iso?: string | null) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return null;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function buildIntroMessage(
  customerName: string,
  employeeName: string | null,
  leadCode: string,
  service: string | null,
) {
  const emp = employeeName || "the Udyam Aadhar Advisory team";
  return (
    `Hi ${customerName}\n` +
    `\n` +
    `I'm ${emp} from Udyam Aadhar Advisory.\n` +
    `\n` +
    `Lead ID: ${leadCode}   Service: ${service ?? "your service"}\n` +
    `\n` +
    `I'm here to assist you with any questions regarding your service.\n` +
    `\n` +
    ` Office Hours: 10:00 AM – 6:00 PM\n` +
    `\n` +
    `Simply reply to this message or contact us anytime during office hours.`
  );
}

function buildPaymentLinkMessage(
  customerName: string,
  employeeName: string | null,
  leadCode: string,
  service: string | null,
  paymentUrl: string,
) {
  const emp = employeeName || "the Udyam Aadhar Advisory team";
  return (
    `Hi ${customerName}\n` +
    `\n` +
    `I'm ${emp} from Udyam Aadhar Advisory.\n` +
    `\n` +
    `Lead ID: ${leadCode}   Service: ${service ?? "your service"}\n` +
    `\n` +
    `Payment Link: ${paymentUrl}\n` +
    `\n` +
    `I'm here to assist you with any questions regarding your service.\n` +
    `\n` +
    ` Office Hours: 10:00 AM – 6:00 PM\n` +
    `\n` +
    `Simply reply to this message or contact us anytime during office hours.`
  );
}

function waNumber(mobile?: string | null) {
  const digits = (mobile ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? "91" + digits : digits;
}

function whatsappUrl(number: string, message: string) {
  return `https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(message)}`;
}

function openWhatsApp(url: string, preparedWindow?: Window | null) {
  if (preparedWindow && !preparedWindow.closed) {
    preparedWindow.location.replace(url);
    return;
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(url);
}

function readPaymentUrl(value: any): string | null {
  return (
    value?.payment_url ??
    value?.url ??
    value?.short_url ??
    value?.link?.payment_url ??
    value?.link?.url ??
    value?.link?.short_url ??
    null
  );
}

function CustomerQuickCard({ lead }: { lead: LeadShape }) {
  const number = waNumber(lead.mobile);
  const waUrl = number ? `https://wa.me/${number}` : null;

  const total = lead.total_amount != null ? Number(lead.total_amount) : null;
  const sourceLabel = formatLeadSource(lead.lead_source);
  const rel = relativeTime(lead.created_at);

  const cell = "flex flex-col gap-0.5 min-w-0";
  const labelCls = "text-[10px] uppercase tracking-wider text-slate-500 font-semibold";
  const valueCls = "text-sm font-semibold text-slate-900 truncate";

  const initials = (lead.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const kv = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className={labelCls}>{label}</span>
      <span className={valueCls}>{value ?? "—"}</span>
    </div>
  );

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden shadow-sm"
      style={{ borderColor: "var(--admin-border)" }}
    >
      {/* Hero: Name + Mobile — highlighted, always full-width so nothing is split on mobile */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 text-white px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-start gap-3">
          <div className="size-12 sm:size-14 shrink-0 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center text-lg sm:text-xl font-bold">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-white/70 font-semibold">Customer</div>
            <div className="text-lg sm:text-xl font-bold leading-tight truncate">{lead.name}</div>
            {lead.mobile ? (
              <a
                href={`tel:${lead.mobile}`}
                className="mt-1 inline-flex items-center gap-1.5 text-base sm:text-lg font-semibold tabular-nums hover:underline"
              >
                <Phone className="size-4 opacity-80" />
                {lead.mobile}
              </a>
            ) : (
              <div className="mt-1 text-sm text-white/70">No mobile on file</div>
            )}
          </div>
          {lead.mobile && (
            <CopyButton
              value={lead.mobile}
              label=""
              className="text-white/90 hover:text-white bg-white/10 hover:bg-white/20 border-white/25"
            />
          )}
        </div>
      </div>

      {lead.mobile ? (
        <div className="px-4 py-3 border-b border-slate-100 bg-white">
          <CallButton mobile={lead.mobile} leadId={lead.id} customerId={(lead as any).customer_id ?? null} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition" />
        </div>
      ) : null}

      {/* Communication buttons — right under the highlighted identity, so actions are inline on mobile */}
      <div className="grid grid-cols-3 border-b border-slate-100">
        {lead.mobile ? (
          <a
            href={`tel:${lead.mobile}`}
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-50 active:bg-indigo-100 hover:bg-indigo-100 transition-colors border-r border-slate-100"
          >
            <Phone className="size-4" /> Call
          </a>
        ) : (
          <span className="border-r border-slate-100" />
        )}
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 text-xs sm:text-sm font-semibold text-emerald-700 bg-emerald-50 active:bg-emerald-100 hover:bg-emerald-100 transition-colors border-r border-slate-100"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : (
          <span className="border-r border-slate-100" />
        )}
        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 text-xs sm:text-sm font-semibold text-sky-700 bg-sky-50 active:bg-sky-100 hover:bg-sky-100 transition-colors"
          >
            <Mail className="size-4" /> Email
          </a>
        ) : (
          <span />
        )}
      </div>

      {/* Details — single column on mobile so labels & values stay aligned, two cols on ≥sm */}
      <div className="p-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
        {kv("Service", lead.service)}
        {kv("Price", total != null ? <span className="tabular-nums">₹{total.toLocaleString("en-IN")}</span> : null)}
        {kv("State", lead.state)}
        {kv("Language", lead.language)}
        {kv(
          "Email",
          lead.email ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate" title={lead.email}>
                {lead.email}
              </span>
              <CopyButton value={lead.email} label="" />
            </span>
          ) : null,
        )}
        {kv(
          "Submitted",
          lead.created_at ? (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span>{formatIST(lead.created_at)}</span>
              {rel && <span className="text-xs font-normal text-slate-500">{rel}</span>}
            </span>
          ) : null,
        )}
      </div>

      {sourceLabel && (
        <div
          className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500 font-mono truncate"
          title={sourceLabel}
        >
          Source: {sourceLabel}
        </div>
      )}

      {lead.customer_id && (
        <a
          href={`/admin/customers/${lead.customer_id}`}
          className="block text-xs text-indigo-600 hover:underline px-4 py-2 border-t border-slate-100"
        >
          Open customer 360 →
        </a>
      )}
    </div>
  );
}

/* ------------------- Quick Actions Card ------------------- */

function QuickActionsCard({
  lead,
  currentStatus,
  hideMoney,
}: {
  lead: LeadShape;
  currentStatus: LeadStatusV2;
  hideMoney: boolean;
}) {
  const qc = useQueryClient();
  const transitionFn = useServerFn(transitionLeadStatus);
  const createLinkFn = useServerFn(createPaymentLink);
  const linkStatusFn = useServerFn(getPaymentLinkStatusForLead);
  const sendPaymentEmailFn = useServerFn(sendPaymentLinkEmailFn);
  const role = useRole();
  const employeeName = role.displayName;

  const [contactBusy, setContactBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const { data: linkStatus } = useQuery({
    queryKey: ["lead.paymentLink", lead.id],
    queryFn: () => linkStatusFn({ data: { leadId: lead.id } }),
    staleTime: 30_000,
  });
  const paymentUrl = readPaymentUrl(linkStatus);

  const number = waNumber(lead.mobile);
  const introMsg = buildIntroMessage(lead.name, employeeName, lead.lead_code, lead.service ?? null);
  const introWaUrl = number ? whatsappUrl(number, introMsg) : null;

  const toggleContacted = async () => {
    const next = currentStatus === "contacted" ? "new_lead" : "contacted";
    setContactBusy(true);
    try {
      await transitionFn({ data: { leadId: lead.id, toStatus: next } });
      toast.success(next === "contacted" ? "Marked as Contacted" : "Marked as New Lead");
      qc.invalidateQueries({ queryKey: ["admin.lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["admin.lead-events", lead.id] });
      qc.invalidateQueries({ queryKey: ["admin.leads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setContactBusy(false);
    }
  };

  const contactOnWhatsApp = () => {
    if (!number) {
      toast.error("Add a mobile number first");
      return;
    }
    if (!introWaUrl) return;
    openWhatsApp(introWaUrl);
  };

  const ensurePaymentUrl = async (): Promise<string | null> => {
    if (paymentUrl) return paymentUrl;
    setLinkBusy(true);
    try {
      const res: any = await createLinkFn({ data: { leadId: lead.id } });
      const url = readPaymentUrl(res);
      await qc.invalidateQueries({ queryKey: ["lead.paymentLink", lead.id] });
      return url;
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate link");
      return null;
    } finally {
      setLinkBusy(false);
    }
  };

  const generateLink = async () => {
    const url = await ensurePaymentUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Payment link copied");
    } catch {
      toast.success("Payment link generated");
    }
  };

  const sendPaymentLinkWhatsApp = async () => {
    if (!number) {
      toast.error("Add a mobile number first");
      return;
    }
    if (paymentUrl) {
      const msg = buildPaymentLinkMessage(lead.name, employeeName, lead.lead_code, lead.service ?? null, paymentUrl);
      openWhatsApp(whatsappUrl(number, msg));
      return;
    }

    const waWin = window.open("about:blank", "_blank");
    const url = await ensurePaymentUrl();
    if (!url) {
      waWin?.close();
      return;
    }
    const msg = buildPaymentLinkMessage(lead.name, employeeName, lead.lead_code, lead.service ?? null, url);
    openWhatsApp(whatsappUrl(number, msg), waWin);
  };

  const sendPaymentLinkEmail = async () => {
    if (!lead.email) {
      toast.error("Add a customer email first");
      return;
    }
    setLinkBusy(true);
    try {
      const res = await sendPaymentEmailFn({ data: { leadId: lead.id } });
      toast.success(res.message || `Payment link email sent to ${lead.email}`);
      qc.invalidateQueries({ queryKey: ["lead.paymentLink", lead.id] });
      qc.invalidateQueries({ queryKey: ["admin.lead-events", lead.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send payment link email");
    } finally {
      setLinkBusy(false);
    }
  };


  const isContacted = currentStatus === "contacted";
  const showContactToggle = currentStatus === "new_lead" || currentStatus === "contacted";
  const btnBase =
    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium justify-start transition-colors";

  return (
    <div
      className="rounded-xl border bg-white p-4 space-y-3 h-full shadow-sm"
      style={{ borderColor: "var(--admin-border)" }}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-slate-600" />
        <h3 className="text-sm font-semibold">Quick Actions</h3>
      </div>
      <div className="flex flex-col gap-2">
        {showContactToggle && (
          <Button
            size="sm"
            disabled={contactBusy}
            onClick={toggleContacted}
            className={`justify-start text-xs ${isContacted ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
          >
            <CheckCircle2 className="size-3.5 mr-1.5" />
            {contactBusy ? "Updating…" : isContacted ? "Contacted ✓ (undo)" : "Mark as Contacted"}
          </Button>
        )}
        <button
          type="button"
          disabled={!number}
          onClick={contactOnWhatsApp}
          className={`${btnBase} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <MessageCircle className="size-3.5" />
          Send Message on WhatsApp
        </button>
        <Button size="sm" variant="outline" onClick={() => setLogOpen(true)} className="justify-start text-xs">
          <Phone className="size-3.5 mr-1.5" />
          Add Customer Feedback
        </Button>
        <LogContactDialog leadId={lead.id} open={logOpen} onOpenChange={setLogOpen} />
        <FeedbackList leadId={lead.id} />

        <>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Payment Link
          </div>

          <button
            type="button"
            disabled={!number || linkBusy}
            onClick={sendPaymentLinkWhatsApp}
            className={`${btnBase} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <MessageCircle className="size-3.5" />
            {linkBusy && !paymentUrl ? "Preparing…" : "Send Payment Link via WhatsApp"}
          </button>
          <button
            type="button"
            disabled={!lead.email || linkBusy}
            onClick={sendPaymentLinkEmail}
            className={`${btnBase} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Mail className="size-3.5" />
            {linkBusy && !paymentUrl ? "Preparing…" : "Send Payment Link via Email"}
          </button>

          {paymentUrl ? (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border rounded px-2 py-1.5 min-w-0">
              <Link2 className="size-3 shrink-0" />
              <span className="truncate flex-1" title={paymentUrl}>
                {paymentUrl}
              </span>
              <CopyButton value={paymentUrl} label="" />
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={linkBusy}
              onClick={generateLink}
              className="justify-start text-xs"
            >
              <Link2 className="size-3.5 mr-1.5" />
              {linkBusy ? "Preparing…" : "Copy Payment Link"}
            </Button>
          )}
        </>
      </div>

      {!lead.email && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Add a customer email to enable email actions.
        </div>
      )}
      {!lead.mobile && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Add a mobile number to enable WhatsApp actions.
        </div>
      )}
    </div>
  );
}

/* ------------------- Feedback List (recent contact feedback) ------------------- */

const OUTCOME_LABEL: Record<string, string> = {
  connected: "Connected",
  no_answer: "No answer",
  wrong_number: "Wrong number",
  not_interested: "Not interested",
  callback: "Callback scheduled",
  converted_intent: "Ready to pay",
  sent: "Message sent",
};

const OUTCOME_TONE: Record<string, string> = {
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  callback: "bg-amber-50 text-amber-700 border-amber-200",
  converted_intent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  sent: "bg-sky-50 text-sky-700 border-sky-200",
  no_answer: "bg-slate-50 text-slate-700 border-slate-200",
  wrong_number: "bg-rose-50 text-rose-700 border-rose-200",
  not_interested: "bg-rose-50 text-rose-700 border-rose-200",
};

function FeedbackList({ leadId }: { leadId: string }) {
  const fn = useServerFn(listContactEvents);
  const { data, isLoading } = useQuery({
    queryKey: ["admin.lead-contact-events", leadId],
    queryFn: () => fn({ data: { leadId } }),
  });
  const rows = data?.rows ?? [];
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 3);

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          Recent Feedback {rows.length > 0 && <span className="text-slate-400">({rows.length})</span>}
        </div>
        {rows.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-indigo-600 hover:text-indigo-700"
          >
            {expanded ? "Show less" : `Show all`}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="text-[11px] text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-slate-400 italic">
          No feedback logged yet. Use “Add Customer Feedback” to record a call or note.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((r: any) => (
            <li key={r.id} className="rounded-md border border-slate-200 bg-slate-50/70 p-2 text-[11px]">
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="px-1.5 py-0.5 rounded border bg-white text-slate-700 capitalize text-[10px] font-medium">
                  {r.channel}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${OUTCOME_TONE[r.outcome] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}
                >
                  {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                </span>
                <span className="ml-auto text-slate-500 tabular-nums">{formatIST(r.created_at)}</span>
              </div>
              {r.notes && (
                <div className="mt-1 text-slate-700 whitespace-pre-wrap leading-snug">{r.notes}</div>
              )}
              <div className="mt-0.5 text-[10px] text-slate-400">by {r.staff_name}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function StatusControlPanel({ lead, currentStatus }: { lead: LeadShape; currentStatus: LeadStatusV2 }) {
  const qc = useQueryClient();
  const transitionFn = useServerFn(transitionLeadStatus);
  const allowed = getAllowedLeadTransitions(currentStatus);
  const [busy, setBusy] = useState(false);
  const [uninterestedOpen, setUninterestedOpen] = useState(false);
  const [reason, setReason] = useState("");

  const doTransition = async (to: LeadStatusV2, r?: string) => {
    setBusy(true);
    try {
      await transitionFn({ data: { leadId: lead.id, toStatus: to, reason: r } });
      toast.success(`Status → ${LEAD_STATUS_LABEL[to]}`);
      qc.invalidateQueries({ queryKey: ["admin.lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["admin.lead-events", lead.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Transition failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Current Status</div>
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-semibold ${LEAD_STATUS_BADGE[currentStatus]}`}
          >
            {LEAD_STATUS_LABEL[currentStatus]}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Lead {lead.lead_code} · {lead.name}
        </div>
      </div>

      {allowed.length === 0 ? (
        <div className="text-sm text-slate-500 italic">Terminal status — no further transitions.</div>
      ) : (
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-500">Change Status</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {allowed.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (s === "uninterested") setUninterestedOpen(true);
                  else doTransition(s);
                }}
                className="text-xs"
              >
                {busy && <Loader2 className="size-3 animate-spin mr-1" />}→ {LEAD_STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={uninterestedOpen}
        onOpenChange={(o) => {
          setUninterestedOpen(o);
          if (!o) setReason("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              Mark as Uninterested
            </DialogTitle>
            <DialogDescription>
              The customer will be emailed asking for a reason. Lead will auto-move to <b>Refund Requested</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">
              Why is the customer uninterested? <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer said the service is no longer needed because…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUninterestedOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                await doTransition("uninterested", reason.trim());
                setUninterestedOpen(false);
                setReason("");
              }}
            >
              {busy ? "Saving…" : "Confirm Uninterested"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------- Refund Decision Panel ------------------- */

function RefundDecisionPanel({ lead, currentStatus }: { lead: LeadShape; currentStatus: LeadStatusV2 }) {
  const qc = useQueryClient();
  const role = useRole();
  const approveFn = useServerFn(approveRefund);
  const processedFn = useServerFn(markRefundProcessed);
  const rejectFn = useServerFn(rejectRefund);
  const mayApprove = role.canApproveRefund();

  const [policyNote, setPolicyNote] = useState("");
  const [eligible, setEligible] = useState(false);
  const [gatewayRef, setGatewayRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin.lead", lead.id] });
    qc.invalidateQueries({ queryKey: ["admin.lead-events", lead.id] });
  };

  const onApprove = async () => {
    if (!confirm(`Approve refund for ${lead.name}?`)) return;
    setBusy(true);
    try {
      await approveFn({ data: { leadId: lead.id, policyNote: policyNote || undefined } });
      toast.success("Refund approved");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onProcessed = async () => {
    if (!gatewayRef.trim()) {
      toast.error("Gateway reference required");
      return;
    }
    if (!confirm("Confirm refund has been processed at the payment gateway?")) return;
    setBusy(true);
    try {
      await processedFn({ data: { leadId: lead.id, gatewayRef: gatewayRef.trim() } });
      toast.success("Refund processed. Documents will be deleted.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Reason required");
      return;
    }
    setBusy(true);
    try {
      await rejectFn({ data: { leadId: lead.id, reason: rejectReason.trim() } });
      toast.success("Refund rejected");
      setRejectOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-amber-50/50 p-5 space-y-3" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center gap-2">
        <Receipt className="size-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">Refund Decision</h3>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Customer's stated reason / staff policy note</Label>
        <Textarea
          value={policyNote}
          onChange={(e) => setPolicyNote(e.target.value)}
          placeholder="Refund policy note: e.g. eligible per 7-day window, customer never accessed onboarding…"
          rows={3}
          disabled={currentStatus === "refund_approved"}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={eligible}
          onChange={(e) => setEligible(e.target.checked)}
          disabled={currentStatus === "refund_approved"}
        />
        Customer is refund-eligible per policy
      </label>

      <div className="flex flex-wrap gap-2 pt-1">
        {currentStatus === "refund_requested" && mayApprove && (
          <>
            <Button onClick={onApprove} disabled={busy || !eligible} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="size-4 mr-1" /> Approve Refund
            </Button>
            <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
              <XCircle className="size-4 mr-1" /> Reject Refund
            </Button>
          </>
        )}
        {currentStatus === "refund_requested" && !mayApprove && (
          <div className="text-xs rounded-md bg-amber-100/70 border border-amber-200 text-amber-900 px-3 py-2">
            Only Manager, Admin, or Super Admin can approve or reject refunds.
          </div>
        )}
        {currentStatus === "refund_approved" && (
          <div className="w-full space-y-2">
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800">
              ✓ Refund approved. Process via the payment gateway, then enter the gateway reference below.
            </div>
            <div className="flex gap-2">
              <Input
                value={gatewayRef}
                onChange={(e) => setGatewayRef(e.target.value)}
                placeholder="Gateway reference number (e.g. PAYU_REF_XXXX)"
                className="flex-1"
              />
              <Button onClick={onProcessed} disabled={busy || gatewayRef.trim().length < 2}>
                <Trash2 className="size-4 mr-1" /> Mark Processed
              </Button>
            </div>
            <div className="text-[11px] rounded-md border border-rose-200 bg-rose-50 text-rose-800 px-2 py-1.5 font-medium">
              ⚠ Marking processed will PERMANENTLY DELETE all customer documents from storage (certificates excluded).
              This cannot be undone.
            </div>
          </div>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">
              Reason for rejection <span className="text-red-500">*</span>
            </Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onReject} disabled={busy}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------- Events Timeline ------------------- */

const eventBorder: Record<string, string> = {
  lead_status_change: "border-l-blue-400",
  payment_received: "border-l-emerald-400",
  refund_approved: "border-l-rose-400",
  refund_processed: "border-l-rose-400",
  refund_rejected: "border-l-rose-400",
  document_uploaded: "border-l-orange-400",
  documents_deleted: "border-l-orange-400",
  note_added: "border-l-slate-300",
  assignment_change: "border-l-violet-400",
  lead_created: "border-l-blue-300",
};

function EventsTimeline({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadEvents);
  const noteFn = useServerFn(addManualNote);
  const { data, isLoading } = useQuery({
    queryKey: ["admin.lead-events", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await noteFn({ data: { leadId, note: note.trim() } });
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin.lead-events", leadId] });
      toast.success("Note added");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso: string) => formatIST(iso);

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Internal Notes & Activity</h3>
        <span className="text-xs text-slate-500">{data?.events.length ?? 0} events</span>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (data?.events ?? []).length === 0 ? (
        <div className="text-sm text-slate-500 italic">No activity yet.</div>
      ) : (
        <ul className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
          {data!.events.map((e: any) => (
            <li
              key={e.id}
              className={`border border-l-4 rounded-md p-3 ${eventBorder[e.event_type] ?? "border-l-slate-300"} bg-slate-50`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <div>
                  <span className="font-semibold text-slate-700">{e.staff_name}</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] uppercase">
                    {e.staff_role}
                  </span>
                </div>
                <div>{fmt(e.created_at)}</div>
              </div>
              <div className="text-sm text-slate-800 mt-1">
                {e.event_type === "lead_status_change" && (
                  <>
                    Status: <b>{e.old_value ?? "—"}</b> → <b>{e.new_value}</b>
                  </>
                )}
                {e.event_type === "assignment_change" && <>Assignee changed</>}
                {e.event_type === "note_added" && <i>Internal note</i>}
                {!["lead_status_change", "assignment_change", "note_added"].includes(e.event_type) && (
                  <span className="capitalize">{e.event_type.replace(/_/g, " ")}</span>
                )}
              </div>
              {e.note && <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{e.note}</div>}
            </li>
          ))}
        </ul>
      )}

      <div className="pt-3 border-t space-y-2" style={{ borderColor: "var(--admin-border)" }}>
        <Label className="text-xs uppercase tracking-wider text-slate-500">Add Note</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add internal note for staff (e.g., 'Called customer, will call back tomorrow')"
          rows={2}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={busy || !note.trim()} onClick={submit}>
            {busy ? "Saving…" : "Add Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------- Follow-up Scheduler ------------------- */

function FollowUpScheduler({ leadId, staff }: { leadId: string; staff: Staff[] }) {
  const role = useRole();
  const canAssign = role.hasAny(["super_admin", "admin", "manager"]);
  const qc = useQueryClient();
  const createFn = useServerFn(createFollowUp);
  const listFn = useServerFn(listFollowUpsForLead);
  const { data } = useQuery({
    queryKey: ["admin.followups", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const [date, setDate] = useState<Date | undefined>(() => new Date());
  const [time, setTime] = useState<string>("10:00");
  const [reason, setReason] = useState<"call_back" | "documents_pending" | "refund_followup" | "general" | "other">("call_back");
  const [reasonNote, setReasonNote] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const scheduledAt = useMemo(() => {
    if (!date) return "";
    const [h, m] = time.split(":").map((n) => parseInt(n, 10) || 0);
    const dt = new Date(date);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  }, [date, time]);

  const timeOptions = useMemo(() => {
    const out: string[] = [];
    for (let h = 9; h <= 19; h++) {
      for (const m of [0, 15, 30, 45]) {
        out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return out;
  }, []);

  const submit = async () => {
    if (!scheduledAt) {
      toast.error("Pick a date & time");
      return;
    }
    setBusy(true);
    try {
      await createFn({ data: { leadId, scheduledAt, reason, reasonNote: reasonNote.trim() || undefined, assignedTo: assignedTo || null } });
      setDate(new Date());
      setTime("10:00");
      setReason("call_back");
      setReasonNote("");
      setAssignedTo("");
      qc.invalidateQueries({ queryKey: ["admin.followups", leadId] });
      qc.invalidateQueries({ queryKey: ["admin.lead", leadId] });
      toast.success("Follow-up scheduled");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const upcoming = (data?.rows ?? []).filter((r: any) => !r.is_completed);

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3 shadow-sm" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center gap-2">
        <CalendarIcon className="size-4 text-slate-600" />
        <h3 className="text-sm font-semibold">Schedule Follow-up</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Date</Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("w-full justify-start text-left font-normal text-xs", !date && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-1.5 size-3.5" />
                {date ? format(date, "dd/MM/yyyy") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setDateOpen(false);
                }}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Time (IST)</Label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border px-7 py-1.5 text-xs bg-white h-8 tabular-nums"
            >
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Reason</Label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as any)}
            className="w-full rounded-md border px-2 py-1.5 text-xs bg-white h-8"
          >
            <option value="call_back">Call Back</option>
            <option value="documents_pending">Documents Pending</option>
            <option value="refund_followup">Refund Follow-up</option>
            <option value="general">General</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1 sm:col-span-2 lg:col-span-4">
          <Label className="text-[11px] text-slate-500">
            Additional note (optional)
          </Label>
          <Input
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder={reason === "other" ? "Describe the reason…" : "Any extra context for this follow-up"}
            className="text-xs h-8"
            maxLength={500}
          />
        </div>



        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">{canAssign ? "Assign to" : "Action"}</Label>
          {canAssign ? (
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-xs bg-white h-8"
            >
              <option value="">Myself</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name || s.email}
                </option>
              ))}
            </select>
          ) : (
            <Button size="sm" className="w-full h-8" disabled={busy || !date} onClick={submit}>
              {busy ? "Saving…" : "Schedule"}
            </Button>
          )}
        </div>

        {canAssign && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Button size="sm" className="w-full" disabled={busy || !date} onClick={submit}>
              {busy ? "Saving…" : "Schedule Follow-up"}
            </Button>
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="pt-2 border-t" style={{ borderColor: "var(--admin-border)" }}>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Upcoming</div>
          <ul className="space-y-1">
            {upcoming.slice(0, 5).map((f: any) => (
              <li key={f.id} className="text-xs flex items-start gap-1.5">
                <Phone className="size-3 mt-0.5 text-slate-400" />
                <div>
                  <div className="font-medium">{formatIST(f.scheduled_at)}</div>
                  <div className="text-slate-500 capitalize">{f.reason.replace(/_/g, " ")}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------- Linked Order Panel ------------------- */

function LinkedOrderPanel({ applications, hideMoney = false }: { applications: any[]; hideMoney?: boolean }) {
  if (!applications || applications.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--admin-border)" }}>
        <div className="text-sm font-semibold mb-1">Linked Order</div>
        <div className="text-xs text-slate-500 italic">No order linked yet.</div>
      </div>
    );
  }
  const app = applications[0];
  return (
    <div className="rounded-lg border bg-white p-4 space-y-2" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-slate-600" />
        <h3 className="text-sm font-semibold">Linked Order</h3>
      </div>
      <div className="text-xs space-y-1.5">
        <Row k="Order #" v={<span className="font-mono">{app.application_code}</span>} />
        <Row
          k="Fulfillment"
          v={
            <Badge variant="secondary" className="text-[10px]">
              {(app.fulfillment_status ?? app.application_status ?? "—").replace(/_/g, " ")}
            </Badge>
          }
        />
        {!hideMoney && <Row k="Total" v={`₹${Number(app.total_amount ?? 0).toLocaleString("en-IN")}`} />}
        <a href={`/admin/applications/${app.id}`} className="block text-xs text-blue-600 hover:underline pt-1">
          Open order →
        </a>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{k}</span>
      <span className="text-slate-800 text-right">{v}</span>
    </div>
  );
}

/* ------------------- Documents Panel ------------------- */

function DocumentsPanel({ applications }: { applications: any[] }) {
  const app = applications?.[0];
  const deleted = app?.documents_deleted_at;
  return (
    <div className="rounded-lg border bg-white p-4 space-y-2" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center gap-2">
        <FileWarning className="size-4 text-slate-600" />
        <h3 className="text-sm font-semibold">Documents</h3>
      </div>
      {!app ? (
        <div className="text-xs text-slate-500 italic">No order yet.</div>
      ) : deleted ? (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-xs text-rose-800">
          Documents deleted on <b>{formatIST(deleted)}</b>
          {app.documents_deleted_reason ? (
            <>
              {" "}
              — reason: <b>{app.documents_deleted_reason}</b>
            </>
          ) : null}
          .
        </div>
      ) : (
        <a href={`/admin/applications/${app.id}`} className="block text-xs text-blue-600 hover:underline">
          View documents in order →
        </a>
      )}
    </div>
  );
}
