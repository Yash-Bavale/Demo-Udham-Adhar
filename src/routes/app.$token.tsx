import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { resolveApplicationLink } from "@/lib/applications/links.functions";
import { storeAccessToken } from "@/lib/security/customer-access-browser";

export const Route = createFileRoute("/app/$token")({
  component: AppTokenPage,
  head: () => ({ meta: [{ title: "Application link · Business Help Services" }] }),
  errorComponent: ({ error, reset }: any) => (
    <SiteShell>
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand-navy">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={reset} className="mt-4 rounded bg-brand-navy px-4 py-2 text-sm text-white">Retry</button>
      </div>
    </SiteShell>
  ),
  notFoundComponent: () => (
    <SiteShell>
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Link not found</h1>
      </div>
    </SiteShell>
  ),
});

function AppTokenPage() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolveApplicationLink);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["app-link", token],
    queryFn: () => resolve({ data: { token } }),
    staleTime: 30_000,
  });

  // Auto-route certain purposes to their dedicated flow
  useEffect(() => {
    if (!data || !data.ok) return;
    if (data.lead?.lead_code) storeAccessToken(data.lead.lead_code, data.accessToken);
    if (data.purpose === "resume" && data.lead?.lead_code) {
      navigate({ to: "/onboarding/$leadCode", params: { leadCode: data.lead.lead_code }, replace: true });
    }
  }, [data, navigate]);

  if (isLoading) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center text-sm text-muted-foreground">Loading…</div>
      </SiteShell>
    );
  }

  if (!data?.ok) {
    const reason = data?.reason ?? "unknown";
    const labels: Record<string, string> = {
      not_found: "This link is invalid.",
      used: "This link has already been used.",
      expired: "This link has expired.",
      unknown: "This link cannot be opened.",
    };
    return (
      <SiteShell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-brand-navy">Link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{labels[reason] ?? labels.unknown}</p>
          <Link to="/" className="mt-6 inline-block text-sm text-brand-red underline">Go to home</Link>
        </div>
      </SiteShell>
    );
  }

  const { purpose, lead, application } = data;

  if (purpose === "pay" && lead?.lead_code) {
    return <Navigate to="/payment/$leadCode" params={{ leadCode: lead.lead_code }} replace />;
  }

  return (
    <SiteShell>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Secure application link</div>
          <h1 className="mt-1 text-2xl font-bold text-brand-navy">
            {lead?.name ?? "Your application"}
          </h1>
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Order</dt>
            <dd>{application?.application_code ?? lead?.lead_code}</dd>
            <dt className="text-muted-foreground">Service</dt>
            <dd>{lead?.service ?? "—"}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium capitalize">{application?.application_status?.replace(/_/g, " ") ?? lead?.status?.replace(/_/g, " ") ?? "—"}</dd>
            {application?.form_status && (<><dt className="text-muted-foreground">Form</dt><dd className="capitalize">{application.form_status}</dd></>)}
            {application?.document_status && (<><dt className="text-muted-foreground">Documents</dt><dd className="capitalize">{application.document_status}</dd></>)}
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            {purpose === "upload" && lead?.lead_code && (
              <Link to="/onboarding/$leadCode/documents" params={{ leadCode: lead.lead_code }} className="rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white">Upload documents</Link>
            )}
            {purpose === "status" && lead?.lead_code && (
              <Link to="/processing/$leadCode" params={{ leadCode: lead.lead_code }} className="rounded border border-brand-navy px-4 py-2 text-sm font-medium text-brand-navy">View live status</Link>
            )}
            {purpose === "certificate" && (
              <a href="#" onClick={(e) => { e.preventDefault(); alert("Certificate download link will be enabled after ops upload completes."); }} className="rounded bg-brand-green px-4 py-2 text-sm font-medium text-white">Download certificate</a>
            )}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
