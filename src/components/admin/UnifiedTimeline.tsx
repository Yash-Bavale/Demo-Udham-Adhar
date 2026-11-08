import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, CreditCard, FileText, Mail, MessageSquare, GitCommit, Upload, FileCheck2, UserCog,
  Cog, AlarmClock, PhoneCall,
} from "lucide-react";
import { formatIST } from "@/lib/datetime";
import { useOrderWorkflow } from "@/hooks/useOrderWorkflow";
import { STAGE_LABEL, TIMER_LABEL, AUTO_LABEL } from "@/lib/workflow/engine-view";

interface Props {
  events: any[];
  payments: any[];
  documents: any[];
  emailLogs?: any[];
  createdAt: string;
  hideMoney?: boolean;
  /** When provided, merges workflow_events (engine) into the timeline. */
  applicationId?: string;
}

export interface ButtonActionTagProps {
  code?: string | null;
  label: string;
  variant?: "emerald" | "violet" | "sky" | "amber" | "rose" | "indigo" | "blue" | "slate";
}

function ButtonActionTag({ code, label, variant = "blue" }: ButtonActionTagProps) {
  const variantStyles: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    violet: "bg-purple-50 text-purple-700 border-purple-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };
  const cls = variantStyles[variant] || variantStyles.blue;
  return (
    <span className={`inline-flex items-center gap-1 font-sans text-[10.5px] font-semibold px-2 py-0.5 rounded-md border shadow-2xs ${cls}`}>
      {code ? (
        <>
          <span className="font-mono font-bold tracking-tight">{code}</span>
          <span className="opacity-40">·</span>
          <span>{label}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}

function resolveEventButtonTag(e: any): ButtonActionTagProps | null {
  const et = String(e.event_type || "").toLowerCase();
  const nv = String(e.new_value || "").toLowerCase();
  const note = String(e.note || e.remarks || "").toLowerCase();

  // B07 - App Accepted / Application Accepted / Completed
  if (
    et === "application_completed" ||
    et === "complete_with_cert" ||
    nv === "order_completed" ||
    nv === "completed" ||
    note.includes("application accepted")
  ) {
    return { code: "B07", label: "App Accepted", variant: "emerald" };
  }

  // B06 - Consultation Done
  if (
    et === "consultation_completed" ||
    et === "consultation_done" ||
    nv === "consultation_completed" ||
    note.includes("consultation done") ||
    note.includes("consultation completed")
  ) {
    return { code: "B06", label: "Consultation Done", variant: "violet" };
  }

  // B05 - Submitted to Govt
  if (
    et === "submitted_to_govt" ||
    et === "application_submitted" ||
    nv === "submitted_to_govt" ||
    nv === "application_submitted" ||
    note.includes("submitted to govt")
  ) {
    return { code: "B05", label: "Submitted to Govt", variant: "violet" };
  }

  // B08 - App Rejected / Govt Rejected
  if (
    et === "govt_rejected" ||
    et === "application_rejected" ||
    nv === "application_rejected" ||
    note.includes("application rejected") ||
    note.includes("govt rejected")
  ) {
    return { code: "B08", label: "App Rejected", variant: "rose" };
  }

  // B02 - Technical Delay
  if (
    et === "technical_delay" ||
    et === "technical_hold" ||
    nv === "technical_delay" ||
    nv === "technical_hold" ||
    (note.includes("technical delay") && !note.includes("resolved"))
  ) {
    return { code: "B02", label: "Technical Delay", variant: "sky" };
  }

  // B03 - Issue Resolved
  if (
    et === "technical_delay_resumed" ||
    et === "resume_technical_delay" ||
    et === "issue_resolved" ||
    note.includes("issue resolved") ||
    note.includes("technical delay resolved")
  ) {
    return { code: "B03", label: "Issue Resolved", variant: "emerald" };
  }

  // B04 - Customer Delay / Resume
  if (et === "customer_delay_resumed" || et === "resume_customer_delay" || note.includes("customer responded")) {
    return { code: "B04", label: "Resume Order", variant: "emerald" };
  }
  if (
    et === "customer_delay" ||
    et === "customer_hold" ||
    nv === "customer_delay" ||
    nv === "customer_hold" ||
    note.includes("customer delay")
  ) {
    return { code: "B04", label: "Customer Delay", variant: "amber" };
  }

  // B01 - Form Not Submitted
  if (
    et === "form_not_submitted" ||
    et === "form_link_sent" ||
    note.includes("form link sent") ||
    note.includes("form not submitted")
  ) {
    return { code: "B01", label: "Form Not Submitted Delay", variant: "amber" };
  }

  // B09 - Reopen Order
  if (et === "order_reopened" || nv === "order_reopened" || note.includes("order reopened")) {
    return { code: "B09", label: "Reopen Order", variant: "indigo" };
  }

  // B10 - Order Closed / Force Close
  if (et === "order_closed" || et === "workflow_closed" || nv === "order_closed" || nv === "closed" || note.includes("order closed")) {
    return { code: "B10", label: "Force Close", variant: "rose" };
  }

  // Callbacks & Tasks
  if (et === "callback_completed") {
    return { label: "Callback Completed", variant: "emerald" };
  }
  if (et === "callback_scheduled" || et === "callback_rescheduled") {
    return { label: "Add Task / Follow-up", variant: "violet" };
  }

  // Service & Refund
  if (et === "service_changed" || note.includes("service changed")) {
    return { label: "Change Service", variant: "blue" };
  }
  if (et === "refund_rejected" || note.includes("refund rejected")) {
    return { label: "Refund Rejected (R002)", variant: "rose" };
  }
  if (et === "refund_approved" || et === "refund_processed" || note.includes("refund approved")) {
    return { label: "Refund Approved", variant: "slate" };
  }
  if (et.includes("refund")) {
    return { label: "Refund", variant: "rose" };
  }

  // Documents / Certs
  if (et === "certificate_uploaded" || note.includes("certificate uploaded")) {
    return { label: "Upload Certificate", variant: "emerald" };
  }
  if (et === "document_uploaded" || note.includes("document uploaded")) {
    return { label: "Upload Document", variant: "violet" };
  }

  return null;
}

function resolveEmailButtonTag(templateCode?: string | null): ButtonActionTagProps | null {
  if (!templateCode) return null;
  const tc = templateCode.toUpperCase();
  if (tc === "E007" || tc === "BHS_E007") return { code: "B07", label: "App Accepted", variant: "emerald" };
  if (tc === "E006" || tc === "BHS_E006") return { code: "B05", label: "Submitted to Govt", variant: "violet" };
  if (tc === "E005" || tc === "BHS_E005") return { code: "B06", label: "Consultation Done", variant: "violet" };
  if (tc === "E003" || tc === "BHS_E003") return { code: "B02", label: "Technical Delay", variant: "sky" };
  if (tc === "E004" || tc === "BHS_E004") return { code: "B04", label: "Customer Delay", variant: "amber" };
  if (tc === "E002" || tc === "BHS_E002") return { code: "B01", label: "Form Not Submitted Delay", variant: "amber" };
  if (tc === "E011" || tc === "BHS_E011") return { code: "B03", label: "Issue Resolved", variant: "emerald" };
  if (tc === "E008" || tc === "BHS_E008") return { code: "B08", label: "App Rejected", variant: "rose" };
  if (tc === "E009" || tc === "E09" || tc === "BHS_E009") return { code: "B09", label: "Reopen Order", variant: "indigo" };
  if (tc === "E010" || tc === "BHS_E010") return { code: "B10", label: "Force Close", variant: "rose" };
  if (tc === "R002" || tc === "BHS_R002") return { label: "Refund Rejected (R002)", variant: "rose" };
  if (tc === "E012" || tc === "BHS_E012") return { label: "Change Service", variant: "blue" };
  if (tc === "E013" || tc === "BHS_E013") return { label: "Payment Received", variant: "emerald" };
  if (tc === "R001" || tc === "BHS_R001") return { label: "Refund Approved", variant: "slate" };
  return null;
}

function resolveWorkflowButtonTag(w: any): ButtonActionTagProps | null {
  const type = String(w.event_type ?? "");
  if (type === "callback_scheduled") return { label: "Add Task / Follow-up", variant: "violet" };
  if (type === "GovApproved" || type === "CertificateUploaded") return { code: "B07", label: "App Accepted", variant: "emerald" };
  if (type === "GovRejected") return { code: "B08", label: "App Rejected", variant: "rose" };
  if (type === "OrderClosed") return { code: "B10", label: "Force Close", variant: "rose" };
  if (type === "TechnicalDelay") return { code: "B02", label: "Technical Delay", variant: "sky" };
  if (type === "CustomerDelay") return { code: "B04", label: "Customer Delay", variant: "amber" };
  return null;
}

type Item = {
  id: string;
  ts: string;
  icon: typeof Activity;
  tone: "blue" | "emerald" | "violet" | "amber" | "slate" | "rose";
  title: React.ReactNode;
  detail?: React.ReactNode;
  actor?: string | null;
  buttonTag?: ButtonActionTagProps | null;
};

const TONE: Record<Item["tone"], { ring: string; bg: string; fg: string }> = {
  blue:    { ring: "#bfdbfe", bg: "#eff6ff", fg: "#1d4ed8" },
  emerald: { ring: "#a7f3d0", bg: "#ecfdf5", fg: "#047857" },
  violet:  { ring: "#ddd6fe", bg: "#f5f3ff", fg: "#6d28d9" },
  amber:   { ring: "#fde68a", bg: "#fffbeb", fg: "#b45309" },
  slate:   { ring: "#e2e8f0", bg: "#f8fafc", fg: "#475569" },
  rose:    { ring: "#fecaca", bg: "#fff1f2", fg: "#be123c" },
};

function stripReply(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/^\s*(re|fwd|fw)\s*:\s*/i, "");
}

export function UnifiedTimeline({ events, payments, documents, emailLogs, createdAt, hideMoney, applicationId }: Props) {
  const [showAll, setShowAll] = useState(false);
  const wf = useOrderWorkflow(applicationId ?? null);
  const workflowEvents = applicationId ? wf.events : [];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const assigneeIds = Array.from(new Set(
    (events ?? []).filter((e: any) => e.event_type === "assignment_change")
      .flatMap((e: any) => [e.old_value, e.new_value])
      .filter((v: any) => typeof v === "string" && UUID_RE.test(v)),
  )).sort() as string[];
  const { data: staffNames } = useQuery({
    queryKey: ["timeline-staff-names", assigneeIds],
    enabled: assigneeIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, display_name, email").in("id", assigneeIds);
      const m: Record<string, string> = {};
      for (const p of data ?? []) m[p.id] = (p as any).display_name || p.full_name || p.email || p.id;
      return m;
    },
  });
  const nameOf = (v: string | null | undefined) => (v ? staffNames?.[v] ?? v : "Unassigned");

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];

    out.push({
      id: `created-${createdAt}`,
      ts: createdAt,
      icon: GitCommit,
      tone: "blue",
      title: "Order created",
    });

    for (const p of payments ?? []) {
      const amt = Number(p.amount || 0);
      const isRefund = amt < 0 || p.status === "refunded";
      const amountStr = hideMoney ? "₹••••" : `₹${Math.abs(amt).toLocaleString("en-IN")}`;
      out.push({
        id: `pay-${p.id}`,
        ts: p.payment_date || p.created_at,
        icon: CreditCard,
        tone: isRefund ? "rose" : "emerald",
        title: isRefund ? "Refund processed" : "Payment received",
        detail: `${amountStr} · ${p.gateway_name ?? "—"} · ${String(p.status).replace(/_/g, " ")}`,
        buttonTag: isRefund
          ? { label: "Refund", variant: "rose" }
          : { label: "Payment Paid", variant: "emerald" },
      });
    }

    for (const d of documents ?? []) {
      const isCert = d.doc_type === "certificate";
      out.push({
        id: `doc-${d.id}`,
        ts: d.uploaded_at || d.created_at,
        icon: isCert ? FileCheck2 : Upload,
        tone: isCert ? "emerald" : "violet",
        title: isCert ? "Certificate uploaded" : "Document uploaded",
        detail: `${d.doc_type?.replace(/_/g, " ")} · ${d.file_name}`,
        buttonTag: isCert
          ? { label: "Upload Certificate", variant: "emerald" }
          : { label: "Upload Document", variant: "violet" },
      });
    }

    // Every email send/failure — surfaced from email_logs so the audit trail
    // shows the actual template + subject + status, not just "Email sent".
    const emailEventIds = new Set<string>();
    for (const l of emailLogs ?? []) {
      const status = String(l.status ?? "").toLowerCase();
      const failed = ["failed", "bounced", "dlq"].includes(status);
      const tone: Item["tone"] = failed ? "rose" : status === "sent" ? "blue" : "amber";
      const label = failed ? "Email failed" : status === "sent" ? "Email sent" : `Email ${status || "queued"}`;
      out.push({
        id: `mail-${l.id}`,
        ts: l.sent_at || l.created_at,
        icon: Mail,
        tone,
        title: (
          <>
            {label}
            {l.template_code && (
              <span className="ml-1.5 font-mono text-[10.5px] px-1 py-0.5 rounded bg-slate-100 text-slate-600">
                {l.template_code}
              </span>
            )}
            {!l.template_code && (
              <span className="ml-1.5 font-mono text-[10.5px] px-1 py-0.5 rounded bg-rose-50 text-rose-700">
                NO_TEMPLATE
              </span>
            )}
            {l.template_exists === false && (
              <span className="ml-1.5 text-[10.5px] px-1 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                unmatched
              </span>
            )}
          </>
        ),
        detail: (
          <div className="space-y-0.5">
            <div className="text-slate-700">{stripReply(l.subject) || "(no subject)"}</div>
            {l.to_email && <div className="text-[11px] text-slate-500">To {l.to_email}</div>}
            {failed && l.error_message && (
              <div className="text-[11px] text-rose-600">Error: {String(l.error_message).slice(0, 200)}</div>
            )}
          </div>
        ),
        buttonTag: resolveEmailButtonTag(l.template_code),
      });
    }

    for (const e of events ?? []) {
      let icon: typeof Activity = Activity;
      let tone: Item["tone"] = "slate";
      let title: React.ReactNode = String(e.event_type).replace(/_/g, " ");
      let detail: React.ReactNode = null;

      if (e.event_type === "status_change") {
        icon = GitCommit;
        tone = "blue";
        title = (
          <>
            Status changed <span className="opacity-60">·</span>{" "}
            <span className="font-mono text-[11px] opacity-80">{e.old_value ?? "—"}</span>
            {" → "}
            <span className="font-mono text-[11px]">{e.new_value}</span>
          </>
        );
      } else if (e.event_type === "assignment_change") {
        icon = UserCog; tone = "violet"; title = "Assignee updated";
        detail = e.old_value || e.new_value
          ? <span className="text-[11px]">{nameOf(e.old_value)} → {nameOf(e.new_value)}</span>
          : null;
      } else if (e.event_type === "note_added") {
        icon = MessageSquare; tone = "amber"; title = "Internal note";
        detail = <span className="whitespace-pre-wrap">{e.note}</span>;
      } else if (e.event_type === "email_sent") {
        // Deduped — the email_logs loop above already added a rich entry for this send.
        emailEventIds.add(String(e.id));
        continue;
      } else if (e.event_type === "document_uploaded") {
        icon = Upload; tone = "violet"; title = "Document uploaded";
      } else if (e.event_type === "certificate_uploaded") {
        icon = FileCheck2; tone = "emerald"; title = "Certificate uploaded";
      } else if (e.event_type === "application_completed" || e.event_type === "complete_with_cert") {
        icon = FileCheck2; tone = "emerald"; title = "Application completed";
      } else if (e.event_type === "form_submitted") {
        icon = FileText; tone = "emerald"; title = "Form submitted";
      } else if (e.event_type === "callback_scheduled") {
        icon = PhoneCall; tone = "violet"; title = "Callback scheduled";
        detail = <span className="whitespace-pre-wrap text-[11px] font-medium text-slate-700">{e.note}</span>;
      } else if (e.event_type === "callback_completed") {
        icon = PhoneCall; tone = "emerald"; title = "Callback completed";
        detail = <span className="whitespace-pre-wrap text-[11px] font-medium text-slate-700">{e.note}</span>;
      }

      if (e.note && !detail) detail = <span className="whitespace-pre-wrap text-[11px]">{e.note}</span>;

      out.push({
        id: `ev-${e.id}`,
        ts: e.created_at,
        icon,
        tone,
        title,
        detail,
        actor: e.staff_name ?? null,
        buttonTag: resolveEventButtonTag(e),
      });
    }

    // Workflow engine events — stage transitions, timers fired, automations, etc.
    for (const w of workflowEvents ?? []) {
      const type = String(w.event_type ?? "");
      let icon: typeof Activity = Cog;
      let tone: Item["tone"] = "violet";
      let title: React.ReactNode = w.title ?? type.replaceAll("_", " ");
      if (type === "callback_scheduled") {
        icon = PhoneCall; tone = "violet";
        title = w.title || "Callback scheduled";
      } else if (type === "FormTimeout5m" || type === "FormTimeout8h" || type === "ClosureTimerFired" || type === "ReminderFired") {
        icon = AlarmClock; tone = "amber";
        const kind = type === "ClosureTimerFired" ? "closure" : type === "ReminderFired" ? "reminder" : "incomplete_form";
        title = <>Timer fired · <span className="font-mono text-[11px]">{TIMER_LABEL[kind] ?? kind}</span></>;
      } else if (type === "email_sent" || type === "email_failed" || type === "email_skipped") {
        // Deduped by email_logs loop above.
        continue;
      } else if (type === "OrderClosed" || type === "GovApproved" || type === "GovRejected" || type === "CertificateUploaded") {
        icon = GitCommit; tone = type === "GovRejected" ? "rose" : "emerald";
      } else if ((w.metadata as any)?.event?.type) {
        const evtType = String((w.metadata as any).event.type);
        title = <>Workflow · <span className="font-mono text-[11px]">{evtType}</span></>;
      }
      out.push({
        id: `wf-${w.id}`,
        ts: w.created_at,
        icon,
        tone,
        title,
        detail: w.description ? <span className="whitespace-pre-wrap text-[11px]">{w.description}</span> : (
          (w.metadata as any)?.event?.type && w.title !== ((w.metadata as any).event.type)
            ? <span className="text-[11px] text-slate-500">{w.title}</span>
            : null
        ),
        actor: w.actor_name ?? (w.is_system ? "System" : null),
        buttonTag: resolveWorkflowButtonTag(w),
      });
    }

    out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    return out;
  }, [events, payments, documents, emailLogs, createdAt, hideMoney, workflowEvents, staffNames]);

  const visible = showAll ? items : items.slice(0, 12);

  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
          <h3 className="text-sm font-semibold">Timeline</h3>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
            style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}
          >
            {items.length}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-xs italic" style={{ color: "var(--admin-fg-muted)" }}>
          No activity yet.
        </div>
      ) : (
        <ol className="relative">
          <span
            aria-hidden
            className="absolute left-[14px] top-2 bottom-2 w-px"
            style={{ background: "var(--admin-border)" }}
          />
          {visible.map((it) => {
            const tone = TONE[it.tone];
            const Icon = it.icon;
            return (
              <li key={it.id} className="relative pl-9 pb-4 last:pb-0">
                <span
                  className="absolute left-0 top-0 size-[30px] rounded-full flex items-center justify-center border-2"
                  style={{ background: tone.bg, color: tone.fg, borderColor: tone.ring }}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="text-[13px] leading-snug flex items-center justify-between gap-2 flex-wrap font-medium" style={{ color: "var(--admin-fg)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{it.title}</span>
                    {it.buttonTag && (
                      <ButtonActionTag code={it.buttonTag.code} label={it.buttonTag.label} variant={it.buttonTag.variant} />
                    )}
                  </div>
                </div>
                {it.detail && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--admin-fg-muted)" }}>
                    {it.detail}
                  </div>
                )}
                <div className="text-[10.5px] mt-1" style={{ color: "var(--admin-fg-subtle)" }}>
                  {formatIST(it.ts)}
                  {it.actor && <> · by {it.actor}</>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {items.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs font-medium text-blue-600 hover:underline"
        >
          {showAll ? "Show less" : `Show ${items.length - 12} earlier events`}
        </button>
      )}
    </div>
  );
}
