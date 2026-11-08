import { useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Headset, Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { initiateClickToCall } from "@/lib/telephony/outbound.functions";
import { browserPhone } from "@/lib/telephony/browser-phone-bus";

type Props = {
  mobile?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  applicationId?: string | null;
  className?: string;
  label?: string;
  compact?: boolean;
};

/** CRM click-to-call via CallerDesk — rings your CallerDesk phone first, then the customer. Adds a browser-call option when the browser phone is ready. */
export function CallButton({ mobile, customerId, leadId, applicationId, className, label = "Phone callback", compact }: Props) {
  const call = useServerFn(initiateClickToCall);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const phoneReady = useSyncExternalStore(browserPhone.subscribe, browserPhone.isReady, () => false);
  if (!mobile) return null;

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const r: any = await call({
        data: {
          destination: String(mobile),
          customerId: customerId ?? null,
          leadId: leadId ?? null,
          applicationId: applicationId ?? null,
        },
      });
      toast.success(r?.alreadyInProgress ? "This call is already in progress" : "Calling customer… answer your phone first");
      qc.invalidateQueries({ queryKey: ["my-call-state"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not start the call");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Rings your CallerDesk phone first, then connects the customer"
        className={
          className ??
          `inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 ${compact ? "py-1" : "py-1.5"} text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition`
        }
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PhoneCall className="size-3.5" />}
        {busy ? "Calling…" : label}
      </button>
      {phoneReady ? (
        <button
          type="button"
          title="Call from the CRM browser phone (headset)"
          onClick={() => { if (!browserPhone.dial({ number: String(mobile), customerId, leadId, applicationId })) toast.error("Browser phone is not ready"); }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 ${compact ? "py-1" : "py-1.5"} text-xs font-semibold hover:bg-accent transition`}
        >
          <Headset className="size-3.5" />Browser call
        </button>
      ) : null}
    </span>
  );
}
