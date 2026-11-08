import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Copy, Phone, Mail, User2,
  FileText, Activity, LifeBuoy, ExternalLink, BadgeDollarSign,
  ShieldAlert, ShieldOff, Clock, AlertTriangle, XCircle, CheckCircle2, RotateCcw,
  Link2, Send, Loader2, VolumeX, History, Flame,
} from "lucide-react";
import { OrderAssignmentHistoryTab } from "@/components/admin/workspace/OrderAssignmentHistoryTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { mintCustomerLink } from "@/lib/security/customer-access.functions";
import { cn } from "@/lib/utils";
import { CallButton } from "@/components/admin/telephony/CallButton";

import { CustomerJourneyMap } from "./CustomerJourneyMap";
import { ChangeServiceButton } from "./ChangeServiceDialog";


import { CustomerDelayDialog } from "@/components/admin/workspace/CustomerDelayDialog";
import { TechnicalDelayDialog } from "@/components/admin/workspace/TechnicalDelayDialog";
import { CloseOrderDialog } from "@/components/admin/CloseOrderDialog";
import { CompletionGateDialogStandalone } from "./CompletionGateDialogStandalone";

import {
  sendFormLink, markSubmittedToGovt, completeOrder, reopenOrder,
} from "@/lib/orders/order-actions.functions";
import { resumeFromHold, resumeFromCustomerDelay, resumeReopenedOrder } from "@/lib/orders/actions/hold-actions.functions";
import { handleGovtRejected } from "@/lib/orders/actions/close-actions.functions";
import { markConsultationCompleted } from "@/lib/orders/actions/consultation.functions";
import { listCloseReasons } from "@/lib/orders/actions/reasons.functions";
import { updateFulfillmentStatus, resendServiceChangeEmail, getOrderTimelineEvents, getOrderTickets } from "@/lib/crm/orders-v2.functions";
import { silentCloseOrder } from "@/lib/crm/workflow-closure.functions";

import {
  deriveJourneyLiveState, derivePhase, PHASE_ENABLED_BUTTONS,
  type ButtonCode, type JourneyPhase,
} from "@/lib/orders/journey-map";
import { FormSubmissionPanel } from "@/components/admin/FormSubmissionPanel";
import { OrderDocumentsPanel } from "@/components/admin/OrderDocumentsPanel";
import { OrderPaymentsPanel } from "@/components/admin/OrderPaymentsPanel";

import { UnifiedTimeline } from "@/components/admin/UnifiedTimeline";
import { ConvertConsultationPanel } from "@/components/admin/ConvertConsultationPanel";
import { LeadEmailsTab } from "@/components/admin/LeadEmailsTab";
import { AddTaskDialog } from "@/components/admin/AddTaskDialog";
import { RefundRequestDialog } from "@/components/admin/RefundRequestDialog";

import { STAGE_META, type OrderStage } from "@/lib/crm/computeOrderStage";
import type { FulfillmentStatus } from "@/lib/crm/fulfillment-transitions";
// Fulfillment mapping utilities still used by tab-scoped panels (not for the header pills).

import type { OrderStatus } from "@/lib/orders/order-status.functions";
import {
  QUICK_ACTIONS,
  tabAvailability,
  type WorkspaceTabId,
} from "@/lib/orders/order-actions-map";
import { formatIST, relativeIST } from "@/lib/datetime";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  orderId: string;
  data: any;
  hideAmount: boolean;
  staff: any[];
  onAssign: (id: string | null) => void;
  stage: OrderStage;
  timestamps: Partial<Record<OrderStage, string | null>>;
  showConsultationPanel: boolean;
  consultationMode: "select" | "awaiting_payment";
  canComplete: boolean;
  notesNode: React.ReactNode;
}

const TAB_DEFS = [
  { id: "form" as const, label: "Forms & Docs", icon: FileText, tooltip: "View the submitted service form and uploaded documents" },
  { id: "customer" as const, label: "Customer Details", icon: User2, tooltip: "View customer info, contact details and quick actions" },
  { id: "assignment" as const, label: "Assignment History", icon: History, tooltip: "View employee assignment transitions and history" },
  { id: "emails" as const, label: "Emails", icon: Mail, tooltip: "All emails sent or received for this order" },
  { id: "invoices" as const, label: "Invoices", icon: BadgeDollarSign, tooltip: "View, download, resend, or replace invoices for this order", moneyOnly: true },
  { id: "activity" as const, label: "Timeline / Activity Log", icon: Activity, tooltip: "Full chronological activity log for this order" },
  { id: "support" as const, label: "Internal Help / Support Ticket", icon: LifeBuoy, tooltip: "Raise or track internal tickets tied to this order" },
];

type TabId = WorkspaceTabId;

