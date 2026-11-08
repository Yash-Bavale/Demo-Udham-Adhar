import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatIST } from "@/lib/datetime";
import { getTransactionDetail } from "@/lib/crm/revenue-admin.functions";
import {
  X, CheckCircle2, XCircle, Clock, RotateCcw, FileText, Download, User, Phone, Mail,
  CreditCard, ExternalLink, Calendar, ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

export function TransactionDetailDrawer({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  const getDetailFn = useServerFn(getTransactionDetail);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.transactionDetail", paymentId],
    queryFn: () => getDetailFn({ data: { paymentId: paymentId! } }),
    enabled: !!paymentId,
  });

  if (!paymentId) return null;

  const payment = data?.payment as any;
  const attempts = data?.attempts ?? [];
  const refunds = data?.refunds ?? [];

  const lead = payment?.leads;
  const app = payment?.applications;
  const invoice = Array.isArray(payment?.invoices) ? payment?.invoices[0] : payment?.invoices;

  const statusConfig: Record<string, { label: string; icon: any; cls: string }> = {
    paid: { label: "Successful", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    created: { label: "Pending", icon: Clock, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    failed: { label: "Failed", icon: XCircle, cls: "bg-rose-50 text-rose-700 border-rose-200" },
    attempted: { label: "Failed Attempt", icon: XCircle, cls: "bg-rose-50 text-rose-700 border-rose-200" },
    refunded: { label: "Refunded", icon: RotateCcw, cls: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  const st = statusConfig[payment?.status || "created"] || { label: payment?.status || "Unknown", icon: Clock, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  const StatusIcon = st.icon;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200"
        >
          {/* Drawer Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Transaction</div>
              <h2 className="text-base font-bold text-slate-900 font-mono mt-0.5">
                {payment?.transaction_id || paymentId.slice(0, 12)}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {isLoading || !payment ? (
            <div className="p-6 text-center text-sm text-slate-500">Loading details…</div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
              {/* Payment Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${st.cls}`}>
                <div className="flex items-center gap-2.5">
                  <StatusIcon className="size-5 shrink-0" />
                  <div>
                    <div className="font-bold text-base">{st.label}</div>
                    <div className="text-xs opacity-90">{formatIST(payment.payment_date || payment.created_at)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium uppercase opacity-70">Paid Amount</div>
                  <div className="text-lg font-black tracking-tight">{fmtINR(payment.amount)}</div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-slate-50/50">
                <div className="font-semibold text-slate-900 text-xs uppercase tracking-wider mb-2">Financial Breakdown</div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Base Service Fee</span>
                  <span className="font-mono font-medium">{fmtINR(payment.base_amount ?? payment.amount * 0.8475)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>GST (18%)</span>
                  <span className="font-mono font-medium">{fmtINR(payment.gst_amount ?? payment.amount * 0.1525)}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
                  <span>Total Collected Amount</span>
                  <span className="font-mono text-emerald-700">{fmtINR(payment.amount)}</span>
                </div>
              </div>

              {/* Gateway & References */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="font-semibold text-slate-900 text-xs uppercase tracking-wider">Gateway & Payment Details</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Gateway</span>
                    <span className="font-bold text-slate-800 uppercase">{payment.gateway_name || "PayU"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Payment Method</span>
                    <span className="font-semibold text-slate-800">{payment.payment_method || "UPI / Online"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block">Gateway Payment Reference</span>
                    <span className="font-mono font-medium text-slate-800 select-all">{payment.razorpay_payment_id || payment.transaction_id || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Customer & Linked Order */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="font-semibold text-slate-900 text-xs uppercase tracking-wider">Customer & Linked Order</div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-slate-400" />
                    <span className="font-medium text-slate-800">{lead?.name || "Customer"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-slate-400" />
                    <span className="font-mono text-slate-700">{lead?.mobile || "—"}</span>
                  </div>
                  {lead?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 text-slate-400" />
                      <span className="text-slate-700">{lead.email}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-slate-500">Service:</span>
                    <span className="font-semibold text-slate-800">{lead?.service || "UDYAM Registration"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Order Ref:</span>
                    <span className="font-mono font-bold text-indigo-600">{app?.application_code || lead?.lead_code || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Related Documents / Invoice */}
              {invoice && (
                <div className="rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileText className="size-5 text-indigo-600" />
                    <div>
                      <div className="font-semibold text-slate-900 text-xs">Tax Invoice</div>
                      <div className="text-xs font-mono text-slate-500">{invoice.invoice_number}</div>
                    </div>
                  </div>
                  {invoice.pdf_path && (
                    <a
                      href={`/api/public/invoice/${lead?.lead_code}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="size-3.5" /> View PDF
                    </a>
                  )}
                </div>
              )}

              {/* Attempt History for this Order */}
              {attempts.length > 1 && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center justify-between">
                    <span>Payment Attempt History</span>
                    <span className="text-[10px] text-slate-500">{attempts.length} attempts</span>
                  </div>
                  <div className="space-y-2">
                    {attempts.map((att: any, idx: number) => (
                      <div
                        key={att.id}
                        className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${att.id === payment.id ? "bg-emerald-50/70 border-emerald-200 font-medium" : "bg-slate-50 border-slate-200"}`}
                      >
                        <div>
                          <div className="font-mono text-[11px] text-slate-700">Attempt #{idx + 1} · {att.gateway_name?.toUpperCase()}</div>
                          <div className="text-[10px] text-slate-500">{formatIST(att.created_at)}</div>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${att.status === "paid" ? "bg-emerald-100 text-emerald-800" : att.status === "created" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>
                            {att.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
