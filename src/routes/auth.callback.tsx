import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * OAuth landing route for the dedicated CRM hostname
 * (https://crm.businesshelpservices.com/auth/callback).
 *
 * Supabase returns the session in the URL hash/query; the client SDK picks it
 * up on load. We then hand off to /admin-login, which performs the existing
 * staff-role verification and session logging. The previous callback
 * (/admin-login itself) keeps working unchanged.
 */
export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Signing in — Business Help Services" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  ssr: false,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  useEffect(() => {
    const { search, hash } = window.location;
    window.location.replace(`/admin-login${search}${hash}`);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <p className="text-sm text-slate-500">Signing you in…</p>
    </div>
  );
}
