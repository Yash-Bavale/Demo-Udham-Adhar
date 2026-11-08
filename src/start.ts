import { createStart, createMiddleware } from "@tanstack/react-start";
import { isAbortError } from "./lib/abort-error";
import { renderErrorPage } from "./lib/error-page";
// Lazy-loading equivalent of the generated attachSupabaseAuth (keeps the auth
// SDK out of the initial bundle).
import { attachSupabaseAuthLazy } from "@/lib/auth/attach-supabase-auth";

const errorMiddleware = createMiddleware().server(async ({ request, next }) => {
  // Bypass app middleware for internal email routes and public unsubscribe API.
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/") || url.pathname === "/email/unsubscribe") {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuthLazy],
}));
