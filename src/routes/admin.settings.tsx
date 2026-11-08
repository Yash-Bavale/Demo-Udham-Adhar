import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, ListChecks, Bell, CreditCard, Workflow, BookOpen, Zap, Mail, Clock, Timer, CalendarRange, Laptop } from "lucide-react";
import { SectionCard } from "@/components/admin/ui";
import { ReasonLibraryTab } from "@/components/admin/ReasonLibraryTab";
import { AutomationRulesTab } from "@/components/admin/AutomationRulesTab";
import { BusinessHoursTab } from "@/components/admin/BusinessHoursTab";
import { SUPPORT_EMAIL, COMPANY_NAME, SITE_NAME, BASE_URL } from "@/lib/brand";
import { ShiftsAndPresenceTab } from "@/components/admin/ShiftsAndPresenceTab";
import { ActiveSessionsTab } from "@/components/admin/ActiveSessionsTab";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: SettingsPage,
});

type Tab = "company" | "shifts" | "sessions" | "hours" | "callback_presets" | "statuses" | "notifications" | "gateways" | "workflow" | "reasons" | "automation" | "templates";

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "company", label: "Company Info", icon: Building2 },
  { id: "shifts", label: "Shifts & Presence", icon: CalendarRange },
  { id: "sessions", label: "Active Sessions", icon: Laptop },
  { id: "hours", label: "Business Hours", icon: Clock },
  { id: "callback_presets", label: "Callback Presets & Timers", icon: Timer },
  { id: "statuses", label: "Status Master", icon: ListChecks },
  { id: "templates", label: "Email Templates", icon: Mail },
  { id: "reasons", label: "Reason Library", icon: BookOpen },
  { id: "automation", label: "Automation Rules", icon: Zap },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "gateways", label: "Payment Gateways", icon: CreditCard },
  { id: "workflow", label: "Cancellation Flow", icon: Workflow },
];

const LEAD_STATUSES = [
  "New Lead", "Contacted", "Follow-up Required", "Payment Pending/Failed",
  "Payment Successful", "Welcome Mail Sent", "Documents Pending", "Under Process",
  "Closed", "Refund Requested", "Refund Status",
];
const ORDER_STATUSES = [
  "NEW LEAD", "PAYMENT RECEIVED", "WELCOME MAIL SENT", "EXPERT ASSIGNED",
  "INFORMATION COLLECTION", "DOCUMENTS PENDING", "DOCUMENTS VERIFIED", "PROCESSING",
  "COMPLAINT SUBMITTED", "WAITING AUTHORITY RESPONSE", "COMPLETED",
  "CUSTOMER DECLINED SERVICE", "CLOSURE NOTICE SENT", "CLOSED", "CANCELLED", "REFUNDED",
];
const COMPLAINT_STATUSES = ["Draft", "Submitted", "Under Review", "Awaiting Response", "Resolved", "Closed"];

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("company");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--admin-fg)" }}>Settings</h1>
        <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>Configure company info, shifts, sessions, statuses, and automation.</p>
      </div>

      <div className="flex gap-1 border-b flex-wrap" style={{ borderColor: "var(--admin-border)" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors"
              style={{
                borderColor: active ? "var(--admin-primary)" : "transparent",
                color: active ? "var(--admin-primary)" : "var(--admin-fg-muted)",
                fontWeight: active ? 500 : 400,
              }}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "company" && <CompanyTab />}
      {tab === "shifts" && <ShiftsAndPresenceTab />}
      {tab === "sessions" && <ActiveSessionsTab />}
      {tab === "hours" && <BusinessHoursTab />}
      {tab === "callback_presets" && <AppSettingsCard />}
      {tab === "statuses" && <StatusesTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "reasons" && <ReasonLibraryTab />}
      {tab === "automation" && <AutomationRulesTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "gateways" && <GatewaysTab />}
      {tab === "workflow" && <WorkflowTab />}
    </div>
  );
}

function CompanyTab() {
  return (
    <SectionCard title="Company Information">
      <div className="p-4 grid md:grid-cols-2 gap-4 text-sm">
        <Field label="Company Name" value={COMPANY_NAME} />
        <Field label="Brand" value={SITE_NAME} />
        <Field label="Support Email" value={SUPPORT_EMAIL} />
        <Field label="Website" value={BASE_URL.replace(/^https?:\/\//, "")} />
        <Field label="Address" value="—" />
        <Field label="GST Number" value="—" />
      </div>
      <div className="px-4 py-3 border-t text-xs" style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg-muted)" }}>
        Read-only display. Edit via your account manager.
      </div>
    </SectionCard>
  );
}

function TemplatesTab() {
  return (
    <SectionCard
      title="Email Templates"
      action={<Link to="/admin/email-templates" className="text-xs" style={{ color: "var(--admin-accent)" }}>Open template editor →</Link>}
    >
      <div className="p-4 text-sm space-y-2" style={{ color: "var(--admin-fg-muted)" }}>
        <p>
          All workflow emails (delay notices, 3 / 5 / 7-day follow-ups, no-response warnings, closure notice, refund decisions) are managed in the Email Templates editor.
        </p>
        <p className="text-xs">
          Variables available: <code className="font-mono">{"{{customer_name}}"}</code> <code className="font-mono">{"{{order_id}}"}</code> <code className="font-mono">{"{{service_name}}"}</code> <code className="font-mono">{"{{reason}}"}</code> <code className="font-mono">{"{{date}}"}</code> <code className="font-mono">{"{{company_name}}"}</code> <code className="font-mono">{"{{support_email}}"}</code>.
        </p>
      </div>
    </SectionCard>
  );
}

function StatusesTab() {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <StatusList title="Lead Statuses" items={LEAD_STATUSES} />
      <StatusList title="Order Statuses" items={ORDER_STATUSES} />
      <StatusList title="Complaint Statuses" items={COMPLAINT_STATUSES} />
    </div>
  );
}