export function WorkspaceShell(p: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userPerms = usePermissions();
  const role = useRole();
  const isSuperAdmin =
    Boolean((p.data as any)?.isSuperAdmin) ||
    Boolean((p.data as any)?.isAdmin) ||
    role.hasAny(["super_admin", "admin", "superadmin", "super"]) ||
    Boolean(userPerms.perms?.isAdmin);
  const isAdmin = isSuperAdmin || role.hasAny(["super_admin", "admin"]);
  const hideForEmployee = p.hideAmount || role.hideMoney();
  const [tab, setTab] = useState<TabId>("form");
  const [refundOpen, setRefundOpen] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);
  const [dialog, setDialog] = useState<
    | null
    | { kind: "customer_delay" }
    | { kind: "technical_delay" }
    | { kind: "force_close" }
    | { kind: "silent_close" }
    | { kind: "govt_rejected" }
    | { kind: "complete_with_cert" }
  >(null);

  const { application, lead, customer, service, payments, paymentStatus, total, documents, events, emailLogs, stageMeta } = p.data;
  const timelineFn = useServerFn(getOrderTimelineEvents);
  const ticketsFn = useServerFn(getOrderTickets);

  const { data: timelineData } = useQuery({
    queryKey: ["admin.order.timeline", p.orderId],
    queryFn: () => timelineFn({ data: { orderId: p.orderId } }),
    enabled: tab === "activity",
    staleTime: 60_000,
  });

  const { data: ticketsData } = useQuery({
    queryKey: ["admin.order.tickets", p.orderId, application?.customer_id],
    queryFn: () => ticketsFn({ data: { orderId: p.orderId, customerId: application?.customer_id ?? null } }),
    enabled: tab === "support",
    staleTime: 60_000,
  });
  const govtPortalUrl: string | null = (service as any)?.govt_portal_url ?? null;
  const current = (application.fulfillment_status ?? "order_received") as FulfillmentStatus;
  const orderStatus = (application.order_status ?? null) as OrderStatus | null;
  const meta = STAGE_META[p.stage];
  const availability = tabAvailability(orderStatus, !!lead?.id, p.showConsultationPanel);

  const hasServiceChanged = useMemo(
    () => (events ?? []).some((e: any) => e?.event_type === "service_changed"),
    [events],
  );

  // Gating & Journey Phase State Logic
  const reminderCount = useMemo(
    () => (events ?? []).filter((e: any) => e?.type === "ReminderScheduled" || e?.type === "ReminderFired").length,
    [events],
  );

  const formLinkKey = `journey.b01Sent:${p.orderId}`;
  const [formLinkSent, setFormLinkSent] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(formLinkKey) === "1"; } catch { return false; }
  });

  const techResumeKey = `journey.b03Resumed:${p.orderId}`;
  const [techDelayResolved, setTechDelayResolved] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(techResumeKey) === "1"; } catch { return false; }
  });

  // Sync / clear local storage flags
  useEffect(() => {
    const live = deriveJourneyLiveState({
      stage: p.stage,
      workflowStatus: application.workflow_status,
      closureStage: application.closure_stage,
      closureReasonLabel: application.closure_reason_code,
    });
    const currentIdx = live.currentMainIndex;
    if (formLinkSent && live.activeSubKey !== "form-not-submitted") {
      try { window.localStorage.removeItem(formLinkKey); } catch { }
      setFormLinkSent(false);
    }
    if (techDelayResolved && (live.activeSubKey === "technical-delay" || currentIdx >= 4)) {
      try { window.localStorage.removeItem(techResumeKey); } catch { }
      setTechDelayResolved(false);
    }
  }, [p.stage, application.workflow_status, application.closure_stage, application.closure_reason_code, formLinkSent, techDelayResolved, p.orderId]);

  // Keep state variables in sync when window state is updated (since CustomerJourneyMap updates them too)
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        setFormLinkSent(window.localStorage.getItem(formLinkKey) === "1");
        setTechDelayResolved(window.localStorage.getItem(techResumeKey) === "1");
      } catch { }
    };
    window.addEventListener("storage", handleStorageChange);
    // Periodically sync just in case
    const interval = setInterval(handleStorageChange, 1000);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, [formLinkKey, techResumeKey]);

  const phase = useMemo(() => derivePhase({
    stage: p.stage,
    workflowStatus: application.workflow_status,
    closureStage: application.closure_stage,
    closureReasonLabel: application.closure_reason_code,
    reminderCount,
    formLinkSent,
    techDelayResolved,
    adminOverride,
  }), [p.stage, application.workflow_status, application.closure_stage, application.closure_reason_code, reminderCount, formLinkSent, techDelayResolved, adminOverride]);

  const live = useMemo(() => deriveJourneyLiveState({
    stage: p.stage,
    workflowStatus: application.workflow_status,
    closureStage: application.closure_stage,
    closureReasonLabel: application.closure_reason_code,
  }), [p.stage, application.workflow_status, application.closure_stage, application.closure_reason_code]);

  const closed = live.terminal === "closed";
  const completed = live.terminal === "completed";
  const enabledCodes = PHASE_ENABLED_BUTTONS[phase];

  const gate = (code: ButtonCode) => {
    if (code === "B07" || code === "B08") {
      return enabledCodes.includes(code);
    }
    return enabledCodes.includes(code) && !closed && !completed;
  };

  // If the active tab becomes unavailable (status changed), fall back to Forms & Docs.
  useEffect(() => {
    if (!availability[tab].enabled) setTab("form");
  }, [availability, tab]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin.order", p.orderId] });
    qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
    qc.invalidateQueries({ queryKey: ["order-workflow-state", p.orderId] });
    qc.invalidateQueries({ queryKey: ["order-tickets", p.orderId] });
    qc.invalidateQueries({ queryKey: ["workflow-timers", p.orderId] });
    qc.invalidateQueries({ queryKey: ["workflow-events", p.orderId] });
    qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
    qc.invalidateQueries({ queryKey: ["admin.lead.emails"] });
    qc.invalidateQueries({ queryKey: ["admin.order.timeline", p.orderId] });
  }, [qc, p.orderId]);

  const [sendingUpdateEmail, setSendingUpdateEmail] = useState(false);
  const fnFormLink = useServerFn(sendFormLink);
  const fnSubmit = useServerFn(markSubmittedToGovt);
  const fnComplete = useServerFn(completeOrder);
  const fnUpdateFF = useServerFn(updateFulfillmentStatus);
  const fnResume = useServerFn(resumeFromHold);
  const fnResumeCustomer = useServerFn(resumeFromCustomerDelay);
  const fnResumeReopened = useServerFn(resumeReopenedOrder);
  const fnReopen = useServerFn(reopenOrder);
  const fnConsultation = useServerFn(markConsultationCompleted);
  const fnResendServiceEmail = useServerFn(resendServiceChangeEmail);

  const mutResume = useMutation({
    mutationFn: () => fnResume({ data: { orderId: p.orderId, target: "IN_PROCESSING" } }),
    onSuccess: () => {
      toast.success("E011 sent — technical delay resolved, order resumed");
      try { window.localStorage.setItem(techResumeKey, "1"); } catch { }
      setTechDelayResolved(true);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutResumeCustomer = useMutation({
    mutationFn: () => fnResumeCustomer({ data: { orderId: p.orderId } }),
    onSuccess: () => {
      toast.success("Order resumed — moved to Form Submitted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutResumeReopened = useMutation({
    mutationFn: () => fnResumeReopened({ data: { orderId: p.orderId } }),
    onSuccess: (res: any) => {
      toast.success(`Order resumed — moved to ${res?.nextStage === "form_not_submitted" ? "Form Not Submitted Delay" : "Form Submitted"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutFormLink = useMutation({
    mutationFn: () => fnFormLink({ data: { orderId: p.orderId, transitionToWaiting: true } }),
    onSuccess: (r: any) => {
      toast.success(r?.emailQueued ? "E002 — Form link / incomplete-info mail sent" : "Order updated");
      try { window.localStorage.setItem(formLinkKey, "1"); } catch { }
      setFormLinkSent(true);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutSubmit = useMutation({
    mutationFn: () => fnSubmit({ data: { orderId: p.orderId } }),
    onSuccess: () => {
      toast.success("E005 sent — application marked submitted to govt");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutConsultation = useMutation({
    mutationFn: () => fnConsultation({ data: { orderId: p.orderId, remarks: null } }),
    onSuccess: (result) => {
      toast.success(result.emailQueued
        ? "S08 · Consultation Completed — E005 sent"
        : "S08 · Consultation Completed — no email found");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutReopen = useMutation({
    mutationFn: () => fnReopen({ data: { orderId: p.orderId } }),
    onSuccess: () => {
      toast.success("Order reopened successfully — active in Hot Orders");
      invalidate();
      qc.invalidateQueries({ queryKey: ["admin.order", p.orderId] });
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["order-workflow-state", p.orderId] });
      qc.invalidateQueries({ queryKey: ["order-tickets", p.orderId] });
      qc.invalidateQueries({ queryKey: ["workflow-events", p.orderId] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Prefer lead values — that's what THIS order was created with and where
  // its emails actually go. Customer row may be a shared/older dedup record.
  const cName = lead?.name ?? customer?.name ?? "—";
  const cMobile = lead?.mobile ?? customer?.primary_mobile ?? null;
  const cEmail = lead?.email ?? customer?.primary_email ?? null;
  const cLanguage = lead?.language ?? "—";
  const cState = lead?.state ?? "—";
  const cSource = lead?.lead_source ?? "—";
  const cLeadCode = lead?.lead_code ?? "—";
  const svcName = service?.service_name ?? lead?.service ?? "—";

  const waPhone = cMobile ? String(cMobile).replace(/\D/g, "") : "";
  const waUrl = waPhone
    ? `https://wa.me/${waPhone.length === 10 ? "91" + waPhone : waPhone}?text=${encodeURIComponent(
      `Hi ${cName}, this is regarding your ${svcName} application (${application.application_code}).`,
    )}`
    : null;

  const paidAmt = (payments ?? [])
    .filter((x: any) => x?.status === "success" || x?.status === "captured" || x?.status === "paid")
    .reduce((s: number, x: any) => s + Number(x?.amount ?? 0), 0);
  const dueAmt = Math.max(0, Number(total ?? 0) - paidAmt);

  const assignedName =
    p.staff.find((s: any) => s.id === application.assigned_to)?.display_name
    ?? p.staff.find((s: any) => s.id === application.assigned_to)?.email
    ?? (p.data as any)?.assignedStaff?.display_name
    ?? (p.data as any)?.assignedStaff?.full_name
    ?? (p.data as any)?.assignedStaff?.email
    ?? "Unassigned";

  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };

  /**
   * Central handler for every header quick tile. Always fires a toast so
   * employees get instant feedback, disabled tiles show WHY they're disabled,
   * and system actions (print / copy) confirm success.
   */
  const runQuickAction = useCallback(
    (
      key: string,
      built: { disabledReason?: string | null; toastInfo?: string; toastSuccess?: string },
      exec: () => void,
    ) => {
      if (built.disabledReason) {
        toast.error(built.disabledReason);
        return;
      }
      if (built.toastInfo) toast(built.toastInfo);
      exec();
      if (built.toastSuccess) toast.success(built.toastSuccess);
    },
    [],
  );

  const quickCtx = {
    mobile: cMobile,
    email: cEmail,
    leadId: lead?.id ?? null,
    waUrl,
    applicationCode: application.application_code,
  };

  const paymentPillCls =
    paymentStatus === "Paid" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
      paymentStatus === "Refunded" || paymentStatus === "Failed" ? "bg-rose-50 text-rose-700 ring-rose-200" :
        "bg-amber-50 text-amber-800 ring-amber-200";

  const statusPillCls =
    meta.side === "exception" ? "bg-rose-50 text-rose-700 ring-rose-200" :
      meta.tone === "emerald" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
        meta.tone === "violet" ? "bg-violet-50 text-violet-700 ring-violet-200" :
          meta.tone === "amber" ? "bg-amber-50 text-amber-800 ring-amber-200" :
            "bg-sky-50 text-sky-700 ring-sky-200";

  const customerDetailsCard = (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
      {/* Meta grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <HeaderMeta label="Order No.">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[15px] font-extrabold text-slate-900 tracking-tight">
              {application.application_code}
            </span>
            <button onClick={() => copy(application.application_code)} className="text-slate-400 hover:text-indigo-600">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </HeaderMeta>
        <HeaderMeta label="Payment Status">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${paymentPillCls}`}>
            {paymentStatus}
          </span>
        </HeaderMeta>
        <HeaderMeta label="Current Stage">
          {/* Single source of truth — computeOrderStage → STAGE_META */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${statusPillCls}`}>
            {meta.label}
          </span>
        </HeaderMeta>

        <HeaderMeta label="Order Created">
          <div className="text-sm text-slate-800">
            {formatIST(application.created_at)}
            <span className="ml-2 text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
              {relativeIST(application.created_at)}
            </span>
          </div>
        </HeaderMeta>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-6">
        {/* Customer fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 min-w-0">
          <InfoRow icon={<User2 className="w-3.5 h-3.5" />} label="Customer Name" value={cName} />
          <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Mobile Number" value={cMobile ? (
            <span className="flex flex-wrap items-center gap-2">
              <a href={`tel:${cMobile}`} className="font-mono hover:text-indigo-700">{cMobile}</a>
              <CallButton mobile={cMobile} applicationId={p.orderId} leadId={application.lead_id ?? null} customerId={application.customer_id ?? null} compact />
            </span>
          ) : "—"} />
          <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="Email ID" value={cEmail ? <span className="truncate block">{cEmail}</span> : "—"} />
          <InfoRow label="State" value={cState} />
          <InfoRow label="Language" value={cLanguage} />
          {!hideForEmployee && <InfoRow label="Source" value={cSource} />}
          <InfoRow label="Selected Service" value={svcName} />
          <InfoRow label="Lead Code" value={<span className="font-mono">{cLeadCode}</span>} />
          <InfoRow
            label="Assigned To"
            value={
              <select
                value={application.assigned_to ?? ""}
                onChange={(e) => p.onAssign(e.target.value || null)}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Unassigned</option>
                {application.assigned_to && !p.staff.some((s: any) => s.id === application.assigned_to) && (
                  <option value={application.assigned_to}>
                    {(p.data as any)?.assignedStaff?.display_name || (p.data as any)?.assignedStaff?.full_name || (p.data as any)?.assignedStaff?.email || "Archived Staff"} (Archived)
                  </option>
                )}
                {(Array.isArray(p.staff) ? p.staff : []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.display_name || s.full_name || s.name || s.email}</option>
                ))}
              </select>
            }
          />
        </div>

        {/* Unified action area — every tile is map-driven and always toasts. Visually attached to header (no border). */}
        <div className="pl-4 lg:border-l lg:border-slate-100 h-fit min-w-[300px]">
          <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-slate-500 mb-2">Quick Actions</div>
          <div className="grid grid-cols-6 gap-1.5">
            {QUICK_ACTIONS.map((spec) => {
              const built = spec.build(quickCtx);
              const disabled = !!built.disabledReason;
              const onClick = () => {
                if (spec.key === "print") {
                  runQuickAction(spec.key, built, () => window.print());
                } else {
                  // Contact / link tiles: navigate manually so we can toast first.
                  runQuickAction(spec.key, built, () => {
                    if (built.to) {
                      window.location.assign(built.to);
                    } else if (built.href) {
                      if (built.external) {
                        window.open(built.href, "_blank", "noopener,noreferrer");
                      } else {
                        window.location.assign(built.href);
                      }
                    }
                  });
                }
              };
              return (
                <Tooltip key={spec.key}>
                  <TooltipTrigger asChild>
                    <span>
                      <QuickTile
                        icon={spec.icon}
                        label={spec.label}
                        tint={spec.tint}
                        disabled={disabled}
                        onClick={onClick}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{built.disabledReason ?? spec.tooltip}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 pb-10 max-w-[1400px] mx-auto">
        {/* Top row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                navigate({ to: "/admin/orders" });
              }
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Orders
          </button>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={govtPortalUrl ?? undefined}
                  target={govtPortalUrl ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  onClick={(e) => { if (!govtPortalUrl) { e.preventDefault(); toast.error("No government portal URL set for this service"); } }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border ${govtPortalUrl ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Govt Portal
                </a>
              </TooltipTrigger>
              <TooltipContent>{govtPortalUrl ? "Open the government portal for this service in a new tab" : "No government portal URL configured for this service"}</TooltipContent>
            </Tooltip>
            {isAdmin && cLeadCode && cLeadCode !== "—" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { url: link } = await mintCustomerLink({ data: { leadCode: cLeadCode, kind: "form" } });
                        await navigator.clipboard.writeText(link);
                        toast.success(`Form link copied for ${cLeadCode}!`);
                      } catch {
                        toast.error("Failed to copy form link");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-indigo-600" /> Copy Form Link
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy customer form link ({cLeadCode}) to clipboard</TooltipContent>
              </Tooltip>
            )}
            {hasServiceChanged && cLeadCode && cLeadCode !== "—" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { url: link } = await mintCustomerLink({ data: { leadCode: cLeadCode, kind: "payment" } });
                        await navigator.clipboard.writeText(link);
                        toast.success(`Secure payment link copied for ${cLeadCode}!`);
                      } catch {
                        toast.error("Failed to copy payment link");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5 text-amber-700" /> Copy Payment Link
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy customer payment link ({cLeadCode}) to clipboard</TooltipContent>
              </Tooltip>
            )}
            <ChangeServiceButton
              orderId={p.orderId}
              currentServiceId={(service as any)?.id ?? null}
              currentServiceName={(service as any)?.service_name ?? "—"}
              fulfillmentStatus={String(current)}
              formSubmittedAt={application?.form_submitted_at ?? null}
            />
            {hasServiceChanged && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={sendingUpdateEmail}
                    onClick={async () => {
                      setSendingUpdateEmail(true);
                      try {
                        const r = await fnResendServiceEmail({ data: { orderId: p.orderId } });
                        toast.success(`Service update email resent to ${r.recipient}`);
                        invalidate();
                      } catch (e: any) {
                        toast.error(e?.message ?? "Failed to resend email");
                      } finally {
                        setSendingUpdateEmail(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 transition-colors"
                  >
                    {sendingUpdateEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-sky-700" />}
                    Resend Update Email
                  </button>
                </TooltipTrigger>
                <TooltipContent>Resend service update email & payment link to customer</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setRefundOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                >
                  <BadgeDollarSign className="w-3.5 h-3.5" /> Refund
                </button>
              </TooltipTrigger>
              <TooltipContent>Log a refund request received from the customer</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <AddTaskDialog defaultApplicationId={p.orderId} defaultLeadId={application.lead_id ?? null} triggerLabel="Add Task / Follow-up" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Schedule a follow-up task for this order</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <RefundRequestDialog applicationId={p.orderId} open={refundOpen} onClose={() => setRefundOpen(false)} />


        {/* Support Ticket Escalation Banner */}
        {Boolean((p.data as any)?.ticketEscalation?.isEscalated) && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50/90 p-4 shadow-sm flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-xs shrink-0 mt-0.5">
                <Flame className="size-5 animate-pulse fill-white" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-xs uppercase tracking-wider text-rose-700 bg-rose-100/90 border border-rose-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <LifeBuoy className="size-3 text-rose-600" />
                    Support Ticket Escalation
                  </span>
                  {(p.data as any)?.ticketEscalation?.ticketNumber && (
                    <span className="font-mono font-bold text-xs text-rose-900 bg-white/80 border border-rose-200 px-2 py-0.5 rounded-md">
                      Ticket #{(p.data as any).ticketEscalation.ticketNumber}
                    </span>
                  )}
                  {(p.data as any)?.ticketEscalation?.ticketId && (
                    <Link
                      to="/admin/support/tickets/$ticketId"
                      params={{ ticketId: (p.data as any).ticketEscalation.ticketId }}
                      className="text-xs font-semibold text-rose-800 underline hover:text-rose-950 flex items-center gap-1"
                    >
                      <ExternalLink className="size-3" /> View Ticket
                    </Link>
                  )}
                </div>
                <p className="text-xs text-rose-900 font-medium">
                  This order was <strong>{(p.data as any)?.ticketEscalation?.isReopened ? "reopened" : "marked Hot Priority"}</strong> from the Support Ticket system.
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-rose-900">
                  <span className="bg-white/80 border border-rose-200 px-2 py-0.5 rounded-md">
                    1. Ticket created: {formatIST((p.data as any)?.ticketEscalation?.ticketCreatedAt)}
                  </span>
                  <span className="bg-white/80 border border-rose-200 px-2 py-0.5 rounded-md">
                    2. Order reopened: {formatIST((p.data as any)?.ticketEscalation?.ticketReopenedAt)}
                  </span>
                </div>
                {(p.data as any)?.ticketEscalation?.note && (
                  <div className="text-xs bg-white/95 border border-rose-200 rounded-lg p-2.5 text-slate-800 mt-1.5 leading-relaxed shadow-2xs">
                    <span className="font-bold text-rose-900 block text-[11px] mb-0.5">Instructions from Support:</span>
                    {(p.data as any).ticketEscalation.note}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Customer Details Card (above Customer Journey Map for superadmin only) */}
        {isSuperAdmin && customerDetailsCard}

        {/* ── SINGLE SOURCE OF TRUTH: Customer Journey Map ──────────── */}
        <CustomerJourneyMap
          applicationId={application.id}
          stage={p.stage}
          isConsultationOrder={p.showConsultationPanel || !!lead?.lead_code?.startsWith?.("TX")}
          serviceCode={(service as any)?.service_code ?? (service as any)?.code ?? lead?.service ?? null}
          workflowStatus={(application as any).workflow_status}
          closureStage={(application as any).closure_stage}
          closureNextAt={(application as any).closure_next_at}
          closureReasonLabel={
            (application as any).closure_reason_code ||
            (application as any).closure_reason_text ||
            (application as any).closure_remarks ||
            (application as any).order_close_reasons?.label ||
            (application as any).delay_reasons?.label ||
            (application as any).active_reason_id ||
            null
          }
          formSubmittedAt={(application as any).form_submitted_at}
          fulfillmentStatus={(application as any).fulfillment_status}
          payments={payments}
          hideAmount={p.hideAmount}
          adminOverride={adminOverride}
          onAdminOverrideChange={setAdminOverride}
        />





        {/* Dialog Overlays */}
        <CustomerDelayDialog
          applicationId={application.id}
          open={dialog?.kind === "customer_delay"}
          onClose={() => { setDialog(null); invalidate(); }}
        />
        <TechnicalDelayDialog
          applicationId={application.id}
          open={dialog?.kind === "technical_delay"}
          onClose={() => { setDialog(null); invalidate(); }}
        />
        <CloseOrderDialog
          applicationId={application.id}
          open={dialog?.kind === "force_close"}
          adminOverride={adminOverride}
          onClose={() => { setDialog(null); invalidate(); }}
        />
        {dialog?.kind === "silent_close" && (
          <SilentCloseInline
            applicationId={application.id}
            onClose={() => { setDialog(null); invalidate(); }}
          />
        )}
        {dialog?.kind === "govt_rejected" && (
          <GovtRejectedInline
            orderId={application.id}
            onClose={() => { setDialog(null); invalidate(); }}
          />
        )}
        <CompletionGateDialogStandalone
          open={dialog?.kind === "complete_with_cert"}
          onOpenChange={(v) => { if (!v) setDialog(null); }}
          orderId={application.id}
          busy={false}
          onConfirm={async (payload) => {
              await fnUpdateFF({
                data: {
                  orderId: application.id,
                  toStatus: "completed",
                  certificateDocumentId: payload.certificateDocumentId,
                  certificateNumber: payload.certificateNumber,
                  completionNotes: payload.completionNotes,
                  ccEmail: payload.ccEmail,
                  adminOverride: adminOverride || undefined,
                } as any,
              });
              toast.success("E007 sent — order completed with certificate");
              invalidate();
          }}
        />



        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="w-full">
          <TabsList className="w-full justify-start bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/90 h-auto gap-1.5 overflow-x-auto flex-nowrap shadow-inner">
            {TAB_DEFS
              .filter((t) => !(t as any).moneyOnly || !hideForEmployee)
              .filter((t) => !isSuperAdmin || t.id !== "customer")
              .map((t) => {
              const Icon = t.icon;
              const state = availability[t.id];
              const tip = !state.enabled && state.reason ? state.reason : t.tooltip;
              const trigger = (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  disabled={!state.enabled}
                  className="gap-2 px-4 py-2.5 rounded-xl border border-slate-200/60 bg-white/80 text-sm font-semibold text-slate-700 transition-all duration-150 hover:bg-white hover:text-indigo-900 hover:border-slate-300 hover:shadow-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:border-indigo-700 data-[state=active]:shadow-md data-[state=active]:font-bold disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{t.label}</span>
                </TabsTrigger>
              );
              return (
                <Tooltip key={t.id}>
                  <TooltipTrigger asChild><span>{trigger}</span></TooltipTrigger>
                  <TooltipContent>{tip}</TooltipContent>
                </Tooltip>
              );
            })}
          </TabsList>

          <div className="w-full mt-5 space-y-5">

            <TabsContent value="form" className="space-y-4 mt-0 animate-fade-in">
              {p.showConsultationPanel ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                  This is a <b>Talk-to-Expert</b> order. The service form appears here after the customer's service is picked and the second payment is received.
                </div>
              ) : (
                <FormSubmissionPanel applicationId={application.id} isLocked={current === "completed" || current === "cancelled"} orderId={p.orderId} />
              )}
              <OrderDocumentsPanel
                orderId={p.orderId}
                documents={documents}
                deletedAt={application.documents_deleted_at}
                deletedReason={application.documents_deleted_reason}
                hideMoney={p.hideAmount}
              />
            </TabsContent>

            {!isSuperAdmin && (
              <TabsContent value="customer" className="space-y-4 mt-0 animate-fade-in">
                {customerDetailsCard}
              </TabsContent>
            )}

            <TabsContent value="assignment" className="space-y-4 mt-0 animate-fade-in">
              <OrderAssignmentHistoryTab orderId={p.orderId} />
            </TabsContent>

            <TabsContent value="emails" className="space-y-4 mt-0 animate-fade-in">
              {lead?.id ? (
                <LeadEmailsTab leadId={lead.id} leadService={svcName} orderId={p.orderId} />
              ) : (
                <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500">No lead linked.</div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="space-y-4 mt-0 animate-fade-in">
              <UnifiedTimeline
                applicationId={application.id}
                events={timelineData?.events ?? events ?? []}
                emailLogs={timelineData?.emailLogs ?? emailLogs ?? []}
                payments={p.hideAmount ? [] : payments}
                documents={documents}
                createdAt={application.created_at}
                hideMoney={p.hideAmount}
              />
            </TabsContent>

            <TabsContent value="support" className="mt-0 animate-fade-in">
              <OrderTicketsPanel
                orderTickets={ticketsData?.orderTickets ?? p.data.orderTickets ?? []}
                customerTickets={ticketsData?.customerTickets ?? p.data.customerTickets ?? []}
              />
            </TabsContent>

            {!hideForEmployee && (
              <TabsContent value="invoices" className="space-y-4 mt-0 animate-fade-in">
                <OrderPaymentsPanel payments={payments ?? []} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ─── helpers ───

function HeaderMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-slate-500 mb-1.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-w-0 font-semibold text-slate-800 truncate">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}

function QuickTile({
  onClick, icon: Icon, label, tint, disabled = false,
}: {
  onClick?: () => void;
  icon: any; label: string; tint: "emerald" | "sky" | "violet" | "slate";
  disabled?: boolean;
}) {
  const tintMap = {
    emerald: "text-emerald-600 bg-emerald-50 hover:bg-emerald-100",
    sky: "text-sky-600 bg-sky-50 hover:bg-sky-100",
    violet: "text-violet-600 bg-violet-50 hover:bg-violet-100",
    slate: "text-slate-600 bg-slate-100 hover:bg-slate-200",
  };
  // Note: we do NOT disable the button — it stays clickable so runQuickAction can
  // fire the "why disabled" toast. Visual affordance is dimmed instead.
  const cls = `flex flex-col items-center px-1 py-1.5 rounded-lg transition cursor-pointer ${disabled ? "opacity-50" : ""}`;
  return (
    <button type="button" onClick={onClick} className={cls} aria-disabled={disabled}>
      <span className={`w-9 h-9 grid place-items-center rounded-lg ${tintMap[tint]}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="text-[11px] font-medium text-slate-600 mt-1">{label}</span>
    </button>
  );
}

// ─────────────────────────── Order Tickets Panel ───────────────────────────

const TICKET_STATUS_TINT: Record<string, string> = {
  open: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  waiting_customer: "bg-violet-50 text-violet-700 ring-violet-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
};
const TICKET_PRIORITY_TINT: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

function OrderTicketsPanel({ orderTickets, customerTickets }: { orderTickets: any[]; customerTickets: any[] }) {
  const openCount = orderTickets.filter((t) => ["open", "in_progress", "waiting_customer"].includes(t.status)).length;
  const closedCount = orderTickets.length - openCount;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Tickets for this order</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
              {orderTickets.length}
            </span>
            {openCount > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">
                {openCount} open
              </span>
            )}
            {closedCount > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                {closedCount} closed
              </span>
            )}
          </div>
        </header>
        {orderTickets.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            No support tickets on this order yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orderTickets.map((t) => <TicketRow key={t.id} t={t} />)}
          </ul>
        )}
      </section>

      {customerTickets.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <User2 className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Other tickets from this customer</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                {customerTickets.length}
              </span>
            </div>
          </header>
          <ul className="divide-y divide-slate-100">
            {customerTickets.map((t) => <TicketRow key={t.id} t={t} showOrderLink />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function TicketRow({ t, showOrderLink }: { t: any; showOrderLink?: boolean }) {
  const statusCls = TICKET_STATUS_TINT[t.status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  const prCls = TICKET_PRIORITY_TINT[t.priority] ?? "bg-slate-100 text-slate-600";
  return (
    <li>
      <Link
        to="/admin/tickets/$ticketId"
        params={{ ticketId: t.id }}
        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate-500">{t.ticket_number}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 uppercase font-semibold ${statusCls}`}>
              {t.status.replace(/_/g, " ")}
            </span>
            {t.priority && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${prCls}`}>
                {t.priority}
              </span>
            )}
            {showOrderLink && t.application_id && (
              <span className="text-[10px] text-slate-400">· other order</span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-slate-800 truncate">{t.subject}</div>
        </div>
        <div className="text-[11px] text-slate-400 whitespace-nowrap">
          {relativeIST(t.created_at)}
        </div>
      </Link>
    </li>
  );
}

function GovtRejectedInline({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [reasonText, setReasonText] = useState("");
  const fn = useServerFn(handleGovtRejected);
  const listReasons = useServerFn(listCloseReasons);
  const [busy, setBusy] = useState(false);

  const { data: reasons = [] } = useQuery({
    queryKey: ["close-reasons-all"],
    queryFn: () => listReasons(),
    staleTime: 60_000,
  });
  const catB = (reasons as any[]).filter((r) => r.category === "B");
  const [reasonId, setReasonId] = useState<string | null>(null);

  const submit = async () => {
    if (!reasonId) return toast.error("Pick a Category B reason");
    setBusy(true);
    try {
      await fn({ data: { orderId, reasonId, remarks: reasonText || null } });
      toast.success("E008 sent — order closed (rejected)");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-white p-5 shadow-xl space-y-3">
        <div className="font-bold text-slate-900">E008 — Application Rejected by Govt</div>
        <div className="text-xs text-slate-600">
          Sends E008 to the customer and force-closes this order (no resubmit loop).
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Reason (Category B)</label>
          <select
            value={reasonId ?? ""}
            onChange={(e) => setReasonId(e.target.value || null)}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">Select a reason…</option>
            {catB.map((r: any) => (
              <option key={r.id} value={r.id}>B{r.number} — {r.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Extra remarks (optional)</label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            rows={3}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={busy || !reasonId}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            Send E008 & Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline Silent Close (Admin Override) dialog ─── */

function SilentCloseInline({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const [reasonText, setReasonText] = useState("");
  const fnSilent = useServerFn(silentCloseOrder);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const submit = async () => {
    setBusy(true);
    try {
      await fnSilent({
        data: {
          applicationId,
          reasonCode: "ADMIN_SILENT_CLOSE",
          reasonLabel: "Silent Close (Admin Override)",
          notes: reasonText.trim() || undefined,
        },
      });
      toast.success("Order closed silently — no customer email sent");
      qc.invalidateQueries({ queryKey: ["admin.order", applicationId] });
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["order-workflow-state", applicationId] });
      qc.invalidateQueries({ queryKey: ["order-tickets", applicationId] });
      qc.invalidateQueries({ queryKey: ["workflow-timers", applicationId] });
      qc.invalidateQueries({ queryKey: ["workflow-events", applicationId] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Silent close failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 text-white p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <VolumeX className="size-4.5" />
          </div>
          <div>
            <div className="font-bold text-sm text-white">Silent Close Order (Admin Override)</div>
            <div className="text-xs text-slate-400">Close immediately without sending any customer email</div>
          </div>
        </div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300">
          ⚠️ <b>No Customer Email:</b> This will transition the order to Closed, cancel all active reminders and hot order alerts, and update the status without sending any emails or notifications to the customer.
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Internal Remarks / Reason (Optional)</label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="e.g. Offline resolved / test order / client requested silent closure"
            rows={3}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-500 transition disabled:opacity-50 shadow-md cursor-pointer"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <VolumeX className="size-3.5" />}
            Confirm Silent Close
          </button>
        </div>
      </div>
    </div>
  );
}


