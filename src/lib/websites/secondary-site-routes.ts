/**
 * Route gating for secondary public-only sites (websites row with
 * allow_admin = false, e.g. udyamregistrations.in).
 *
 * Those sites must NOT expose the legacy WordPress content pages or the
 * SEO landing/article pages that belong to the primary site — only the core
 * funnel (home, services flow, payment/onboarding) and the legal/policy set.
 */

/** Exact paths always available on a secondary site. */
const ALLOWED_EXACT = new Set<string>([
  "/",
  "/index.html",
  "/about",
  "/about-us",
  "/contact",
  "/contact-us",
  "/complaint",
  "/other-problem",
  "/talk-to-expert",
  "/unauthorized",
  "/notice",
  "/important-notice",
  "/payment-notice",
  "/payment-notice-service-acknowledgment",
  // Legal / policy set
  "/aml-anti-fraud-policy",
  "/complaint-grievance-policy",
  "/compliance-statement",
  "/consent-acknowledgment",
  "/cookie-policy",
  "/disclaimer",
  "/grievance-redressal-policy",
  "/pricing-transparency",
  "/privacy-policy",
  "/refund-cancellation-policy",
  "/service-delivery-policy",
  "/terms-conditions",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
]);

/** Path prefixes (functional / dynamic routes) always available. */
const ALLOWED_PREFIXES = [
  "/api/",
  "/apply/",
  "/app/",
  "/email/",
  "/lovable/",
  "/onboarding/",
  "/payment/",
  "/payment-failed/",
  "/payment-pending/",
  "/processing/",
  "/resume/",
  "/success/",
];

/**
 * True when the given pathname is SEO / legacy-WP content that must 404 on a
 * secondary public-only site.
 *
 * `extraAllowed` carries the site's own configured nav paths (site_nav_items),
 * so service pages that the secondary site actually links to stay reachable.
 */
export function isBlockedOnSecondarySite(
  pathname: string,
  extraAllowed?: Iterable<string>,
): boolean {
  const norm = (p: string) =>
    p.length > 1 ? p.replace(/\/+$/, "").toLowerCase() : p.toLowerCase();
  const path = norm(pathname);
  if (ALLOWED_EXACT.has(path)) return false;
  if (ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return false;
  // Admin paths have their own gate in __root.
  if (path.startsWith("/admin")) return false;
  if (extraAllowed) {
    for (const p of extraAllowed) {
      if (p && p.startsWith("/") && norm(p) === path) return false;
    }
  }
  return true;
}
