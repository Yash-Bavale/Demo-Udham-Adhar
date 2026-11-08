import { useState, useEffect } from "react";
import { toast } from "sonner";
import { INDIAN_STATES, LANGUAGES } from "@/lib/constants";
import { Mail, Phone, MapPin, Clock, ShieldAlert } from "lucide-react";
import { trackEvent } from "@/lib/analytics/track";
import { formatIST } from "@/lib/datetime";
import policyHtml from "@/content/wp/grievance-redressal-policy.html?raw";

export function ComplaintFormPage() {
  const [submitted, setSubmitted] = useState<{ complaintNumber: string; submittedAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const inputCls =
    "w-full rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 font-medium focus:outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 shadow-sm transition-colors";

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
      application_ref: String(fd.get("application_ref") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
    };
    try {
      const res = await fetch("/api/public/complaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Could not submit (status ${res.status}). Please try again.`);
      }
      setSubmitted({
        complaintNumber: json.complaintNumber || "submitted",
        submittedAt: json.submittedAt || new Date().toISOString(),
      });
      toast.success("Complaint recorded. We'll review it shortly.");
      trackEvent("complaint_form_submitted", { state: payload.state });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error. Please check your connection and try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:py-12 grid gap-8 lg:grid-cols-2 items-start">
      {/* Left: intro + contact details */}
      <div className="space-y-5 text-slate-800 dark:text-slate-200 text-base leading-relaxed">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-navy/10 dark:bg-brand-navy/30 px-4 py-1.5 text-sm font-bold text-brand-navy dark:text-sky-300">
          <ShieldAlert className="size-4" /> Official Grievance Portal
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold font-display text-slate-900 dark:text-white tracking-tight">
          File a Complaint — Business Help Services
        </h1>
        <p className="font-medium text-slate-700 dark:text-slate-300">
          Welcome to the Business Help Services Complaint & Grievance Redressal Desk.
        </p>
        <p>
          We take user feedback, operational difficulties, and service complaints with utmost seriousness. Our team is dedicated to providing transparent, fair, and prompt resolution for any concern regarding your application or consultancy services.
        </p>
        <p>
          If you are facing any delays, verification issues, or service dissatisfaction, please fill out the complaint form below or reach our team directly using the details provided.
        </p>

        {/* Live IST Time & Working Hours Desk Card */}
        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 dark:bg-slate-900/60 dark:border-slate-800 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-brand-navy dark:text-sky-400 font-bold text-sm sm:text-base">
              <Clock className="w-5 h-5 text-brand-navy shrink-0 animate-pulse" />
              Current IST Time:
            </span>
            <span className="font-mono text-sm sm:text-base bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-extrabold shadow-xs">
              {formatIST(now, { timeOnly: true })} IST
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-semibold pt-2 border-t border-slate-200 dark:border-slate-800 gap-1">
            <span>Working Hours: 10:00 AM to 05:00 PM (IST)</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-300 self-start sm:self-auto">
              Desk Active
            </span>
          </div>
        </div>

        <ul className="space-y-4 pt-2">
          <li className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <span className="text-slate-800 dark:text-slate-200">
              <strong className="text-slate-900 dark:text-white font-bold">Working Hours:</strong>{" "}
              <span>10:00 AM to 05:00 PM (IST) (Sunday &amp; Public Holidays off)</span>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <a href="mailto:help@businesshelpservices.com" className="text-brand-navy dark:text-sky-400 font-bold hover:underline">
              <strong>Email:</strong>{" "}
              <span>help@businesshelpservices.com</span>
            </a>
          </li>
          <li className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <a href="tel:+919767870331" className="text-brand-navy dark:text-sky-400 font-bold hover:underline">
              <strong>Phone:</strong>{" "}
              <span>+91-9767870331</span>
            </a>
          </li>
          <li className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-brand-navy mt-0.5 shrink-0" />
            <span className="text-slate-800 dark:text-slate-200">
              <strong className="text-slate-900 dark:text-white font-bold">Address:</strong>{" "}
              <span>Koregaon Bk, Khed, Pune, Maharashtra – 410505, India</span>
            </span>
          </li>
        </ul>
      </div>

      {/* Right: complaint form card */}
      <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-card shadow-md overflow-hidden">
        <div className="bg-brand-navy text-white text-center py-4 px-6">
          <h2 className="text-xl md:text-2xl font-bold font-display tracking-wide">Complaint Form</h2>
        </div>

        {submitted ? (
          <div className="p-6 md:p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">Complaint Recorded!</p>
            <p className="text-base font-medium text-slate-700 dark:text-slate-300">
              Your complaint reference ticket number:
            </p>
            <p className="text-xl font-mono font-extrabold text-brand-navy dark:text-sky-400 tracking-wider bg-slate-100 dark:bg-slate-800 py-2.5 px-5 rounded-xl border border-slate-300 dark:border-slate-700 inline-block shadow-xs">
              {submitted.complaintNumber}
            </p>
            <div className="block pt-1">
              <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-300 dark:border-emerald-700 px-5 py-3 text-sm sm:text-base font-mono font-bold text-emerald-950 dark:text-emerald-200 shadow-sm">
                <Clock className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                Submitted Time: {formatIST(submitted.submittedAt)}
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
              A confirmation email has been sent to you. Our grievance team will review your case and respond within working hours.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="p-6 md:p-8 space-y-6">
            <Field label="Applicant Name / आवेदक का नाम" htmlFor="complaint-name">
              <input
                id="complaint-name"
                name="name"
                required
                maxLength={120}
                className={inputCls}
                placeholder="Enter Applicant Name"
              />
            </Field>

            <Field label="Email / ईमेल" htmlFor="complaint-email">
              <input
                id="complaint-email"
                name="email"
                type="email"
                required
                maxLength={160}
                className={inputCls}
                placeholder="Enter your email address"
              />
            </Field>

            <Field label="Mobile No / मोबाइल नंबर" htmlFor="complaint-mobile">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-base text-slate-900 font-bold">
                  +91
                </span>
                <input
                  id="complaint-mobile"
                  name="mobile"
                  required
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  className={`${inputCls} pl-14`}
                  placeholder="Enter 10-digit mobile number"
                />
              </div>
            </Field>

            <Field label="State / राज्य" htmlFor="complaint-state">
              <select id="complaint-state" name="state" required defaultValue="" className={inputCls}>
                <option value="" disabled>Select Your State</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Language / भाषा" htmlFor="complaint-language">
              <select id="complaint-language" name="language" required defaultValue="" className={inputCls}>
                <option value="" disabled>Select Language</option>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>

            <Field label="Application / Order Reference (Optional)" htmlFor="complaint-ref">
              <input
                id="complaint-ref"
                name="application_ref"
                maxLength={80}
                className={inputCls}
                placeholder="e.g. APP-2026-12345 (if any)"
              />
            </Field>

            <Field label="Complaint / तक्रार" htmlFor="complaint-message">
              <textarea
                id="complaint-message"
                name="message"
                required
                rows={5}
                minLength={10}
                maxLength={2000}
                className="w-full rounded-2xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 font-medium focus:outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 shadow-sm"
                placeholder="Please describe your complaint or grievance in detail…"
              />
            </Field>

            {error && (
              <p className="text-sm font-semibold text-red-600 -mt-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-brand-navy hover:bg-brand-navy-deep text-white font-bold text-base py-3.5 transition-colors disabled:opacity-60 shadow-md"
            >
              {busy ? "Submitting…" : "SUBMIT COMPLAINT"}
            </button>
          </form>
        )}
      </div>

      {/* Full-width: info blocks, support details, policy */}
      <div className="lg:col-span-2 space-y-10 mt-4">
        <InfoBlock title="Grievance Handling & Resolution">
          <ul>
            <li>Every complaint received is assigned a unique reference ticket ID for transparent tracking.</li>
            <li>Our internal compliance officer reviews grievance details within 24 to 48 working hours.</li>
            <li>Official responses or clarification requests will be sent to your registered email address and mobile number.</li>
            <li>Support is available in Marathi, Hindi, and English.</li>
            <li>Resolution timelines depend on application stage, government portal responsiveness, and external dependencies.</li>
          </ul>
        </InfoBlock>

        <InfoBlock title="Before Filing a Complaint">
          <p>To help us resolve your issue swiftly, please keep the following details ready when submitting your grievance:</p>
          <ul>
            <li>Applicant Full Name (matching Aadhaar / Order)</li>
            <li>Registered Mobile Number & Email Address</li>
            <li>Order Number / Application Reference ID (if applicable)</li>
            <li>Payment Reference Number (if applicable)</li>
            <li>Clear description of the issue or grievance faced</li>
          </ul>
        </InfoBlock>

        <InfoBlock title="Important Disclaimer">
          <p>Business Help Services is a private consultancy and assistance service provider.</p>
          <ul>
            <li>We are an independent consultancy and not affiliated with any government authority or official department.</li>
            <li>Services provided through this Platform are consultancy and documentation assistance services.</li>
            <li>Users may also file complaints directly with respective statutory authorities wherever applicable.</li>
          </ul>
        </InfoBlock>

        <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-card p-6 md:p-8 text-center shadow-sm">
          <h3 className="text-xl md:text-2xl font-bold font-display text-slate-900 dark:text-white">
            For urgent grievance support, contact our compliance desk directly.
          </h3>
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 text-brand-navy dark:text-sky-400 font-bold text-base">
            <a href="tel:+919767870331" className="inline-flex items-center gap-2 hover:underline">
              <Phone className="w-5 h-5" /> +91-9767870331
            </a>
            <a href="mailto:help@businesshelpservices.com" className="inline-flex items-center gap-2 hover:underline">
              <Mail className="w-5 h-5" /> help@businesshelpservices.com
            </a>
          </div>
        </div>

        <div className="rounded-3xl overflow-hidden border-2 border-slate-200 dark:border-slate-800 bg-card shadow-sm">
          <div className="bg-gradient-to-br from-brand-navy to-brand-navy-deep text-white px-6 md:px-10 py-8 md:py-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider mb-3">
              <ShieldAlert className="size-3.5" /> Grievance Policy
            </div>
            <h2 className="text-2xl md:text-3xl font-bold font-display">Grievance Redressal Policy</h2>
            <p className="mt-2 text-sm md:text-base text-white/80 max-w-2xl">
              How Business Help Services receives, reviews, and resolves user complaints and grievances — fairly, transparently, and professionally.
            </p>
          </div>
          <article
            className="policy-prose px-6 md:px-10 py-8 md:py-10 prose prose-sm md:prose-base max-w-none
              prose-headings:font-display prose-headings:text-foreground
              prose-h2:hidden
              prose-h3:text-xl prose-h3:mt-0 prose-h3:mb-6 prose-h3:text-brand-navy
              prose-h4:text-lg prose-h4:mt-8 prose-h4:mb-3 prose-h4:pl-4 prose-h4:border-l-4 prose-h4:border-brand-navy prose-h4:text-foreground prose-h4:font-bold
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-li:text-muted-foreground prose-li:marker:text-brand-navy
              prose-strong:text-foreground
              prose-a:text-brand-navy prose-a:no-underline hover:prose-a:underline
              prose-ul:my-4 prose-ol:my-4"
            dangerouslySetInnerHTML={{ __html: policyHtml }}
          />
        </div>
      </div>
    </section>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-card shadow-sm overflow-hidden">
      <div className="bg-brand-navy text-white px-6 py-3.5">
        <h3 className="text-lg font-bold font-display tracking-wide uppercase">{title}</h3>
      </div>
      <div className="p-6 md:p-8 space-y-3 text-slate-800 dark:text-slate-200 text-base leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_p]:my-2 font-normal">
        {children}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
