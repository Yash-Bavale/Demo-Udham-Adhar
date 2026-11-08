import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/help/email-matrix")({
  head: () => ({
    meta: [
      { title: "Email & Status Matrix — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: EmailMatrixPage,
});

type EmailRow = {
  code: string;
  name: string;
  trigger: "auto" | "manual" | "auto/manual";
  when: string;
  audience: string;
};

const EMAILS: EmailRow[] = [
  { code: "E001", name: "Order Welcome + Invoice", trigger: "auto", when: "PayU webhook → ORDER_CREATED", audience: "Customer" },
  { code: "E002", name: "Onboarding Form Link", trigger: "manual", when: "Send/Resend Form Link button", audience: "Customer" },
  { code: "E003", name: "Customer Hold Notice", trigger: "auto", when: "Transition → CUSTOMER_SIDE_DELAY", audience: "Customer" },
  { code: "E004", name: "Order Closed (Auto)", trigger: "auto", when: "Scheduler 2: CUSTOMER_SIDE_DELAY > 24h", audience: "Customer + staff" },
  { code: "E005", name: "Our Side Delay Notice", trigger: "auto", when: "Transition → OUR_SIDE_DELAY", audience: "Customer" },
  { code: "E006", name: "Order Completed", trigger: "auto", when: "Transition → COMPLETED", audience: "Customer" },
  { code: "E007", name: "Consultation Completed", trigger: "manual", when: "Talk-to-expert wrap up", audience: "Customer" },
  { code: "E008", name: "Ticket Reply", trigger: "manual", when: "Reply from ticket workspace", audience: "Customer" },
  { code: "E009", name: "Ticket Resolved", trigger: "auto/manual", when: "On ticket resolve", audience: "Customer" },
  { code: "E010", name: "Ticket Closed", trigger: "auto/manual", when: "On ticket close", audience: "Customer" },
  { code: "E011", name: "Technical Delay Resolved", trigger: "manual", when: "Resolved technical delay in workspace", audience: "Customer" },
  { code: "E012", name: "Service Changed", trigger: "auto", when: "Change Service in order workspace (same / downgrade / upgrade)", audience: "Customer" },
  { code: "R001", name: "Refund Approved", trigger: "manual", when: "Refund processed & confirmed", audience: "Customer" },
  { code: "R002", name: "Refund Rejected / Closed", trigger: "manual", when: "Refund rejected button in support ticket / workspace", audience: "Customer" },
];

const STATUSES: { code: string; description: string; nextAllowed: string }[] = [
  { code: "NEW_ORDER", description: "Order created (payment received)", nextAllowed: "WAITING_CUSTOMER_INFO, CLOSED, REFUND_REQUESTED" },
  { code: "WAITING_CUSTOMER_INFO", description: "Form link sent, awaiting submission", nextAllowed: "INFO_RECEIVED, CUSTOMER_HOLD, CLOSED, REFUND_REQUESTED" },
  { code: "INFO_RECEIVED", description: "Customer submitted onboarding form", nextAllowed: "IN_PROCESSING, CUSTOMER_HOLD, OUR_SIDE_DELAY, CLOSED, REFUND_REQUESTED" },
  { code: "IN_PROCESSING", description: "Employee working on it", nextAllowed: "SUBMITTED_TO_GOVT, CUSTOMER_HOLD, OUR_SIDE_DELAY, HIGH_PRIORITY, CLOSED, REFUND_REQUESTED" },
  { code: "CUSTOMER_HOLD", description: "Waiting on customer for more info", nextAllowed: "INFO_RECEIVED, IN_PROCESSING, CLOSED, REFUND_REQUESTED" },
  { code: "OUR_SIDE_DELAY", description: "Delayed on our end (reminders active)", nextAllowed: "IN_PROCESSING, SUBMITTED_TO_GOVT, HIGH_PRIORITY, CLOSED" },
  { code: "SUBMITTED_TO_GOVT", description: "Filed with authority, awaiting cert", nextAllowed: "CERTIFICATE_ISSUED, OUR_SIDE_DELAY, HIGH_PRIORITY, CLOSED" },
  { code: "CERTIFICATE_ISSUED", description: "Certificate received, ready to deliver", nextAllowed: "COMPLETED, CLOSED" },
  { code: "COMPLETED", description: "Delivered to customer", nextAllowed: "REOPENED" },
  { code: "HIGH_PRIORITY", description: "Escalated — needs immediate attention", nextAllowed: "IN_PROCESSING, SUBMITTED_TO_GOVT, CLOSED" },
  { code: "REFUND_REQUESTED", description: "Customer/staff requested refund", nextAllowed: "REFUND_APPROVED, IN_PROCESSING, CLOSED" },
  { code: "REFUND_APPROVED", description: "Finance approved refund", nextAllowed: "REFUND_PROCESSED" },
  { code: "REFUND_PROCESSED", description: "Refund paid out", nextAllowed: "CLOSED" },
  { code: "CLOSED", description: "Order closed", nextAllowed: "REOPENED" },
  { code: "REOPENED", description: "Order reopened for rework", nextAllowed: "WAITING_CUSTOMER_INFO, IN_PROCESSING" },
];

const NOTIFICATIONS = [
  { event: "New order assigned", who: "Assignee", template: "You've been assigned SMV[X] — <Service> for <Customer>" },
  { event: "Onboarding form submitted", who: "Assignee", template: "Customer <Name> submitted form for SMV[X]" },
  { event: "Incoming email/ticket reply", who: "Assignee + Admin", template: "New reply on SMV[X] — <preview>" },
  { event: "Customer Hold started", who: "Assignee", template: "SMV[X] moved to Customer Hold — 24h auto-close timer started" },
  { event: "Order auto-closed (24h)", who: "Assignee + Admin", template: "SMV[X] auto-closed — no response in 24h" },
  { event: "Our Side Delay — reminder fires", who: "Assignee", template: "Reminder: SMV[X] still in Our Side Delay" },
  { event: "Escalation (6h inaction)", who: "Super Admin", template: "SMV[X] — Our Side Delay, employee has not acted in 6 hours" },
  { event: "HIGH_PRIORITY marked", who: "Super Admin + Assignee", template: "SMV[X] marked HIGH PRIORITY — immediate attention required" },
  { event: "Refund requested", who: "Super Admin + Finance", template: "Refund requested on SMV[X] — awaiting your approval" },
];

const triggerTone: Record<EmailRow["trigger"], string> = {
  auto: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  manual: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "auto/manual": "bg-amber-50 text-amber-700 ring-amber-200",
};

function EmailMatrixPage() {
  return (
    <div className="space-y-8 max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Email &amp; Status Matrix</h1>
        <p className="text-sm text-slate-500 mt-1">
          Single source of truth for the order lifecycle: which email fires when, allowed status transitions, and who gets notified.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Email templates (E001–E012)</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left w-16">Code</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left w-28">Trigger</th>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left w-40">Audience</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EMAILS.map((e) => (
                <tr key={e.code} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{e.code}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{e.name}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${triggerTone[e.trigger]}`}>
                      {e.trigger}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{e.when}</td>
                  <td className="px-3 py-2 text-slate-600">{e.audience}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-slate-500">
          All outbound emails share one thread per order (RFC-822 <code>Message-ID</code> + <code>In-Reply-To</code>). Customer replies land in
          the same conversation and appear in the order's Support Tickets panel automatically.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Order status transitions</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left w-56">Status</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left w-96">Can transition to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STATUSES.map((s) => (
                <tr key={s.code} className="hover:bg-slate-50/60 align-top">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{s.code}</td>
                  <td className="px-3 py-2 text-slate-700">{s.description}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs font-mono">{s.nextAllowed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Notifications</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left w-72">Event</th>
                <th className="px-3 py-2 text-left w-56">Recipients</th>
                <th className="px-3 py-2 text-left">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {NOTIFICATIONS.map((n) => (
                <tr key={n.event} className="hover:bg-slate-50/60 align-top">
                  <td className="px-3 py-2 font-medium text-slate-900">{n.event}</td>
                  <td className="px-3 py-2 text-slate-600">{n.who}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs italic">{n.template}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-slate-500">
          Delivered in-app via the bell icon (with sound + unread badge). Clicking a notification deep-links to the relevant Order Workspace or Ticket.
        </p>
      </section>
    </div>
  );
}
