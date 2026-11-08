import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isAbortError } from "./lib/abort-error";
import { decideHostRouting } from "./lib/hosts.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(request: Request, response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  if (request.signal.aborted) {
    return new Response(null, { status: 499, statusText: "Client Closed Request" });
  }

  const captured = consumeLastCapturedError();
  if (!captured || isAbortError(captured)) {
    return response;
  }

  const stack = captured instanceof Error ? captured.stack : undefined;
  console.error("[ssr-500]", stack ?? captured ?? `h3 swallowed SSR error: ${body}`);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const PRIMARY_HOST = "udyamadhar.in";

/**
 * Secondary domains (udyamregistrations.in, …) render the same components, but
 * a lot of SEO metadata (canonical, og:url, JSON-LD) is hardcoded to the
 * primary host. Rewriting those absolute URLs to the requesting host keeps each
 * domain self-canonical instead of handing its rankings to the primary site.
 */
async function rewriteHostInHtml(request: Request, response: Response): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === PRIMARY_HOST || host.includes("lovable") || host === "localhost") return response;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const origin = `${url.protocol}//${url.host}`;
  const body = html
    .split(`https://www.${PRIMARY_HOST}`)
    .join(origin)
    .split(`https://${PRIMARY_HOST}`)
    .join(origin);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const NOT_FOUND_BODY =
  '<!doctype html><html><head><meta charset="utf-8"><title>404 Not Found</title>' +
  '<meta name="robots" content="noindex,nofollow"></head>' +
  '<body style="font-family:system-ui;padding:3rem;text-align:center">' +
  "<h1>404</h1><p>Page not found.</p></body></html>";

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Hostname boundary: CRM, API and public websites each serve only their
      // own surface. Dev/preview hosts are unaffected.
      const reqUrl = new URL(request.url);
      const decision = decideHostRouting(reqUrl.hostname, reqUrl.pathname);
      if (decision.action === "redirect") {
        return new Response(null, { status: 302, headers: { Location: decision.location } });
      }
      if (decision.action === "notFound") {
        return new Response(NOT_FOUND_BODY, {
          status: 404,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-robots-tag": "noindex, nofollow",
          },
        });
      }

      const safeCtx =
        ctx && typeof ctx === "object" && typeof (ctx as { waitUntil?: unknown }).waitUntil === "function"
          ? ctx
          : { ...(ctx && typeof ctx === "object" ? ctx : {}), waitUntil: () => undefined };
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, safeCtx);
      const normalized = await normalizeCatastrophicSsrResponse(request, response);
      return await rewriteHostInHtml(request, normalized);
    } catch (error) {
      if (isAbortError(error)) {
        return new Response(null, { status: 499, statusText: "Client Closed Request" });
      }
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
