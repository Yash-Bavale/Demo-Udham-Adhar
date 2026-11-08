import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Download, Eye, History, Mail, Printer, RefreshCw, Replace, ShieldCheck, Receipt } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getInvoiceSignedUrl,
  previewInvoice,
  regenerateInvoice,
  replaceInvoice,
  resendInvoiceEmail,
  updateInvoiceGstin,
} from "@/lib/crm/invoices.functions";
import { reconcilePaymentStatus } from "@/lib/crm/payments.functions";
import { InvoiceHistoryDrawer } from "./InvoiceHistoryDrawer";

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export function OrderPaymentsPanel({ payments }: { payments: any[] }) {
  const getUrlFn = useServerFn(getInvoiceSignedUrl);
  const regenFn = useServerFn(regenerateInvoice);
  const resendFn = useServerFn(resendInvoiceEmail);
  const previewFn = useServerFn(previewInvoice);
  const replaceFn = useServerFn(replaceInvoice);
  const reconcileFn = useServerFn(reconcilePaymentStatus);
  const gstinFn = useServerFn(updateInvoiceGstin);
  const qc = useQueryClient();

  const handleGstin = async (p: any) => {
    if (!p.invoice_id) return toast.error("Invoice not generated yet.");
    const v = window.prompt("Customer GSTIN (15 characters). The invoice will be regenerated. No email will be sent.", p.invoice_gstin ?? "");
    if (!v || !v.trim()) return;
    try {
      setBusy(`gst-${p.id}`);
      await gstinFn({ data: { invoiceId: p.invoice_id, gstin: v.trim() } } as any);
      toast.success("GSTIN saved and invoice regenerated. No email sent.");
      qc.invalidateQueries({ queryKey: ["admin.order"] });
    } catch (e: any) { toast.error(e?.message ?? "GSTIN update failed"); }
    finally { setBusy(null); }
  };

  const [busy, setBusy] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);

  // Show only paid payments, generated invoices, or refunds
  const paidPayments = (payments ?? []).filter((p) => {
    const status = String(p.status ?? "").toLowerCase();
    const isPaidStatus = ["paid", "success", "successful", "refunded"].includes(status);
    return isPaidStatus || !!p.invoice_number || !!p.parent_payment_id;
  });

  const openInvoiceUrl = async (invoiceId: string) => {
    const { url } = await getUrlFn({ data: { invoiceId } });
    return url;
  };

  const handleDownload = async (p: any) => {
    if (!p.invoice_id) return toast.error("Invoice not generated yet.");
    try {
      setBusy(`dl-${p.id}`);
      const url = await openInvoiceUrl(p.invoice_id);
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e?.message ?? "Download failed"); }
    finally { setBusy(null); }
  };

  const handlePreview = async (p: any) => {
    if (!p.invoice_id) return toast.error("Invoice not generated yet.");
    try {
      setBusy(`pv-${p.id}`);
      const { url } = await previewFn({ data: { invoiceId: p.invoice_id } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e?.message ?? "Preview failed"); }
    finally { setBusy(null); }
  };

  const handlePrint = async (p: any) => {
    if (!p.invoice_id) return toast.error("Invoice not generated yet.");
    try {
      setBusy(`pr-${p.id}`);
      const url = await openInvoiceUrl(p.invoice_id);
      const w = window.open(url, "_blank");
      // Best-effort: trigger print once the PDF loads.
      setTimeout(() => { try { w?.print(); } catch { /* noop */ } }, 1200);
    } catch (e: any) { toast.error(e?.message ?? "Print failed"); }
    finally { setBusy(null); }
  };

  const handleResend = async (p: any) => {
    try {
      setBusy(`mail-${p.id}`);
      await resendFn({ data: { paymentId: p.id } });
      toast.success("Invoice email queued with PDF attached.");
    } catch (e: any) { toast.error(e?.message ?? "Email failed"); }
    finally { setBusy(null); }
  };

  const handleRegen = async (p: any) => {
    try {
      setBusy(`gen-${p.id}`);
      if (p.invoice_id) await regenFn({ data: { invoiceId: p.invoice_id } });
      else await resendFn({ data: { paymentId: p.id } });
      toast.success("Invoice PDF regenerated.");
    } catch (e: any) { toast.error(e?.message ?? "Regenerate failed"); }
    finally { setBusy(null); }
  };

  const handleReplaceClick = (invoiceId: string) => {
    replaceTargetRef.current = invoiceId;
    fileInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const invoiceId = replaceTargetRef.current;
    e.target.value = "";
    if (!file || !invoiceId) return;
    if (file.type !== "application/pdf") return toast.error("Please choose a PDF file.");
    if (file.size > 4 * 1024 * 1024) return toast.error("PDF must be under 4 MB.");
    try {
      setBusy(`rp-${invoiceId}`);
      const buf = await file.arrayBuffer();
      let bin = "";
      const u = new Uint8Array(buf);
      for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
      const b64 = btoa(bin);
      await replaceFn({ data: { invoiceId, fileBase64: b64, filename: file.name } });
      toast.success("Invoice PDF replaced.");
    } catch (e: any) {
      toast.error(e?.message ?? "Replace failed");
    } finally {
      setBusy(null);
      replaceTargetRef.current = null;
    }
  };

  const emailBadge = (p: any) => {
    const s = p.invoice_delivery_status ?? p.invoice_last_email_status;
    if (!s) return <span className="text-slate-400 text-[10px]">—</span>;
    const color = s === "sent" || s === "delivered" ? "bg-emerald-100 text-emerald-700"
      : s === "failed" || s === "bounced" ? "bg-rose-100 text-rose-700"
      : "bg-amber-100 text-amber-700";
    return <Badge variant="secondary" className={`text-[10px] ${color}`}>{s}</Badge>;
  };

  return (
    <div className="rounded-lg border bg-white p-5" style={{ borderColor: "var(--admin-border)" }}>
      <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleReplaceFile} />
      <div className="flex items-center gap-2 mb-3">
        <CreditCard className="size-4 text-slate-600" />
        <h3 className="text-sm font-semibold">Payments &amp; Invoices</h3>
      </div>
      {paidPayments.length === 0 ? (
        <div className="text-sm text-slate-500 italic">No paid invoices recorded.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-slate-500 uppercase tracking-wider">
            <tr className="text-left">
              <th className="py-1.5">Payment Date</th>
              <th>Amount</th>
              <th>Gateway</th>
              <th>Invoice No</th>
              <th>Inv. Date</th>
              <th>PDF</th>
              <th>Email</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paidPayments.map((p) => {
              const amt = Number(p.amount || 0);
              // Refund rows are always negative-amount children. A positive paid
              // child (parent_payment_id set) is a service-change top-up.
              const isRefund = amt < 0;
              const isTopUp = !isRefund && !!p.parent_payment_id;
              const isPaid = String(p.status).toLowerCase() === "paid" && !isRefund;
              return (
                <tr key={p.id} className={`border-t ${isRefund ? "bg-rose-50/50" : ""}`}>
                  <td className="py-1.5 text-slate-600">{fmtDate(p.payment_date ?? p.created_at)}</td>
                  <td className={`font-medium ${isRefund ? "text-rose-700" : "text-slate-800"}`}>
                    {isRefund ? "Refund · " : isTopUp ? "Top-up · " : ""}Rs. {Math.abs(amt).toLocaleString("en-IN")}
                  </td>
                  <td className="text-slate-600 capitalize">{p.gateway_name ?? "—"}</td>
                  <td className="font-mono text-[10px]">{p.invoice_number ?? "—"}{p.invoice_gstin && <div className="font-semibold text-emerald-700">GSTIN: {p.invoice_gstin}</div>}</td>
                  <td className="text-slate-600">{fmtDate(p.invoice_issued_at)}</td>
                  <td>
                    {p.has_pdf
                      ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Ready</Badge>
                      : isPaid
                        ? <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px]">Pending</Badge>
                        : <span className="text-slate-400 text-[10px]">—</span>}
                  </td>
                  <td>{emailBadge(p)}</td>
                  <td className="text-right">
                    {isPaid ? (
                      <div className="inline-flex items-center gap-1">
                        <IconBtn title="Preview"     icon={Eye}     loading={busy === `pv-${p.id}`}   onClick={() => handlePreview(p)} />
                        <IconBtn title="Download"    icon={Download} loading={busy === `dl-${p.id}`}  onClick={() => handleDownload(p)} />
                        <IconBtn title="Print"       icon={Printer}  loading={busy === `pr-${p.id}`}  onClick={() => handlePrint(p)} />
                        <IconBtn title="Email again" icon={Mail}     loading={busy === `mail-${p.id}`} onClick={() => handleResend(p)} />
                        <IconBtn title="Regenerate"  icon={RefreshCw} loading={busy === `gen-${p.id}`} onClick={() => handleRegen(p)} />
                        <IconBtn title={p.invoice_gstin ? "Edit GSTIN" : "Add GSTIN"} icon={Receipt} loading={busy === `gst-${p.id}`} disabled={!p.invoice_id} onClick={() => handleGstin(p)} />
                        <IconBtn title="Replace PDF" icon={Replace}  loading={busy === `rp-${p.invoice_id}`} disabled={!p.invoice_id} onClick={() => p.invoice_id && handleReplaceClick(p.invoice_id)} />
                        <IconBtn title="History"     icon={History}  disabled={!p.invoice_id} onClick={() => p.invoice_id && setHistoryId(p.invoice_id)} />
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          disabled={busy === `rec-${p.id}`}
                          onClick={async () => {
                            try {
                              setBusy(`rec-${p.id}`);
                              const r = await reconcileFn({ data: { paymentId: p.id } });
                              if (r.status === "paid") toast.success("Payment verified & marked paid. Invoice + email queued.");
                              else if (r.status === "failed") toast.error("Gateway confirmed this payment failed.");
                              else toast.info(`Still pending at gateway (status: ${r.status}).`);
                            } catch (e: any) { toast.error(e?.message ?? "Verify failed"); }
                            finally { setBusy(null); }
                          }}
                          title="Ask the payment gateway for the authoritative status"
                        >
                          <ShieldCheck className="size-3 mr-1" /> Verify
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <InvoiceHistoryDrawer invoiceId={historyId} open={!!historyId} onOpenChange={(v) => !v && setHistoryId(null)} />
    </div>
  );
}

function IconBtn({
  icon: Icon, title, onClick, loading, disabled,
}: { icon: any; title: string; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <Button size="sm" variant="outline" className="h-7 px-2"
      disabled={!!loading || !!disabled}
      onClick={onClick} title={title} aria-label={title}>
      <Icon className="size-3.5" />
    </Button>
  );
}
