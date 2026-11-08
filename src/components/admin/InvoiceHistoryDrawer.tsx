import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getInvoiceDetail } from "@/lib/crm/invoices.functions";
import { FileText, Mail, RefreshCw, Replace, Eye, AlertCircle } from "lucide-react";

const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const ICONS: Record<string, any> = {
  generated: FileText,
  regenerated: RefreshCw,
  replaced: Replace,
  emailed: Mail,
  email_failed: AlertCircle,
  preview: Eye,
  delivery_update: Mail,
};

export function InvoiceHistoryDrawer({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const getFn = useServerFn(getInvoiceDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["invoice.detail", invoiceId],
    queryFn: () => getFn({ data: { invoiceId: invoiceId! } }),
    enabled: !!invoiceId && open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            Invoice {data?.invoice?.invoice_number ?? "…"}
          </SheetTitle>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="mt-6 text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="mt-4 space-y-5 text-xs">
            <div className="rounded-lg border bg-slate-50/60 p-3 space-y-1.5">
              <Row label="Attachment name" value={<span className="font-mono">{data.invoice.attachment_name}</span>} />
              <Row label="Invoice date" value={fmt(data.invoice.issued_at)} />
              <Row label="PDF generated" value={fmt(data.invoice.pdf_generated_at)} />
              <Row label="PDF status" value={
                data.invoice.pdf_path
                  ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Ready</Badge>
                  : <Badge variant="secondary" className="text-[10px]">Pending</Badge>
              } />
              <Row label="Last emailed" value={fmt(data.invoice.last_emailed_at)} />
              <Row label="Email attempts" value={String(data.invoice.email_attempts ?? 0)} />
              <Row label="Last email status" value={data.invoice.last_email_status ?? "—"} />
              <Row label="Delivery status" value={data.invoice.delivery_status ?? "—"} />
              {data.invoice.replaced_at && (
                <Row label="Replaced at" value={fmt(data.invoice.replaced_at)} />
              )}
            </div>

            <section>
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Lifecycle events
              </h4>
              <ol className="space-y-2">
                {data.events.length === 0 && <li className="text-slate-400 italic">No events.</li>}
                {data.events.map((e: any) => {
                  const Icon = ICONS[e.event_type] ?? FileText;
                  return (
                    <li key={e.id} className="flex gap-2.5 border-l-2 border-slate-200 pl-3 py-1">
                      <Icon className="size-3.5 mt-0.5 text-slate-500" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize">{String(e.event_type).replace(/_/g, " ")}</span>
                          <span className="text-slate-400">{fmt(e.created_at)}</span>
                        </div>
                        <div className="text-slate-500">by {e.actor_label}</div>
                        {e.detail && Object.keys(e.detail).length > 0 && (
                          <pre className="mt-1 text-[10px] bg-slate-50 rounded p-1.5 overflow-x-auto">
                            {JSON.stringify(e.detail, null, 0)}
                          </pre>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section>
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Email delivery log
              </h4>
              <ol className="space-y-2">
                {data.emailLogs.length === 0 && <li className="text-slate-400 italic">No emails recorded for this lead yet.</li>}
                {data.emailLogs.map((l: any) => (
                  <li key={l.id} className="flex gap-2.5 border-l-2 border-slate-200 pl-3 py-1">
                    <Mail className={`size-3.5 mt-0.5 ${l.status === "sent" ? "text-emerald-600" : l.status === "failed" ? "text-rose-600" : "text-slate-500"}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{l.template_code ?? l.subject}</span>
                        <span className="text-slate-400">{fmt(l.created_at)}</span>
                      </div>
                      <div className="text-slate-500">{l.to_email} · {l.status}</div>
                      {l.error_message && <div className="text-rose-600">{l.error_message}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}
