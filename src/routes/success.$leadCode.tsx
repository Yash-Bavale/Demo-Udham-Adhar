import { CustomerRefGate, useCustomerLeadCode } from "@/components/site/CustomerRefGate";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, FileCheck2, Sparkles, CheckCircle2, Mail, History } from "lucide-react";
import { getApplicationSummary } from "@/lib/payments/gateways.functions";
import { useAccessToken, markConversionOnce } from "@/lib/security/customer-access-browser";
import { SecureLinkNotice } from "@/components/site/SecureLinkNotice";
import { trackEvent } from "@/lib/analytics/track";
import { Button } from "@/components/ui/button";
import { TrustBlock } from "@/components/site/TrustBlock";
import { CountdownCard, type CountdownStep } from "@/components/site/CountdownCard";

export const Route = createFileRoute("/success/$leadCode")({
  head: () => ({
    meta: [
      { title: "Payment Successful — Business Help Services" },
      { name: "description", content: "Your payment was received successfully." },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SuccessPageGated,
});

const PAID_STATUSES = new Set(["payment_successful", "under_process", "completed"]);
const TOTAL_SECONDS = 60;

const STEPS: readonly CountdownStep[] = [
  { at: 0,  icon: CheckCircle2, label: "Payment received",            sub: "Transaction confirmed with your bank" },
  { at: 10, icon: ShieldCheck,  label: "Securing your details",       sub: "Encrypting personal information" },
  { at: 22, icon: FileCheck2,   label: "Generating tax invoice",      sub: "Preparing GST-compliant invoice" },
  { at: 36, icon: Mail,         label: "Sending confirmation email",  sub: "Invoice attached to your inbox" },
  { at: 48, icon: Sparkles,     label: "Finalising your application", sub: "Routing to onboarding…" },
] as const;

function SuccessPage() {
  const leadCode = useCustomerLeadCode();
  const accessToken = useAccessToken(leadCode, ["co", "ob"]);
  const [denied, setDenied] = useState(false);
  const navigate = useNavigate();
  const getSummary = useServerFn(getApplicationSummary);

  const [elapsed, setElapsed] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    trackEvent("payment_success_page_view", {});
    let cancelled = false;
    (async () => {
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const res = await getSummary({ data: { leadCode, accessToken } });
          if (cancelled) return;
          const isPaid = !!res?.lead?.payment || PAID_STATUSES.has(res?.lead?.status);
          if (isPaid) {
            setConfirmed(true);
            const val = Number(res?.lead?.totalAmount || 0);

            // Conversions fire only after the server confirmed a verified
            // payment for this customer's own link, and only once per order.
            if (!markConversionOnce(leadCode)) return;

            // Push to GTM dataLayer — triggers "payment_success" custom event in GTM
            if (typeof window !== "undefined") {
              (window as any).dataLayer = (window as any).dataLayer || [];
              (window as any).dataLayer.push({
                event: "payment_success",
                lead_code: leadCode,
                value: val,
                currency: "INR",
              });

              // Fire direct Google Ads payment conversion with label DZTRCPqjvdwcEOOzuadE
              if ((window as any).gtag) {
                (window as any).gtag("event", "conversion", {
                  send_to: "AW-18336340451/DZTRCPqjvdwcEOOzuadE",
                  value: val,
                  currency: "INR",
                  transaction_id: leadCode,
                });
              }
            }
            return;
          }
        } catch (err: any) {
          // "Application not found" can happen transiently right after redirect
          // while the webhook is still writing. Keep polling silently; only
          // surface real failures after several consecutive errors.
          if (cancelled) return;
          const msg = String(err?.message ?? "");
          if (/invalid or has expired|Too many attempts/i.test(msg)) {
            setDenied(true);
            return;
          }
          if (!/not found/i.test(msg) && attempt >= 5) {
            setError(msg || "Failed to load details");
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadCode, getSummary, accessToken]);


  // Local countdown — independent of confirmation polling.
  useEffect(() => {
    if (elapsed >= TOTAL_SECONDS) {
      if (confirmed) {
        navigate({ to: "/onboarding/$leadCode", params: { leadCode }, replace: true });
      }
      return;
    }
    const t = setTimeout(() => setElapsed((s) => s + 1), 1000);
    return () => clearTimeout(t);
  }, [elapsed, confirmed, leadCode, navigate]);

  // If confirmed after countdown ended, redirect immediately.
  useEffect(() => {
    if (confirmed && elapsed >= TOTAL_SECONDS) {
      navigate({ to: "/onboarding/$leadCode", params: { leadCode }, replace: true });
    }
  }, [confirmed, elapsed, leadCode, navigate]);

  if (accessToken === null || denied) return <SecureLinkNotice leadCode={leadCode} />;

  if (error) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <History className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-brand-navy mb-2">Something went wrong</h2>
          <p className="text-slate-600 text-sm mb-6">{error}</p>
          <Button className="bg-brand-navy" onClick={() => window.location.reload()}>
            Try Refreshing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <CountdownCard
        totalSeconds={TOTAL_SECONDS}
        elapsed={elapsed}
        steps={STEPS}
        leadCode={leadCode}
        holdLabel={confirmed ? "Redirecting to your application…" : "Waiting for bank confirmation…"}
        holdSub={confirmed ? "All set — taking you to the next step" : "This usually takes a few more seconds"}
      />
      <TrustBlock />
    </div>
  );
}

function SuccessPageGated() {
  return (
    <CustomerRefGate>
      <SuccessPage />
    </CustomerRefGate>
  );
}
