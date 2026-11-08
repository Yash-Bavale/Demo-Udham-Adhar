import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logLoginAttempt, verifyGoogleStaffAccess } from "@/lib/crm/employee-sessions.functions";
import { getOrCreateSessionId } from "@/hooks/useEmployeePresence";
import { Button } from "@/components/ui/button";
import officeBg from "@/assets/login-office-bg.png.asset.json";

/** Only allow same-origin relative paths as a post-login redirect target. */
function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export const Route = createFileRoute("/admin-login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Admin Sign In — Business Help Services" },
      { name: "description", content: "Sign in to the Business Help Services employee CRM and operations portal." },
      { property: "og:title", content: "Admin Sign In — Business Help Services" },
      { property: "og:description", content: "Sign in to the Business Help Services employee CRM and operations portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goAfterAuth = () => {
    const stored = safeNext(sessionStorage.getItem("admin_login_next"));
    sessionStorage.removeItem("admin_login_next");
    const target = safeNext(next) || stored;
    window.location.href = target || "/admin";
  };

  // Check auth state on load
  useEffect(() => {
    let cancelled = false;

    const checkAndRedirect = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled || error || !data.user) return;

      try {
        // Verify staff access
        const verification = await verifyGoogleStaffAccess();
        if (!verification.authorized) {
          setError("Your account is not authorized to access this CRM. Contact your administrator.");
          await supabase.auth.signOut();
          return;
        }

        // Initialize session record
        const sessionId = getOrCreateSessionId();
        await logLoginAttempt({
          data: {
            sessionId,
            loginMethod: data.user.app_metadata?.provider === "google" ? "google" : "password",
            browser: "Chrome",
            os: "Windows",
            deviceType: "Desktop",
          },
        });

        goAfterAuth();
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to verify CRM authorization");
      }
    };

    checkAndRedirect();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        await checkAndRedirect();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const verification = await verifyGoogleStaffAccess();
      if (!verification.authorized) {
        setError("Your account is not authorized to access this CRM.");
        await supabase.auth.signOut();
        return;
      }

      const sessionId = getOrCreateSessionId();
      await logLoginAttempt({
        data: {
          sessionId,
          loginMethod: "password",
          browser: "Chrome",
          os: "Windows",
          deviceType: "Desktop",
        },
      });

      goAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      // Preserve any intended destination across the OAuth round-trip.
      const target = safeNext(next);
      if (target) sessionStorage.setItem("admin_login_next", target);
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin-login`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthErr) throw oauthErr;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google authentication failed");
      setGoogleBusy(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen items-start justify-center overflow-hidden bg-background px-4 pb-10 pt-[16vh] text-foreground md:px-8">
      <img src={officeBg.url} alt="" aria-hidden="true" width={1672} height={941} className="absolute inset-0 -z-20 h-full w-full object-cover object-[44%_center]" />
      <div className="absolute inset-0 -z-10 bg-foreground/10 max-md:bg-foreground/35" />

      <section className="w-full max-w-[370px] overflow-hidden rounded-lg bg-card shadow-2xl md:-translate-x-[4%]" aria-label="Staff sign in">
        <div className="space-y-4 px-7 pb-5 pt-5">
          <h1 className="text-base font-bold text-foreground">Staff Sign In</h1>


          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleBusy || busy}
            variant="outline"
            className="h-9 w-full rounded-md border-border bg-card text-xs font-semibold text-foreground shadow-none hover:bg-muted"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>{googleBusy ? "Connecting to Google…" : "Continue with Google"}</span>
          </Button>

          <div className="flex items-center gap-3 text-center text-[10px] font-medium uppercase text-muted-foreground">
            <span className="h-px flex-1 bg-border" />Or sign in with password<span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="staff-email" className="mb-1 block text-[11px] font-semibold text-foreground">
                Email / Employee ID
              </label>
              <input
                id="staff-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="grow@businesshelpservices.com"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="staff-password" className="mb-1 block text-[11px] font-semibold text-foreground">
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={busy || googleBusy}
              className="h-9 w-full rounded-md bg-foreground text-xs font-semibold text-background hover:bg-foreground/90"
            >
              {busy ? "Signing in…" : "Sign In with Password"}
            </Button>
          </form>

        </div>
      </section>


    </main>
  );
}
