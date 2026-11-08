import { CustomerRefGate, useCustomerLeadCode } from "@/components/site/CustomerRefGate";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, FileCheck2, Sparkles, CheckCircle2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics/track";
import { captureAccessToken } from "@/lib/security/customer-access-browser";
import { TrustBlock } from "@/components/site/TrustBlock";
import { CountdownCard, type CountdownStep } from "@/components/site/CountdownCard";

export const Route = createFileRoute("/processing/$leadCode")({
  head: () => ({
    meta: [
      { title: "Processing Your Application — Please Wait" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ProcessingPageGated,
});

const TOTAL_SECONDS = 30;

const STEPS: readonly CountdownStep[] = [
  { at: 0,  icon: ShieldCheck,  label: "Securing your details",        sub: "Encrypting personal information" },
  { at: 8,  icon: FileCheck2,   label: "Validating application data",  sub: "Cross-checking required fields" },
  { at: 15, icon: Sparkles,     label: "Running compliance checks",    sub: "Aligning with MSME guidelines" },
  { at: 22, icon: CheckCircle2, label: "Finalising your application",  sub: "Almost done…" },
] as const;

function ProcessingPage() {
  const leadCode = useCustomerLeadCode();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    captureAccessToken(leadCode);
    trackEvent("processing_viewed", {});

    // Fire Google Ads "Lead Form Submitted" conversion here (not on form submit)
    // because gtag.js is guaranteed to be loaded by the time the user reaches
    // this page, and Tag Assistant can detect it correctly.
    if (typeof window !== "undefined") {
      // Direct gtag conversion (fires immediately once gtag.js is loaded)
      const fireConversion = () => {
        if ((window as any).gtag) {
          (window as any).gtag("event", "conversion", {
            send_to: "AW-18336340451/7BVbCOm2p9wcEOOzuadE",
          });
        }
      };
      // gtag.js might still be loading — wait up to 3s for it
      if ((window as any).gtag) {
        fireConversion();
      } else {
        const t = setTimeout(fireConversion, 2000);
        return () => clearTimeout(t);
      }
    }
  }, []);

  useEffect(() => {
    if (elapsed >= TOTAL_SECONDS) {
      navigate({ to: "/apply/$leadCode/summary", params: { leadCode }, replace: true });
      return;
    }
    const t = setTimeout(() => setElapsed((s) => s + 1), 1000);
    return () => clearTimeout(t);
  }, [elapsed, leadCode, navigate]);

  return (
    <div>
      <CountdownCard
        totalSeconds={TOTAL_SECONDS}
        elapsed={elapsed}
        steps={STEPS}
        leadCode={leadCode}
      />
      <TrustBlock />
    </div>
  );
}

function ProcessingPageGated() {
  return (
    <CustomerRefGate>
      <ProcessingPage />
    </CustomerRefGate>
  );
}
