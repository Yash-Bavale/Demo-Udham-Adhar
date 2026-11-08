import { isAbortError } from "./abort-error";

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  if (isAbortError(error)) return;

  lastCapturedError = { error, at: Date.now() };
  try {
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[ssr-capture]", stack ?? String(error));
  } catch {}
}

// Vite reports every server-side console.error as a preview runtime error.
// Filter abort errors so a normal client disconnect cannot become a false fatal error.
if (typeof console !== 'undefined') {
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => isAbortError(arg))) return;
    originalConsoleError(...args);
  };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