function StatusList({ title, items }: { title: string; items: string[] }) {
  return (
    <SectionCard title={title}>
      <ul className="p-2 space-y-0.5 max-h-80 overflow-y-auto">
        {items.map((s, i) => (
          <li key={s} className="flex items-center justify-between px-2 py-1.5 rounded text-sm" style={{ background: i % 2 ? "var(--admin-surface-2)" : "transparent" }}>
            <span style={{ color: "var(--admin-fg)" }}>{s}</span>
            <span className="text-[10px] font-mono" style={{ color: "var(--admin-fg-subtle)" }}>{String(i + 1).padStart(2, "0")}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

import { AppSettingsCard } from "@/components/admin/AppSettingsCard";
import { ReminderAudioSettingsCard } from "@/components/admin/ReminderAudioSettingsCard";

function NotificationsTab() {
  return (
    <div className="space-y-6">
      <ReminderAudioSettingsCard />
      <AppSettingsCard />
    </div>
  );
}

function GatewaysTab() {
  return (
    <SectionCard
      title="Payment Gateways"
      action={<Link to="/admin/gateways" className="text-xs" style={{ color: "var(--admin-accent)" }}>Open gateway manager →</Link>}
    >
      <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
        <GatewayCard name="PayU" status="Connected" />
        <GatewayCard name="CCAvenue" status="Connected" />
        <GatewayCard name="Razorpay" status="Available" />
      </div>
    </SectionCard>
  );
}

function GatewayCard({ name, status }: { name: string; status: string }) {
  const ok = status === "Connected";
  return (
    <div className="rounded-md border p-3 flex items-center justify-between" style={{ borderColor: "var(--admin-border)" }}>
      <div className="font-medium" style={{ color: "var(--admin-fg)" }}>{name}</div>
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: ok ? "var(--admin-success)" : "var(--admin-fg-muted)" }}>
        <span className="size-1.5 rounded-full" style={{ background: ok ? "var(--admin-success)" : "var(--admin-fg-subtle)" }} />
        {status}
      </span>
    </div>
  );
}

function WorkflowTab() {
  const [step1, setStep1] = useState(7);
  const [step2, setStep2] = useState(7);
  return (
    <SectionCard title="Cancellation Workflow Automation">
      <div className="p-4 space-y-4 text-sm">
        <p style={{ color: "var(--admin-fg-muted)" }}>
          Configures the automated 3-step closure flow when a customer requests cancellation after payment.
        </p>

        <Step
          n={1}
          title="Cancellation Request Received"
          desc='Status set to "Customer Declined Service" and Email 1 sent immediately.'
          template="cancellation-request-received"
        />
        <DayField label="Days before Step 2" value={step1} onChange={setStep1} />

        <Step
          n={2}
          title="Closure Approval Pending"
          desc="If no response, status escalates and Email 2 (Final Notice) is sent."
          template="final-notice-before-closure"
        />
        <DayField label="Days before Step 3" value={step2} onChange={setStep2} />

        <Step
          n={3}
          title="Closure Notice Sent → Closed"
          desc="Email 3 (Order Closed) is sent and the order is finalised."
          template="order-closed-notice"
        />

        <div className="rounded-md border-l-4 p-3 text-xs" style={{ borderLeftColor: "var(--admin-warn)", background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}>
          Backend automation (DB columns, cron job, email templates) is queued in Phase 9 and will activate these timers once approved.
        </div>
      </div>
    </SectionCard>
  );
}

function Step({ n, title, desc, template }: { n: number; title: string; desc: string; template: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3" style={{ borderColor: "var(--admin-border)" }}>
      <div className="size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: "var(--admin-primary)", color: "#fff" }}>{n}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium" style={{ color: "var(--admin-fg)" }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--admin-fg-muted)" }}>{desc}</div>
        <div className="text-[11px] font-mono mt-1" style={{ color: "var(--admin-accent)" }}>Template: {template}</div>
      </div>
    </div>
  );
}

function DayField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span style={{ color: "var(--admin-fg-muted)" }}>{label}</span>
      <input
        type="number"
        min={1}
        max={60}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
        className="w-20 rounded border px-2 py-1 text-sm tabular-nums"
        style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
      />
      <span style={{ color: "var(--admin-fg-muted)" }}>days</span>
    </label>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>{label}</div>
      <div className="mt-0.5" style={{ color: "var(--admin-fg)" }}>{value}</div>
    </div>
  );
}
