import { isVisibleService } from "@/lib/crm/visible-services";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles, Loader2, Send, Copy, MessageCircle, RefreshCw, CheckCircle2, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listServices } from "@/lib/crm/services-admin.functions";
import {
  selectConsultationService,
  sendConsultationPaymentLink,
  resetConsultationSelection,
} from "@/lib/crm/talk-to-expert.functions";
import { getPaymentLinkStatusForLead } from "@/lib/payments/payment-links.functions";
import { useRole } from "@/hooks/useRole";

type Mode = "select" | "awaiting_payment";

type Props = {
  leadId: string;
  leadCode: string;
  mode: Mode;
  customerName?: string | null;
  customerMobile?: string | null;
  service?: string | null;
  totalAmount?: number | null;
};

export function ConvertConsultationPanel(props: Props) {
  if (props.mode === "awaiting_payment") {
    return <AwaitingPaymentStep {...props} />;
  }
  return <SelectServiceStep {...props} />;
}

/* ---------- Step A: Pick the service ---------- */

function SelectServiceStep({ leadId, leadCode }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listServices);
  const selectFn = useServerFn(selectConsultationService);

  const [serviceId, setServiceId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.services.active"],
    queryFn: () => listFn(),
  });

  const GST_DOMAIN = "gstcertificate.in";
  const services = useMemo(
    () =>
      (data?.rows ?? [])
        .filter(
          (s: any) =>
            s.is_active &&
            s.service_name !== "Expert Consultation" &&
            isVisibleService(s)
        )
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [data],
  );

  const onSave = async () => {
    if (!serviceId) { toast.error("Please pick a service first."); return; }
    setBusy(true);
    try {
      await selectFn({ data: { leadId, serviceId } });
      toast.success("Service saved. Now send or copy the payment link.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin.order"] }),
        qc.invalidateQueries({ queryKey: ["admin.lead-detail", leadId] }),
        qc.invalidateQueries({ queryKey: ["admin.lead-events", leadId] }),
        qc.invalidateQueries({ queryKey: ["admin.payment-link", leadId] }),
        qc.invalidateQueries({ queryKey: ["lead", leadCode] }),
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save service.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-lg border bg-amber-50 p-4 space-y-3"
      style={{ borderColor: "rgb(252 211 77)" }}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">Step 1 · Set Customer's Service</h3>
      </div>
      <p className="text-xs text-amber-800/90">
        Customer booked a paid Expert Consultation. After the call, pick the service they
        actually need. We'll mint a payment link — you'll send or copy it in the next step.
      </p>

      <Select value={serviceId} onValueChange={setServiceId} disabled={busy || isLoading}>
        <SelectTrigger className="bg-white">
          <SelectValue placeholder={isLoading ? "Loading services…" : "Select service"} />
        </SelectTrigger>
        <SelectContent>
          {services.map((s: any) => (
            <SelectItem key={s.id} value={s.id}>{s.service_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        onClick={onSave}
        disabled={busy || !serviceId}
        size="sm"
        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
      >
        {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Send className="size-4 mr-1.5" />}
        Save Service &amp; Generate Link
      </Button>
    </div>
  );
}

/* ---------- Step B: Send / Copy the payment link ---------- */

function AwaitingPaymentStep({ leadId, leadCode, customerName, customerMobile, service, totalAmount }: Props) {
  const qc = useQueryClient();
  const role = useRole();
  const hideAmount = role.hideMoney();
  const statusFn = useServerFn(getPaymentLinkStatusForLead);
  const sendFn = useServerFn(sendConsultationPaymentLink);
  const resetFn = useServerFn(resetConsultationSelection);

  const [busy, setBusy] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["admin.payment-link", leadId],
    queryFn: () => statusFn({ data: { leadId } }),
    refetchInterval: 15_000,
  });

  // When payment lands, refresh the whole order so the normal flow takes over.
  useEffect(() => {
    if (data?.paid) {
      qc.invalidateQueries({ queryKey: ["admin.order"] });
      qc.invalidateQueries({ queryKey: ["admin.lead-detail", leadId] });
      qc.invalidateQueries({ queryKey: ["admin.lead-events", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadCode] });
    }
  }, [data?.paid, leadId, leadCode, qc]);

  if (data?.paid) {
    return (
      <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-emerald-800">
          <CheckCircle2 className="size-4" />
          <h3 className="text-sm font-semibold">Payment Received</h3>
        </div>
        <div className="text-xs text-emerald-700">
          The onboarding form will now be shown to the customer.
        </div>
      </div>
    );
  }

  const link = data?.link;
  const total = Number(totalAmount ?? link?.amount ?? 0);

  const waText = link
    ? `Dear ${customerName ?? "Customer"}, here is your secure payment link for ${service ?? "your service"}: ${link.payment_url}`
    : "";
  const waHref = customerMobile && link
    ? `https://wa.me/91${String(customerMobile).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(waText)}`
    : null;

  const canSend = !!link && (!lastSentAt || Date.now() - lastSentAt > 60_000);

  const onCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link.payment_url).then(
      () => toast.success("Payment link copied"),
      () => toast.error("Copy failed"),
    );
  };

  const onSend = async () => {
    if (!canSend) {
      toast.info("Please wait a moment before resending.");
      return;
    }
    setBusy(true);
    try {
      await sendFn({ data: { leadId } });
      setLastSentAt(Date.now());
      toast.success("Payment link emailed to customer");
    } catch (e: any) {
      toast.error(e?.message ?? "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    setResetOpen(false);
    setBusy(true);
    try {
      await resetFn({ data: { leadId } });
      toast.success("Selection cleared. Pick the correct service.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin.order"] }),
        qc.invalidateQueries({ queryKey: ["admin.lead-detail", leadId] }),
        qc.invalidateQueries({ queryKey: ["admin.payment-link", leadId] }),
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reset");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-lg border bg-amber-50 p-4 space-y-3"
      style={{ borderColor: "rgb(252 211 77)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-amber-700" />
          <h3 className="text-sm font-semibold text-amber-900">Step 2 · Share Payment Link</h3>
        </div>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-amber-700/60" />}
      </div>

      <div className="text-xs text-amber-900/85 rounded-md bg-white/70 p-2.5 border border-amber-200 space-y-1">
        <div className="flex justify-between"><span>Service</span><span className="font-medium">{service ?? "—"}</span></div>
        {!hideAmount && (
          <div className="flex justify-between font-semibold">
            <span>Total</span><span className="font-mono">₹{total.toFixed(2)}</span>
          </div>
        )}
        <div className="text-[11px] text-amber-900/70 pt-1">
          Customer onboarding form will appear automatically once this payment succeeds.
        </div>
      </div>

      {!link ? (
        <div className="rounded-md bg-white border border-amber-200 px-3 py-2 text-xs text-amber-800">
          No active payment link. Use "Change Service" to re-select.
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            <Input readOnly value={link.payment_url} className="font-mono text-xs h-9 bg-white" />
            <Button size="sm" variant="outline" onClick={onCopy} className="px-2.5 h-9 bg-white">
              <Copy className="size-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              onClick={onSend}
              disabled={busy || !canSend}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Send className="size-4 mr-1.5" />}
              {lastSentAt ? "Resend Email" : "Send Payment Link"}
            </Button>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
              >
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            ) : (
              <Button size="sm" variant="outline" onClick={onCopy} className="bg-white">
                <Copy className="size-3.5 mr-1.5" /> Copy Link
              </Button>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-amber-900/70">
          {link?.created_at
            ? `Link generated ${new Date(link.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </span>
        <button
          type="button"
          onClick={() => setResetOpen(true)}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-900 hover:text-amber-700"
        >
          <RefreshCw className="size-3" /> Change Service
        </button>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change customer's service?</DialogTitle>
            <DialogDescription>
              The current payment link will be voided. You'll be able to pick a different
              service. The original consultation payment is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button onClick={onReset}>Yes, change service</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        onClick={() => refetch()}
        className="hidden"
        aria-hidden
      />
    </div>
  );
}
