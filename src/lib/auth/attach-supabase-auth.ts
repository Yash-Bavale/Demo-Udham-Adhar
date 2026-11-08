import { createMiddleware } from "@tanstack/react-start";

/**
 * Project-specific replacement for the generated `attachSupabaseAuth`.
 *
 * Attaches the Supabase bearer token to every server function RPC. The auth
 * SDK is imported lazily so public pages never download it.
 *
 * If the browser's login has been ended (expired, revoked by an admin force
 * logout, or signed out in another tab), the refresh token no longer exists
 * and every staff action would fail with "No authorization header provided".
 * Instead of letting staff click buttons that silently fail, we send them to
 * the login page with a clear message.
 */
let redirecting = false;

export const attachSupabaseAuthLazy = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    const expiresAt = data.session?.expires_at ?? 0;
    // Refresh if missing or about to expire (tab was asleep / laptop resumed).
    if (!token || expiresAt * 1000 < Date.now() + 30_000) {
      for (let i = 0; i < 2 && !token; i++) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token;
        if (!token && i === 0) await new Promise((r) => setTimeout(r, 500));
      }
      if (!token && data.session?.access_token && expiresAt * 1000 > Date.now()) {
        token = data.session.access_token;
      }
    }
    if (!token && typeof window !== "undefined" && !redirecting) {
      const path = window.location.pathname;
      if (path.startsWith("/admin") && !path.startsWith("/admin-login")) {
        redirecting = true;
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        alert("Your login session has ended. Please sign in again to continue.");
        window.location.href = "/admin-login";
      }
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
