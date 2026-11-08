import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Link2, Copy, RefreshCw, MessageCircle, CheckCircle2, Loader2, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  createPaymentLink,
  getPaymentLinkStatusForLead,
  regeneratePaymentLink,
} from "@/lib/payments/payment-links.functions";
import type { LeadStatusV2 } from "@/lib/crm/lead-transitions";

const VISIBLE_STATUSES: LeadStatusV2[] = [
  "new_lead", "contacted", "follow_up_required", "payment_pending", "payment_failed",
];

type Props = {
  leadId: string;
  leadCode: string;
  mobile?: string | null;
  customerName?: string | null;
  service?: string | null;
  baseAmount?: number | null;
  gstAmount?: number | null;
  totalAmount?: number | null;
  leadStatusV2?: LeadStatusV2 | null;
};

export function PaymentLinkPanel(props: Props) {
  const currentStatus = (props.leadStatusV2 ?? "new_lead") as LeadStatusV2;
  const qc = useQueryClient();
  const createFn = useServerFn(createPaymentLink);
  const statusFn = useServerFn(getPaymentLinkStatusForLead);
  const regenFn = useServerFn(regeneratePaymentLink);

  const [busy, setBusy] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["admin.payment-link", props.leadId],
    queryFn: () => statusFn({ data: { leadId: props.leadId } }),
    refetchInterval: 15_000,
  });

  // Auto-refresh workspace when payment lands.
  useEffect(() => {
    if (data?.paid) {
      qc.invalidateQueries({ queryKey: ["admin.lead-events", props.leadId] });
    }
  }, [data?.paid, props.leadId, qc]);

  if (data?.paid) {
    return (
      <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-emerald-800">
          <CheckCircle2 className="size-4" />
          <h3 className="text-sm font-semibold">Payment Received</h3>
        </div>
        <div className="text-xs text-emerald-700">
          ₹{data.paidAmount?.toFixed(2) ?? "—"} •{" "}
          {data.paidAt ? new Date(data.paidAt).toLocaleString("en-IN") : ""}
        </div>
      </div>
    );
  }

  if (!VISIBLE_STATUSES.includes(currentStatus)) return null;

  const link = data?.link;
  const total = props.totalAmount ?? 0;
  const base = props.baseAmount ?? 0;
  const gst = props.gstAmount ?? 0;
  const waText = link
    ? `Dear ${props.customerName ?? "Customer"}, here is your secure payment link for ${props.service ?? "your service"}: ${link.payment_url}`
    : "";
  const waHref =
    props.mobile && link
      ? `https://wa.me/91${props.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(waText)}`
      : null;

  const onGenerate = async () => {
    setBusy(true);
    try {
      await createFn({ data: { leadId: props.leadId } });
      await refetch();
      toast.success("Payment link ready");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create link");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link.payment_url).then(
      () => toast.success("Link copied"),
      () => toast.error("Copy failed"),
    );
  };

  const onRegenerate = async () => {
    setRegenOpen(false);
    setBusy(true);
    try {
      await regenFn({ data: { leadId: props.leadId } });
      await refetch();
      toast.success("New link generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Regeneration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold">Generate Payment Link</h3>
        </div>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-slate-400" />}
      </div>

      <div className="text-xs text-slate-600 space-y-1 rounded-md bg-slate-50 p-2.5 border border-slate-200">
        <div className="flex justify-between"><span>Service</span><span className="font-medium text-slate-800">{props.service ?? "—"}</span></div>
        <div className="flex justify-between"><span>Base</span><span className="font-mono">₹{base.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>GST (18%)</span><span className="font-mono">₹{gst.toFixed(2)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-semibold text-slate-900">
          <span>Total</span><span className="font-mono">₹{total.toFixed(2)}</span>
        </div>
      </div>

      {!link && (
        <Button onClick={onGenerate} disabled={busy} size="sm" className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin mr-1" /> : <Link2 className="size-4 mr-1" />}
          Generate & Copy Link
        </Button>
      )}

      {link && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <Input readOnly value={link.payment_url} className="font-mono text-xs h-9" />
            <Button size="sm" variant="outline" onClick={onCopy} className="px-2.5 h-9"><Copy className="size-3.5" /></Button>
          </div>
          <div className="flex gap-1.5">
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
              >
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            )}
            <Button
              size="sm" variant="outline" onClick={async () => {
                setBusy(true);
                try {
                  const res = await refetch();
                  if (res.data?.paid) {
                    toast.success("Payment verified & integrated into CRM!");
                  } else {
                    toast.info("No completed gateway payment found yet.");
                  }
                } finally {
                  setBusy(false);
                }
              }} disabled={busy || isFetching}
              className="h-8 text-xs font-medium"
            >
              <RefreshCw className={`size-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Sync Status
            </Button>
            <Button
              size="sm" variant="outline" onClick={() => setRegenOpen(true)} disabled={busy}
              className="h-8 text-xs"
            >
              Regenerate
            </Button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Created {new Date(link.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="capitalize px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">{link.status}</span>
          </div>
        </div>
      )}

      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Regenerate payment link?</DialogTitle>
            <DialogDescription>
              The existing pending link will be voided. The customer will need the new link to pay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenOpen(false)}>Cancel</Button>
            <Button onClick={onRegenerate}>Regenerate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
