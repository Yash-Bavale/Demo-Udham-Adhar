import { useState } from "react";
import { storeAccessToken } from "@/lib/security/customer-access-browser";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { INDIAN_STATES, LANGUAGES } from "@/lib/constants";
import { Phone, Mail, ShieldCheck, Clock, Headphones } from "lucide-react";

export const Route = createFileRoute("/talk-to-expert")({
  head: () => ({
    meta: [
      { title: "Talk to an Expert — Udyam / MSME Consultation ₹99" },
      { name: "description", content: "Stuck with an Udyam / MSME issue? Book a ₹99 consultation with our expert and get a tailored next step within working hours." },
      { property: "og:title", content: "Talk to an Expert — Business Help Services" },
      { property: "og:description", content: "Paid expert consultation for Udyam, MSME, PAN/Aadhaar and related issues. ₹99 + GST." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/talk-to-expert" },
    ],
  }),
  component: TalkToExpertPage,
});

function TalkToExpertPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-full border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      mobile: String(fd.get("mobile") ?? "").trim(),
      state: String(fd.get("state") ?? "").trim(),
      language: String(fd.get("language") ?? "").trim(),
      problem: String(fd.get("problem") ?? "").trim(),
    };
    if (typeof window !== "undefined" && (window as any).gtag_report_conversion) {
      (window as any).gtag_report_conversion();
    }

    try {
      const res = await fetch("/api/public/talk-to-expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.leadCode) {
        throw new Error(json?.error || `Could not submit (status ${res.status}).`);
      }
      storeAccessToken(json.leadCode, json.accessToken);
      toast.success("Request received — taking you to payment.");
      navigate({ to: "/apply/$leadCode/summary", params: { leadCode: json.leadCode } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error. Please try again.";
      setError(msg);
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:py-12 grid gap-8 lg:grid-cols-2 items-start">
      <div className="space-y-5 text-foreground/90 text-[15px] leading-relaxed">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-navy/10 text-brand-navy px-3 py-1 text-xs font-semibold">
          <Headphones className="w-4 h-4" /> Paid Expert Consultation
        </span>
        <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground">
          Talk to an Expert — get unstuck in one call
        </h1>
        <p>
          Whether your issue is a forgotten registered mobile, a PAN/Aadhaar
          mismatch, a Udyam re-registration, or something we haven't listed —
          a dedicated specialist will review your case and give you a clear
          next step.
        </p>

        <ul className="space-y-3 pt-2">
          <li className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <span><strong>₹99 + GST</strong> — fully adjustable against any service we deliver after the call.</span>
          </li>
          <li className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <span>Response within working hours (10:00–17:00 IST, Mon–Sat).</span>
          </li>
          <li className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <span>Consultation by phone / WhatsApp in Marathi, Hindi or English.</span>
          </li>
          <li className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <span>You'll receive a written summary on email after the call.</span>
          </li>
        </ul>

        <p className="text-xs text-muted-foreground pt-3">
          Business Help Services is a private consultancy. We are not affiliated with any government authority.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-form-header text-white text-center py-4">
          <h2 className="text-xl font-bold font-display">Book Expert Consultation</h2>
          <p className="text-xs opacity-90 mt-0.5">₹99 + GST · Pay securely via PayU</p>
        </div>

        <form onSubmit={onSubmit} className="p-6 md:p-8 space-y-5">
          <Field label="Your Name / आपका नाम">
            <input name="name" required maxLength={120} className={inputCls} placeholder="Enter your full name" />
          </Field>

          <Field label="Email / ईमेल">
            <input name="email" type="email" required maxLength={160} className={inputCls} placeholder="you@example.com" />
          </Field>

          <Field label="Mobile / मोबाइल">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-foreground/80 font-medium">+91</span>
              <input
                name="mobile" required inputMode="numeric"
                pattern="[6-9][0-9]{9}" maxLength={10}
                className={`${inputCls} pl-14`}
                placeholder="10-digit mobile"
              />
            </div>
          </Field>

          <Field label="State / राज्य">
            <select name="state" required defaultValue="" className={inputCls}>
              <option value="" disabled>Select Your State</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Preferred Language / भाषा">
            <select name="language" required defaultValue="" className={inputCls}>
              <option value="" disabled>Select Language</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>

          <Field label="What problem do you need help with? / आपकी समस्या">
            <textarea
              name="problem" required rows={5} minLength={10} maxLength={2000}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Briefly describe your situation — what you tried, error messages, what you need."
            />
          </Field>

          {error && <p className="text-sm text-red-600 -mt-2">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-brand-navy hover:bg-brand-navy-deep text-white font-semibold py-3 transition-colors disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Continue to Payment — ₹116.82"}
          </button>

          <p className="text-[11px] text-center text-muted-foreground">
            By continuing you agree to our Terms and acknowledge our Refund &amp; Cancellation policy.
          </p>
        </form>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
