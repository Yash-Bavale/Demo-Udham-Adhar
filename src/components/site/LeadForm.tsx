import { useEffect, useId, useMemo, useRef, useState } from "react";
import { storeAccessToken } from "@/lib/security/customer-access-browser";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createLead } from "@/lib/leads.functions";
import { listActiveServiceCodes } from "@/lib/crm/services-admin.functions";
import { SERVICES, INDIAN_STATES, LANGUAGES } from "@/lib/constants";
import { trackEvent } from "@/lib/analytics/track";

export function LeadForm({ title = "Fill application" }: { title?: string } = {}) {
  const navigate = useNavigate();
  const submitLead = useServerFn(createLead);
  const fetchActiveCodes = useServerFn(listActiveServiceCodes);
  const baseId = useId();

  const [activeServices, setActiveServices] = useState<Array<{ code: string; name: string }> | null>(null);
  useEffect(() => {
    fetchActiveCodes()
      .then((r) => setActiveServices(r.services ?? r.codes.map((c: string) => ({ code: c, name: c }))))
      .catch(() => setActiveServices(null));
  }, [fetchActiveCodes]);
  const visibleServices = useMemo(() => {
    if (activeServices && activeServices.length > 0) {
      // Prefer live DB names; fall back to static label if a code matches SERVICES.
      return activeServices.map((s) => {
        const staticMatch = SERVICES.find((x) => x.slug === s.code);
        return { slug: s.code, label: s.name || staticMatch?.label || s.code };
      });
    }
    return SERVICES.map((s) => ({ slug: s.slug, label: s.label }));
  }, [activeServices]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const startedRef = useRef(false);

  function onFirstInteract() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackEvent("form_started");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    const fd = new FormData(e.currentTarget);
    const sourcePage =
      typeof window !== "undefined"
        ? (window.location.pathname + window.location.search).slice(0, 240)
        : undefined;
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      mobile: String(fd.get("mobile") ?? "").trim(),
      state: String(fd.get("state") ?? ""),
      language: String(fd.get("language") ?? ""),
      service: String(fd.get("service") ?? ""),
      consent: fd.get("consent") === "on",
      source_page: sourcePage,
    };

    trackEvent("form_submitted", { service: payload.service, state: payload.state });

    // Push to GTM dataLayer — triggers "form_submission" custom event in GTM
    // Note: the actual Google Ads conversion tag fires on /processing/ page
    // (where gtag.js is guaranteed loaded) — NOT here before navigation.
    if (typeof window !== "undefined") {
      (window as any).dataLayer = (window as any).dataLayer || [];
      (window as any).dataLayer.push({
        event: "form_submission",
        form_type: "lead_form",
        service: payload.service,
        state: payload.state,
      });
    }

    try {
      const lead = await submitLead({ data: payload as never });
      trackEvent("lead_created", { service: payload.service }, { lead_id: lead.leadId ?? null });
      storeAccessToken(lead.leadCode, lead.accessToken);
      navigate({
        to: "/processing/$leadCode",
        params: { leadCode: lead.leadCode },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setErr(msg);
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-full border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="bg-form-header text-white text-center py-4 px-3">
        <h2 className="text-xl font-bold font-display leading-tight">{title}</h2>
      </div>

      <form onSubmit={onSubmit} onFocus={onFirstInteract} className="p-6 md:p-8 space-y-5">
        <Field id={`${baseId}-name`} label="Applicant Name / आवेदक का नाम">
          <input id={`${baseId}-name`} name="name" required className={inputCls} placeholder="Enter Applicant Name" />
        </Field>

        <Field id={`${baseId}-email`} label="Email / ईमेल">
          <input id={`${baseId}-email`} name="email" type="email" required className={inputCls} placeholder="Enter your email" />
        </Field>

        <Field id={`${baseId}-mobile`} label="Mobile No / मोबाइल नंबर">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-foreground/80 font-medium">
              +91
            </span>
            <input
              id={`${baseId}-mobile`}
              name="mobile" required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10}
              className={`${inputCls} pl-14`} placeholder="Enter 10-digit mobile number"
            />
          </div>
        </Field>

        <Field id={`${baseId}-state`} label="State / राज्य">
          <select id={`${baseId}-state`} name="state" required defaultValue="" className={inputCls}>
            <option value="" disabled>Select Your State</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field id={`${baseId}-language`} label="Language of Assistance / सहायता की भाषा">
          <select id={`${baseId}-language`} name="language" required defaultValue="" className={inputCls}>
            <option value="" disabled>Select Language</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>

        <Field id={`${baseId}-service`} label="Reason for Help (Assistance) / सहायता का कारण">
          <select id={`${baseId}-service`} name="service" required defaultValue="" className={inputCls}>
            <option value="" disabled>Select Reason</option>
            {visibleServices.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
        </Field>


        <label htmlFor={`${baseId}-consent`} className="flex gap-3 items-start text-xs text-foreground/80 leading-relaxed">
          <input id={`${baseId}-consent`} type="checkbox" name="consent" required className="mt-1 h-5 w-5 shrink-0 accent-brand-navy-deep border-2 border-brand-navy-deep rounded-sm cursor-pointer" style={{ accentColor: '#0a1f44' }} />
          <span>
            I confirm that I have read and agreed to all applicable{" "}
            <a href="/terms-conditions" className="text-brand-navy underline">Terms &amp; Conditions</a>,{" "}
            <a href="/privacy-policy" className="text-brand-navy underline">Privacy Policy</a>,{" "}
            <a href="/refund-cancellation-policy" className="text-brand-navy underline">Refund &amp; Cancellation Policy</a>,{" "}
            <a href="/disclaimer" className="text-brand-navy underline">Disclaimer</a>,{" "}
            <a href="/pricing-transparency" className="text-brand-navy underline">Pricing Transparency</a>,{" "}
            <a href="/consent-acknowledgment" className="text-brand-navy underline">Consents and Acknowledgements</a>{" "}
            and related service policies of this website.
          </span>
        </label>

        {err && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-brand-navy hover:bg-brand-navy-deep text-white font-semibold py-3 transition-colors disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
}

function Field({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
