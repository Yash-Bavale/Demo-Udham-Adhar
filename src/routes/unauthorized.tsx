// Shown when a signed-in user lacks any staff role for the admin area.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/unauthorized")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Unauthorized — Business Help Services" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  useEffect(() => { /* no-op */ }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8F4] p-6">
      <div className="max-w-md w-full rounded-2xl bg-white shadow-xl p-8 text-center border border-slate-200">
        <div className="mx-auto size-14 rounded-full bg-red-50 flex items-center justify-center text-red-600 text-2xl">!</div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are signed in, but your account does not have permission to access the admin area.
          Contact your administrator if you believe this is an error.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            to="/"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Go to website
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/admin-login";
            }}
            className="rounded-xl bg-[#0F1F3D] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
