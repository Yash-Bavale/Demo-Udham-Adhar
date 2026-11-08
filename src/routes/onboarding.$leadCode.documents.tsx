import { CustomerRefGate, useCustomerLeadCode } from "@/components/site/CustomerRefGate";
import { useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getOnboarding } from "@/lib/onboarding/onboarding.functions";
import { useOnboardingAccess } from "@/hooks/useOnboardingAccess";
import { SecureLinkNotice } from "@/components/site/SecureLinkNotice";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { DocumentUploader } from "@/components/onboarding/DocumentUploader";

export const Route = createFileRoute("/onboarding/$leadCode/documents")({
  head: () => ({
    meta: [
      { title: "Upload documents — Business Help Services" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: DocsPageGated,
});

function DocsPage() {
  const leadCode = useCustomerLeadCode();
  const navigate = useNavigate();
  const fetchFn = useServerFn(getOnboarding);

  const accessToken = useOnboardingAccess(leadCode);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["onboarding", leadCode, accessToken],
    queryFn: () => fetchFn({ data: { leadCode, accessToken: accessToken as string } }),
    enabled: !!accessToken,
    retry: false,
  });

  const hasNoDocuments = data ? (data.schema.documents?.length ?? 0) === 0 : false;

  useEffect(() => {
    if (!hasNoDocuments) return;
    navigate({ to: "/onboarding/$leadCode/done", params: { leadCode }, replace: true });
  }, [hasNoDocuments, leadCode, navigate]);

  if (accessToken === null || isError) return <SecureLinkNotice leadCode={leadCode} />;
  if (accessToken === undefined || isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  // If this service requires no documents at all, skip straight to done.
  if (hasNoDocuments) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  const requiredDocs = data.schema.documents.filter((d) => d.required);
  const allRequiredUploaded = requiredDocs.every((d) =>
    data.documents.some((u) => u.doc_type === d.key),
  );

  const instructions = data.schema.documentsInstructions;

  return (
    <OnboardingShell
      leadCode={leadCode}
      step={2}
      totalSteps={3}
      title="Upload supporting documents"
      subtitle="Clear photos or scans only. Max 5 MB each. PDF, JPG, PNG or WEBP."
    >
      {instructions && (instructions.lines.length > 0 || instructions.downloadUrl) && (
        <div className="mb-5 rounded-xl border-2 border-red-300 bg-red-50 p-4 space-y-3">
          <p className="text-sm font-bold text-red-700 uppercase tracking-wide">
            Please read carefully
          </p>
          {instructions.lines.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-sm text-red-700 font-medium">
              {instructions.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {instructions.downloadUrl && (
            <a
              href={instructions.downloadUrl}
              download
              className="inline-flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 text-sm transition-colors"
            >
              ⬇ {instructions.downloadLabel ?? "Download Standard Form"}
            </a>
          )}
        </div>
      )}

      <DocumentUploader
        leadCode={leadCode}
        docs={data.schema.documents}
        existing={data.documents}
        onChanged={async () => { await refetch(); }}
      />

      <div className="flex flex-col-reverse sm:flex-row gap-3 justify-between items-stretch sm:items-center pt-6 mt-6 border-t border-border">
        <Link
          to="/onboarding/$leadCode"
          params={{ leadCode }}
          className="text-sm text-brand-navy hover:underline text-center sm:text-left"
        >
          ← Edit details
        </Link>
        <button
          disabled={!allRequiredUploaded && requiredDocs.length > 0}
          onClick={() => {
            toast.success("Documents step completed");
            navigate({ to: "/onboarding/$leadCode/done", params: { leadCode }, replace: true });
          }}
          className="rounded-full bg-brand-navy hover:bg-brand-navy-deep text-white font-semibold px-8 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {requiredDocs.length === 0 || allRequiredUploaded ? "Continue" : "Upload required documents to continue"}
        </button>
      </div>
    </OnboardingShell>
  );
}

function DocsPageGated() {
  return (
    <CustomerRefGate>
      <DocsPage />
    </CustomerRefGate>
  );
}
