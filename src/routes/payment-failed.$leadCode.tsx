import { CustomerRefGate, useCustomerLeadCode } from "@/components/site/CustomerRefGate";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { XCircle, RefreshCw, MessageCircle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getApplicationSummary } from "@/lib/payments/gateways.functions";
import { useAccessToken } from "@/lib/security/customer-access-browser";
import { SecureLinkNotice } from "@/components/site/SecureLinkNotice";

import { trackEvent } from "@/lib/analytics/track";

const PAID_STATUSES = new Set(["payment_successful", "under_process", "completed"]);

export const Route = createFileRoute("/payment-failed/$leadCode")({
  head: () => ({
    meta: [
      { title: "Payment Failed — Business Help Services" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
  component: FailedPageGated,
});

function FailedPage() {
  const leadCode = useCustomerLeadCode();
  const accessToken = useAccessToken(leadCode, ["co", "ob"]);
  const { reason } = Route.useSearch();
  const navigate = useNavigate();
  const getSummary = useServerFn(getApplicationSummary);
  const [allowFailureView, setAllowFailureView] = useState(false);

  const { data } = useQuery({
    queryKey: ["summary", leadCode, accessToken],
    queryFn: () => getSummary({ data: { leadCode, accessToken: accessToken as string } }),
    enabled: !!accessToken,
    retry: false,
    refetchInterval: allowFailureView ? false : 2000,
  });

  useEffect(() => {
    trackEvent("payment_failed_page_view", { leadCode, reason });
  }, [leadCode, reason]);

  useEffect(() => {
    const isPaid = !!data?.lead?.payment || PAID_STATUSES.has(data?.lead?.status);
    if (isPaid) {
      navigate({ to: "/success/$leadCode", params: { leadCode }, replace: true });
    }
  }, [data?.lead?.payment, data?.lead?.status, leadCode, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAllowFailureView(true), 12000);
    return () => window.clearTimeout(timer);
  }, [leadCode]);

  const lead = data?.lead;

  if (accessToken === null) return <SecureLinkNotice leadCode={leadCode} />;
  if (!allowFailureView) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 bg-gradient-to-b from-amber-50/40 to-slate-50">
        <div className="text-center max-w-sm">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-bold text-brand-navy font-display mb-2">Verifying payment status…</h1>
          <p className="text-sm text-slate-600">
            We are checking the final PayU confirmation before marking this transaction as failed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 bg-gradient-to-b from-red-50/40 to-slate-50">
      <div className="w-full max-w-lg">
        <Card className="overflow-hidden shadow-xl border-red-200">
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4 ring-8 ring-red-50">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-navy font-display mb-2">
              Payment Failed
            </h1>
            <p className="text-slate-600 text-sm mb-1">
              {reason || "Your payment could not be completed."} You can try again — no application is filed until payment succeeds.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Ref: <span className="font-mono font-semibold text-brand-navy">{leadCode}</span>
            </p>
          </div>

          {lead && (
            <div className="px-6 pb-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Service</span>
                  <span className="font-semibold text-brand-navy text-right">{lead.service}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-semibold text-brand-navy">
                    ₹{lead.totalAmount?.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 p-6 space-y-3">
            <Link to="/payment/$leadCode" params={{ leadCode }} className="block">
              <Button className="w-full bg-brand-red hover:bg-brand-red-deep text-white font-bold h-12 rounded-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Payment
              </Button>
            </Link>
            <Link to="/contact" className="block">
              <Button variant="outline" className="w-full rounded-full">
                <MessageCircle className="w-4 h-4 mr-2" />
                Contact Support
              </Button>
            </Link>
            <div className="flex items-start gap-2 pt-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                If any amount was debited from your account, it will be auto-refunded by your bank within 3–5 business days.
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function FailedPageGated() {
  return (
    <CustomerRefGate>
      <FailedPage />
    </CustomerRefGate>
  );
}
