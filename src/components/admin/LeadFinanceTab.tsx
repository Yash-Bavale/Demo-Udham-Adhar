import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Download, FileText, Wallet } from "lucide-react";
import { getLeadFinance } from "@/lib/finance/lead-finance.functions";
import { getInvoiceSignedUrl } from "@/lib/crm/invoices.functions";

export function LeadFinanceTab({ leadId }: { leadId: string }) {
  const fetchFn = useServerFn(getLeadFinance);
  const getUrl = useServerFn(getInvoiceSignedUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.lead.finance", leadId],
    queryFn: () => fetchFn({ data: { leadId } }),
  });

  if (isLoading) return <div className="text-sm text-slate-500">Loading finance…</div>;
  if (!data) return null;

  const { payments, invoices, settlements } = data;

  const handleDownload = async (id: string) => {
    try {
      const { url } = await getUrl({ data: { invoiceId: id } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      alert(e?.message ?? "Could not open invoice");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      <section>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700">
          <Wallet className="w-4 h-4" /> Payments ({payments.length})
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Date</th>
                <th className="text-left">Gateway</th>
                <th className="text-left">Txn</th>
                <th className="text-right">Amount</th>
                <th className="text-left pl-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="py-1 text-xs">
                    {new Date(p.payment_date ?? p.created_at).toLocaleString("en-IN")}
                  </td>
                  <td className="text-xs">{p.gateway_name}</td>
                  <td className="font-mono text-xs">{p.transaction_id ?? "—"}</td>
                  <td className="text-right">₹{Number(p.amount).toFixed(2)}</td>
                  <td className="pl-3 text-xs">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700">
          <FileText className="w-4 h-4" /> Invoices ({invoices.length})
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices generated.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Number</th>
                <th className="text-left">Issued</th>
                <th className="text-right">Base</th>
                <th className="text-right">GST</th>
                <th className="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: any) => (
                <tr key={inv.id} className="border-t">
                  <td className="py-1 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="text-xs">{new Date(inv.issued_at).toLocaleDateString("en-IN")}</td>
                  <td className="text-right">₹{Number(inv.base_amount).toFixed(2)}</td>
                  <td className="text-right">₹{Number(inv.gst_amount).toFixed(2)}</td>
                  <td className="text-right font-semibold">₹{Number(inv.total_amount).toFixed(2)}</td>
                  <td className="text-right">
                    {inv.pdf_path && (
                      <button
                        onClick={() => handleDownload(inv.id)}
                        className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                      >
                        <Download className="w-3 h-3" /> PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700">
          <Wallet className="w-4 h-4" /> Settlements ({settlements.length})
        </div>
        {settlements.length === 0 ? (
          <p className="text-sm text-slate-500">No settlements linked yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Date</th>
                <th className="text-right">Settled</th>
                <th className="text-right">Fee</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s: any) => (
                <tr key={s.id} className="border-t">
                  <td className="py-1 text-xs">{new Date(s.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="text-right">₹{Number(s.settled_amount).toFixed(2)}</td>
                  <td className="text-right">₹{Number(s.fee).toFixed(2)}</td>
                  <td className="text-right font-semibold">₹{Number(s.net).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </motion.div>
  );
}
