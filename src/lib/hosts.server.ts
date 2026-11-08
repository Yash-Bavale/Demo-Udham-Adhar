/**
 * Central hostname boundary for the CRM / API / public-website separation.
 *
 * Phase 1 of the separation keeps ONE deployment and ONE database, but binds
 * each concern to its own hostname:
 *
 *   crm.businesshelpservices.com  → staff CRM only (/admin-login, /admin/*)
 *   api.businesshelpservices.com  → API + webhooks + health only (/api/*)
 *   udyamadhar.in, udyamregistrations.in, gstcertificate.in, …
 *                                 → public website + customer checkout only
 *
 * Development hosts (localhost, *.lovable.app preview/published) are
 * deliberately unrestricted so previews and local testing keep working.
 *
 * No business logic lives here — only host classification and path gating.
 */

export type HostRole = "crm" | "api" | "public" | "dev";

function envList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

function hostOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return fallback;
  }
}

/** https://crm.businesshelpservices.com — override with CRM_BASE_URL. */
export function getCrmBaseUrl(): string {
  return process.env.CRM_BASE_URL || "https://crm.businesshelpservices.com";
}

/** https://api.businesshelpservices.com — override with API_BASE_URL. */
export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || "https://api.businesshelpservices.com";
}

export function getCrmHost(): string {
  return hostOf(getCrmBaseUrl(), "crm.businesshelpservices.com");
}

export function getApiHost(): string {
  return hostOf(getApiBaseUrl(), "api.businesshelpservices.com");
}

/**
 * Configured customer website hostnames. Driven by PUBLIC_HOSTS when set;
 * otherwise the domains already configured in this project. `www.` variants
 * are matched automatically, so they don't need listing.
 */
export function getPublicHosts(): string[] {
  const configured = envList("PUBLIC_HOSTS");
  if (configured.length) return configured;
  return ["udyamadhar.in", "udyamregistrations.in", "gstcertificate.in"];
}

/** Hosts that must never be gated: local dev and Lovable preview/published. */
export function isDevHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.dev")
  );
}

export function normalizeHost(hostHeader: string | null | undefined): string {
  return (hostHeader ?? "").toLowerCase().split(":")[0]!.trim();
}

export function classifyHost(hostHeader: string | null | undefined): HostRole {
  const host = normalizeHost(hostHeader);
  if (!host || isDevHost(host)) return "dev";
  if (host === getCrmHost()) return "crm";
  if (host === getApiHost()) return "api";
  const stripped = host.replace(/^www\./, "");
  if (getPublicHosts().includes(stripped)) return "public";
  // Unknown hosts behave like public sites (they resolve to the primary
  // website today) — never grant them CRM access.
  return "public";
}

/** Paths that are infrastructure, not pages: bundles, assets, server fns. */
function isInfrastructurePath(pathname: string): boolean {
  return (
    pathname.startsWith("/_") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    /\.[a-z0-9]{2,5}$/i.test(pathname)
  );
}

function isCrmPath(pathname: string): boolean {
  return (
    pathname === "/admin-login" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/unauthorized" ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/seo-admin")
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export type HostDecision =
  | { action: "allow" }
  | { action: "redirect"; location: string }
  | { action: "notFound" };

/**
 * Decide whether a request may be served on the host it arrived at.
 * Called once per request in src/server.ts, before SSR.
 */
export function decideHostRouting(host: string, pathname: string): HostDecision {
  const role = classifyHost(host);
  if (role === "dev") return { action: "allow" };

  if (isInfrastructurePath(pathname)) return { action: "allow" };

  if (role === "api") {
    // API hostname serves API routes and webhooks only — never any UI.
    return isApiPath(pathname) ? { action: "allow" } : { action: "notFound" };
  }

  if (role === "crm") {
    if (pathname === "/") return { action: "redirect", location: "/admin-login" };
    if (isCrmPath(pathname) || isApiPath(pathname)) return { action: "allow" };
    // No public marketing pages on the CRM hostname.
    return { action: "notFound" };
  }

  // Public website hostnames never serve the staff CRM panel — staff sign in
  // only at crm.businesshelpservices.com.
  if (isCrmPath(pathname)) return { action: "notFound" };
  return { action: "allow" };
}
