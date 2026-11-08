import { CustomerRefGate, useCustomerLeadCode } from "@/components/site/CustomerRefGate";
import { useEffect, useState } from "react";
import { isService } from "@/lib/services/base-code";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getOnboarding, submitOnboarding } from "@/lib/onboarding/onboarding.functions";
import { useOnboardingAccess } from "@/hooks/useOnboardingAccess";
import { SecureLinkNotice } from "@/components/site/SecureLinkNotice";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export const Route = createFileRoute("/onboarding/$leadCode/")({
  head: () => ({
    meta: [
      { title: "Complete your application — Business Help Services" },
      { name: "description", content: "Complete your Business Help Services application details and activities." },
      { property: "og:title", content: "Complete your application — Business Help Services" },
      { property: "og:description", content: "Complete your Business Help Services application details and activities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: OnboardingDetailsPageGated,
});

function OnboardingDetailsPage() {
  const leadCode = useCustomerLeadCode();
  const navigate = useNavigate();
  const fetchFn = useServerFn(getOnboarding);
  const submitFn = useServerFn(submitOnboarding);
  const [submitting, setSubmitting] = useState(false);

  const accessToken = useOnboardingAccess(leadCode);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["onboarding", leadCode, accessToken],
    queryFn: () => fetchFn({ data: { leadCode, accessToken: accessToken as string } }),
    enabled: !!accessToken,
    retry: false,
  });

  if (accessToken === null || isError) return <SecureLinkNotice leadCode={leadCode} />;
  if (accessToken === undefined || isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  // Talk-to-Expert is a paid consultation — no intake form after payment.
  // Send the user straight to the thank-you screen.
  const isTalkToExpert =
    isService(data.serviceCode, "talk-to-expert") ||
    data.lead.service === "Expert Consultation" ||
    data.lead.service === "Talk to Expert – Suitable Service Selection";
  if (data.lead.paid && isTalkToExpert) {
    return <TalkToExpertRedirect leadCode={leadCode} />;
  }

  if (!data.lead.paid) {
    return (
      <OnboardingShell leadCode={leadCode} step={1} totalSteps={2} title="Payment required">
        <p className="text-sm text-foreground">
          We haven't received your consultancy fee yet. Please complete the payment first.
        </p>
        <Link
          to="/payment/$leadCode"
          params={{ leadCode }}
          className="mt-4 inline-flex rounded-full bg-brand-navy hover:bg-brand-navy-deep text-white font-semibold px-6 py-2.5"
        >
          Go to Payment
        </Link>
      </OnboardingShell>
    );
  }

  const activeSchema = data.schema;

  const initial: Record<string, string> = {};
  const existing = (data.submission?.form_data ?? {}) as Record<string, unknown>;
  const schemaKeys = new Set(activeSchema.fields.map((f) => f.key));
  for (const f of activeSchema.fields) {
    const v = existing[f.key];
    initial[f.key] = v === undefined || v === null ? "" : String(v);
  }
  initial.nic_activities = typeof existing.nic_activities === "string" ? existing.nic_activities : "";
  if (schemaKeys.has("applicant_name")) initial.applicant_name ||= data.lead.name ?? "";
  if (schemaKeys.has("aadhaar_mobile")) initial.aadhaar_mobile ||= data.lead.mobile ?? "";
  if (schemaKeys.has("registered_mobile")) {
    initial.registered_mobile ||=
      String(existing.registered_mobile ?? existing.aadhaar_mobile ?? existing.mobile ?? data.lead.mobile ?? "");
  }
  if (schemaKeys.has("registered_email")) {
    initial.registered_email ||=
      String(existing.registered_email ?? existing.email ?? data.lead.email ?? "");
  }
  if (schemaKeys.has("udyam_number")) {
    initial.udyam_number ||=
      String(existing.udyam_number ?? existing.udyam_reg_no ?? existing.uam_number ?? "");
  }
  if (schemaKeys.has("pan_number")) {
    initial.pan_number ||=
      String(existing.pan_number ?? existing.pan ?? "");
  }
  if (schemaKeys.has("pan_holder_name")) {
    initial.pan_holder_name ||=
      String(existing.pan_holder_name ?? existing.applicant_name ?? data.lead.name ?? "");
  }
  if (schemaKeys.has("business_name")) {
    initial.business_name ||=
      String(existing.business_name ?? existing.enterprise_name ?? "");
  }

  // Strip UI-only `section_*` separator keys before persistence.
  const cleanPayload = (values: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values ?? {})) {
      const def = activeSchema.fields.find((f) => f.key === k);
      if (def?.type === "section") continue;
      if (k.startsWith("section_")) continue;
      out[k] = v;
    }
    return out;
  };

  const hasRequiredDocs = (data.schema.documents ?? []).some((d) => d.required);
  const totalSteps: 2 | 3 = hasRequiredDocs ? 3 : 2;

  return (
    <OnboardingShell
      leadCode={leadCode}
      step={1}
      totalSteps={totalSteps}
      title={activeSchema.title}
      subtitle={activeSchema.description}
      sampleFormUrl={data.schema.sample_form_url}
      sampleFormLabel={data.schema.sample_form_label}
    >
      <OnboardingForm
        key="single"
        schema={activeSchema}
        initial={initial}
        busy={submitting}
        submitLabel={
          hasRequiredDocs
            ? "Save & Continue"
            : "Submit Details"
        }
        submittingLabel={
          hasRequiredDocs ? "Opening next step…" : "Submitting…"
        }
        successMessage={
          hasRequiredDocs
            ? "Details submitted. Continue to document upload…"
            : "Details submitted successfully. Finalising…"
        }
        onSaveDraft={async (values) => {
          await submitFn({ data: { leadCode, accessToken: accessToken as string, data: cleanPayload(values), draft: true } });
        }}
        onSubmit={async (values) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            await submitFn({ data: { leadCode, accessToken: accessToken as string, data: cleanPayload(values), draft: false } });
            toast.success("Details submitted successfully");
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Could not submit. Please try again.";
            toast.error(msg);
            setSubmitting(false);
            throw e;
          }
        }}
        onSubmitted={async () => {
          try {
            await navigate({
              to: hasRequiredDocs
                ? "/onboarding/$leadCode/documents"
                : "/onboarding/$leadCode/done",
              params: { leadCode },
              replace: true,
            });
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </OnboardingShell>
  );
}

function TalkToExpertRedirect({ leadCode }: { leadCode: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({
      to: "/onboarding/$leadCode/done",
      params: { leadCode },
      replace: true,
    });
  }, [leadCode, navigate]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
    </div>
  );
}

function OnboardingDetailsPageGated() {
  return (
    <CustomerRefGate>
      <OnboardingDetailsPage />
    </CustomerRefGate>
  );
}
