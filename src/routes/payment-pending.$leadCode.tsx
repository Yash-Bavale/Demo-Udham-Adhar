import { CustomerRefGate, useCustomerLeadCode } from "@/components/site/CustomerRefGate";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getApplicationSummary } from "@/lib/payments/gateways.functions";
import { useAccessToken } from "@/lib/security/customer-access-browser";
import { SecureLinkNotice } from "@/components/site/SecureLinkNotice";
import { trackEvent } from "@/lib/analytics/track";

const PAID_STATUSES = new Set(["payment_successful", "under_process", "completed"]);

export const Route = createFileRoute("/payment-pending/$leadCode")({
  head: () => ({
    meta: [
      { title: "Confirming Payment — Business Help Services" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PendingPageGated,
});

function PendingPage() {
  const leadCode = useCustomerLeadCode();
  const accessToken = useAccessToken(leadCode, ["co", "ob"]);
  const navigate = useNavigate();
  const getSummary = useServerFn(getApplicationSummary);
  const [elapsed, setElapsed] = useState(0);
  const [stillPending, setStillPending] = useState(false);

  useEffect(() => {
    trackEvent("payment_pending_page_view", { leadCode });
  }, [leadCode]);

  // Poll for payment confirmation
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    let attempt = 0;

    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await getSummary({ data: { leadCode, accessToken } });
          if (cancelled) return;
          const isPaid = !!res?.lead?.payment || PAID_STATUSES.has(res?.lead?.status);
          if (isPaid) {
            navigate({ to: "/success/$leadCode", params: { leadCode }, replace: true });
            return;
          }
        } catch {
          // keep polling
        }
        attempt++;
        setElapsed(attempt * 4);
        if (attempt >= 30) {
          setStillPending(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [leadCode, getSummary, navigate, accessToken]);

  if (accessToken === null) return <SecureLinkNotice leadCode={leadCode} />;

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 bg-gradient-to-b from-amber-50/40 to-slate-50">
      <div className="w-full max-w-lg">
        <Card className="overflow-hidden shadow-xl border-amber-200">
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 mb-4 ring-8 ring-amber-50">
              <Loader2 className="w-10 h-10 text-amber-600 animate-spin" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-navy font-display mb-2">
              Confirming your payment…
            </h1>
            <p className="text-slate-600 text-sm mb-1">
              PayU is still confirming this transaction. This usually takes under a minute.
            </p>
            <p className="text-xs text-slate-500 mb-6">
              Ref: <span className="font-mono font-semibold text-brand-navy">{leadCode}</span>
              {elapsed > 0 && <> · {elapsed}s elapsed</>}
            </p>

            <div className="flex items-center gap-2 justify-center text-xs text-slate-500 mb-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Please don't close or refresh this page.</span>
            </div>
            <p className="text-[11px] text-slate-400">
              If your account was debited, the payment will be auto-reconciled — please do not pay twice.
            </p>
          </div>

          {stillPending && (
            <div className="border-t border-amber-200 bg-amber-50/60 p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-bold text-brand-navy text-sm mb-1">Taking longer than usual</h2>
                  <p className="text-xs text-slate-600">
                    We still haven't received confirmation from PayU. You can retry the payment, or contact our support team for help.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  to="/payment/$leadCode"
                  params={{ leadCode }}
                  className="flex-1"
                >
                  <Button className="w-full bg-brand-navy hover:bg-brand-navy-deep text-white rounded-full">
                    Retry Payment
                  </Button>
                </Link>
                <Link to="/contact" className="flex-1">
                  <Button variant="outline" className="w-full rounded-full">
                    Contact Support
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PendingPageGated() {
  return (
    <CustomerRefGate>
      <PendingPage />
    </CustomerRefGate>
  );
}
