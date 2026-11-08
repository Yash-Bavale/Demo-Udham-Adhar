import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// A published deploy replaces hashed JS chunks. Tabs left open on an older
// build fail with "Failed to fetch dynamically imported module" when they
// lazily load a route. Recover by reloading once to pick up the new build.
if (typeof window !== "undefined") {
  const RELOAD_KEY = "chunk-reload-at";

  const recover = () => {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    // Avoid reload loops: at most one recovery reload per 10 seconds.
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  };

  const isChunkError = (msg?: string) =>
    !!msg &&
    (msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("error loading dynamically imported module") ||
      msg.includes("Importing a module script failed"));

  window.addEventListener("vite:preloadError", () => recover());
  window.addEventListener("error", (e) => {
    if (isChunkError(e.message)) recover();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    if (isChunkError(typeof reason === "string" ? reason : reason?.message)) {
      recover();
    }
  });
}


export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
