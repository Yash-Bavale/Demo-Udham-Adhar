import { CustomerRefGate, useCustomerLeadCode } from "@/components/site/CustomerRefGate";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  PhoneCall,
  Sparkles,
  Copy,
  CheckCheck,
  Clock,
  Building2,
} from "lucide-react";
import { z } from "zod";
import { getOnboarding } from "@/lib/onboarding/onboarding.functions";
import { useOnboardingAccess } from "@/hooks/useOnboardingAccess";

export const Route = createFileRoute("/onboarding/$leadCode/done")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ help: z.coerce.number().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Form Submitted Successfully — Business Help Services" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: DonePageGated,
});

function DonePage() {
  const leadCode = useCustomerLeadCode();
  const { help } = Route.useSearch();
  const helpMode = help === 1;
  const fetchFn = useServerFn(getOnboarding);
  const accessToken = useOnboardingAccess(leadCode);
  const { data } = useQuery({
    queryKey: ["onboarding", leadCode, accessToken],
    queryFn: () => fetchFn({ data: { leadCode, accessToken: accessToken as string } }),
    enabled: !!accessToken,
    retry: false,
  });

  const [copied, setCopied] = useState(false);

  const copyReference = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(leadCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,#ecfdf5_0%,#f8fafc_40%,#ffffff_100%)] text-slate-800 flex flex-col justify-between antialiased selection:bg-teal-100 selection:text-teal-900 py-8 md:py-14 px-4 sm:px-6">
      <main className="w-full max-w-4xl mx-auto flex-grow flex flex-col items-center">
        <section
          className="w-full bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05),0_0_25px_-5px_rgba(20,184,166,0.08)] overflow-hidden"
          data-purpose="confirmation-card"
        >
          <div className="p-6 sm:p-10 md:p-12">
            {/* Hero Success Badge */}
            <div className="text-center max-w-2xl mx-auto">
              <div className="relative inline-flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full bg-teal-400/25 blur-xl scale-125 pointer-events-none" />
                {helpMode ? (
                  <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-8 ring-indigo-50">
                    <PhoneCall className="w-10 h-10 md:w-12 md:h-12 text-white" />
                  </div>
                ) : (
                  <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-teal-500/30 ring-8 ring-teal-50">
                    <Check className="w-10 h-10 md:w-12 md:h-12 text-white stroke-[2.5]" />
                  </div>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0f1f38] tracking-tight mb-3">
                {helpMode ? "We'll Call You Shortly" : "Your Information Is Submitted Successfully"}
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl mx-auto">
                {helpMode
                  ? "Our expert is reaching out to help you submit the form. We will call you on your registered mobile number as soon as possible."
                  : "We have received your details successfully. Our team will call you on your registered mobile number to process your application."}
              </p>

              {/* Copyable Reference Pill */}
              <div
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200/80 rounded-full text-xs sm:text-sm text-slate-700 shadow-xs"
                data-purpose="reference-pill"
              >
                <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  Reference: <strong className="text-[#0f1f38] tracking-wide font-bold">{leadCode}</strong>
                </span>
                <button
                  type="button"
                  onClick={copyReference}
                  className="ml-1 text-slate-400 hover:text-teal-600 transition-colors p-1 rounded hover:bg-slate-200/50 cursor-pointer"
                  title="Copy Reference Number"
                >
                  {copied ? (
                    <CheckCheck className="w-4 h-4 text-teal-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                {copied && <span className="text-xs text-teal-600 font-medium">Copied!</span>}
              </div>
            </div>

            {/* SLA and Business Hours Grid */}
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              {/* Card 1: Processing SLA */}
              <div className="bg-gradient-to-br from-teal-50/60 to-white border border-teal-100 rounded-2xl p-5 flex items-start gap-4 shadow-xs hover:border-teal-200 transition text-left">
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Processing &amp; Delivery</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Within <strong className="text-[#0f1f38] font-semibold">24–48 business hours</strong> after the required verification process is completed.
                  </p>
                </div>
              </div>

              {/* Card 2: Operating Hours */}
              <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4 shadow-xs hover:border-slate-300 transition text-left">
                <div className="w-12 h-12 rounded-xl bg-[#0f1f38]/10 text-[#0f1f38] flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Business Operating Hours</h3>
                  <div className="text-sm text-slate-600 mt-1 font-medium text-[#0f1f38]">
                    Monday – Saturday
                    <div className="font-bold">10:00 AM – 6:00 PM IST</div>
                  </div>
                  <div className="mt-3 inline-flex items-center text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200/60 px-2.5 py-0.5 rounded-md">
                    Sunday &amp; National Holidays: Closed
                  </div>
                </div>
              </div>
            </div>

            {/* Next Steps Section */}
            <div className="mt-10 pt-8 border-t border-slate-100 text-left">
              <h3 className="text-base font-bold text-[#0f1f38] tracking-tight mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
                What happens next?
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Step Card 1 */}
                <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0f1f38] text-white text-xs font-bold mb-2">
                      1
                    </span>
                    <h4 className="text-sm font-semibold text-slate-800">Verification Call</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-normal">
                      Keep your registered mobile phone handy. Our executive will reach out to verify documents.
                    </p>
                  </div>
                </div>

                {/* Step Card 2 */}
                <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0f1f38] text-white text-xs font-bold mb-2">
                      2
                    </span>
                    <h4 className="text-sm font-semibold text-slate-800">Application Processing</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-normal">
                      Your certificate submission is lodged directly with the authorized department.
                    </p>
                  </div>
                </div>

                {/* Step Card 3 */}
                <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0f1f38] text-white text-xs font-bold mb-2">
                      3
                    </span>
                    <h4 className="text-sm font-semibold text-slate-800">Digital Delivery</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-normal">
                      Received directly via Email in verified official PDF format.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#0f1f38] hover:bg-[#172e4d] text-white font-medium text-sm text-center shadow-md focus:ring-4 focus:ring-slate-300 transition-all duration-200"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function DonePageGated() {
  return (
    <CustomerRefGate>
      <DonePage />
    </CustomerRefGate>
  );
}
