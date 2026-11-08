import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Mail } from "lucide-react";
import { SectionCard } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/whatsapp-templates")({
  head: () => ({ meta: [{ title: "WhatsApp Templates — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: WhatsAppTemplatesPage,
});

const TEMPLATES = [
  {
    code: "payment-received",
    name: "Payment Received",
    trigger: "Successful payment captured",
    body:
      "Hi {{customer_name}}, we've received your payment of ₹{{amount}} for {{service_name}}. Order: {{order_number}}. Our team will reach out shortly.",
  },
  {
    code: "documents-required",
    name: "Documents Required",
    trigger: "Application moves to Documents Pending",
    body:
      "Hi {{customer_name}}, please share your {{document_list}} to continue with {{service_name}}. Upload here: {{upload_link}}",
  },
  {
    code: "service-started",
    name: "Service Started",
    trigger: "Application moves to Processing",
    body:
      "Hi {{customer_name}}, we've started working on your {{service_name}} (Order {{order_number}}). Expected completion: {{eta}}.",
  },
  {
    code: "complaint-submitted",
    name: "Complaint Submitted",
    trigger: "Complaint filed with authority",
    body:
      "Hi {{customer_name}}, your complaint #{{complaint_number}} has been filed with {{authority_name}}. We'll keep you posted.",
  },
  {
    code: "service-completed",
    name: "Service Completed",
    trigger: "Application status = Completed",
    body:
      "Hi {{customer_name}}, your {{service_name}} (Order {{order_number}}) is complete. Certificate: {{certificate_link}}. Thank you for choosing us!",
  },
];

function WhatsAppTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--admin-fg)" }}>WhatsApp Templates</h1>
          <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Outbound message templates used by automated workflows. Merge tags wrapped in {"{{ }}"}.
          </p>
        </div>
        <Link
          to="/admin/emails"
          className="inline-flex items-center gap-1.5 text-xs rounded-md border px-3 py-1.5"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
        >
          <Mail className="size-3.5" /> Email Templates
        </Link>
      </div>

      <div className="rounded-md border-l-4 p-3 text-xs" style={{ borderLeftColor: "var(--admin-info)", background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}>
        WhatsApp Business API integration ships in the next phase. Templates below mirror the approved structure and
        will be wired to the messaging queue once the provider is connected.
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {TEMPLATES.map((t) => (
          <SectionCard
            key={t.code}
            title={t.name}
            action={<span className="text-[10px] font-mono" style={{ color: "var(--admin-fg-subtle)" }}>{t.code}</span>}
          >
            <div className="p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>Trigger</div>
              <div className="text-sm" style={{ color: "var(--admin-fg)" }}>{t.trigger}</div>
              <div className="text-[11px] uppercase tracking-wide pt-2" style={{ color: "var(--admin-fg-muted)" }}>Message</div>
              <div
                className="rounded-md border p-3 text-sm whitespace-pre-wrap"
                style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)", color: "var(--admin-fg)" }}
              >
                <MessageCircle className="inline size-3.5 mr-1.5 align-text-bottom" style={{ color: "var(--admin-success)" }} />
                {t.body}
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
