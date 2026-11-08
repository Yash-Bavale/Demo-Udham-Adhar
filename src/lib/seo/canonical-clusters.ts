// Single source of truth for keyword-cluster canonicals.
//
// Approach #2 ("keep all pages, fix canonicals, trim sitemap"):
//   - Every variant slug listed here stays live and keeps its content.
//   - Its route's <link rel="canonical"> and og:url are rewritten by the
//     build to point at the cluster PRIMARY.
//   - The sitemap generator omits variants; only primaries are advertised.
//
// Cluster primaries themselves are NEVER listed as keys — they self-canonical.
// A slug missing from this map self-canonicals.
//
// If you add a new variant page, add it here and it will be handled
// automatically on the next build.

export const CANONICAL_CLUSTERS: Record<string, string> = {
  // ── Cluster: /udyam-registration ────────────────────────────────────────
  "udyam-registration-online": "udyam-registration",
  "udyam-registration-process": "udyam-registration",
  "udyam-registration-portal": "udyam-registration",
  "udyam-online-registration": "udyam-registration",
  "udyam-new-registration": "udyam-registration",
  "udyam-msme-registration": "udyam-registration",
  "msme-udyam-registration": "udyam-registration",
  "msme-registration": "udyam-registration",
  "msme-online-registration": "udyam-registration",
  "msme-registration-portal": "udyam-registration",
  "msme-registration-process": "udyam-registration",
  "msme-apply-online": "udyam-registration",
  "register-msme": "udyam-registration",
  "register-for-msme": "udyam-registration",
  "udyam-application": "udyam-registration",
  "udyam-apply": "udyam-registration",
  "udyam-pan-registration": "udyam-registration",
  "udyam-aadhaar-registration": "udyam-registration",
  "udyam-aadhar-registration": "udyam-registration",
  "aadhar-udyam-registration": "udyam-registration",
  "udyam-registration-free": "udyam-registration",
  "msme-registration-free": "udyam-registration",

  // ── Cluster: /udyam-certificate ─────────────────────────────────────────
  "udyam-registration-certificate": "udyam-certificate",
  "udyam-msme-certificate": "udyam-certificate",
  "msme-certificate": "udyam-certificate",
  "ms-me-certificate": "udyam-certificate",
  "msme-cer": "udyam-certificate",
  "udyam-reg-certificate": "udyam-certificate",
  "udyam-regn-certificate": "udyam-certificate",
  "udyam-card": "udyam-certificate",
  "aadhar-udyam-certificate": "udyam-certificate",
  "msme-certificate-registration": "udyam-certificate",
  "udyam-certificate-registration": "udyam-certificate",
  "udyam-certificate-apply": "udyam-certificate",
  "udyam-certificate-apply-online": "udyam-certificate",
  "udyog-aadhar-certificate": "udyam-certificate",

  // ── Cluster: /download-udyam-certificate (download + print + reprint) ──
  "print-udyam-certificate": "download-udyam-certificate",
  "print-msme-certificate": "download-udyam-certificate",
  "print-msme-udyam-certificate": "download-udyam-certificate",
  "msme-print-certificate": "download-udyam-certificate",
  "msme-print-udyam-certificate": "download-udyam-certificate",
  "print-udyam-certificate-download": "download-udyam-certificate",
  "print-udyam": "download-udyam-certificate",
  "msme-udyam-download": "download-udyam-certificate",
  "msme-udyam-certificate-download": "download-udyam-certificate",
  "msme-certificate-download": "download-udyam-certificate",
  "msme-registration-certificate-download": "download-udyam-certificate",
  "udyam-registration-certificate-download": "download-udyam-certificate",
  "udyam-register-certificate-download": "download-udyam-certificate",
  "udyam-certificate-download": "download-udyam-certificate",
  "udyam-certificate-download-pdf": "download-udyam-certificate",
  "udyam-msme-certificate-download": "download-udyam-certificate",
  "udyam-download-certificate": "download-udyam-certificate",
  "udyam-download": "download-udyam-certificate",
  "udyam-download-online": "download-udyam-certificate",
  "udyam-registration-download": "download-udyam-certificate",
  "udyam-print-certificate": "download-udyam-certificate",
  "udyam-print-download": "download-udyam-certificate",
  "udyam-print": "download-udyam-certificate",
  "udyam-print-with-annexure": "download-udyam-certificate",
  "download-msme-certificate": "download-udyam-certificate",
  "download-udyam-certificate-online": "download-udyam-certificate",
  "download-udyam-aadhar": "download-udyam-certificate",
  "download-udyam": "download-udyam-certificate",
  "free-msme-registration-certificate-download": "download-udyam-certificate",
  "udyam-card-download": "download-udyam-certificate",
  "aadhar-udyam-download": "download-udyam-certificate",
  "aadhar-udyam-print": "download-udyam-certificate",
  "udyam-adhar-download": "download-udyam-certificate",
  "udham-aadhar-download": "download-udyam-certificate",
  "udhayam-aadhar-download": "download-udyam-certificate",
  "udyog-aadhaar-download": "download-udyam-certificate",
  "udyog-aadhar-certificate-download": "download-udyam-certificate",
  "udyog-aadhar-download": "download-udyam-certificate",
  "udyam-aadhaar-download-pdf": "download-udyam-certificate",

  // ── Cluster: /udyam-registration-number ─────────────────────────────────
  "udyam-registration-number-verify": "udyam-registration-number",
  "verify-udyam-certificate": "udyam-registration-number",
  "forgot-udyam-registration-number": "udyam-registration-number",
  "udyam-number": "udyam-registration-number",
  "udyam-aadhaar-verify": "udyam-registration-number",
  "udyam-registration-check": "udyam-registration-number",
  "udyog-aadhaar-no": "udyam-registration-number",
  "udyog-aadhaar-number": "udyam-registration-number",

  // ── Cluster: /udyam-registration-update ─────────────────────────────────
  "udyam-certificate-update": "udyam-registration-update",
  "udyam-update": "udyam-registration-update",
  "udyam-update-online": "udyam-registration-update",
  "udyam-edit": "udyam-registration-update",
  "msme-certificate-update": "udyam-registration-update",
  "msme-updation": "udyam-registration-update",
  "udyog-aadhar-update": "udyam-registration-update",
  "udyog-aadhaar-update": "udyam-registration-update",

  // ── Cluster: /udyam-registration-status ─────────────────────────────────
  "udyam-certificate-status": "udyam-registration-status",
  "udyam-aadhaar-status": "udyam-registration-status",

  // ── Cluster: /udyam-login ───────────────────────────────────────────────
  "msme-registration-login": "udyam-login",
  "udyam-aadhaar-login": "udyam-login",

  // ── Cluster: /udyam-reprint ─────────────────────────────────────────────
  "udyam-certificate-reprint": "udyam-reprint",
  "udyam-certificate-print": "udyam-reprint",
  "udyam-register-print": "udyam-reprint",

  // ── Cluster: /udyog-aadhaar (Udyog Aadhaar / old-portal cluster) ───────
  "udyog-aadhaar-government-in": "udyog-aadhaar",
  "udyog-aadhaar-govin": "udyog-aadhaar",
  "udyog-aadhaar-register": "udyog-aadhaar",
  "udyog-aadhar-card": "udyog-aadhaar",
  "udyog-aadhar": "udyog-aadhaar",
  "udyog-aadhar-free-registration": "udyog-aadhaar",
  "udyog-aadhar-registration": "udyog-aadhaar",
  "udyog-aadhar-registration-2": "udyog-aadhaar",
  "udyog-aadhar-registration-online": "udyog-aadhaar",
  "udhar-aadhar-registration": "udyog-aadhaar",
  "aadhar-udyog-registration": "udyog-aadhaar",
  "aadhar-udyog": "udyog-aadhaar",
  "msme-udyog-aadhar": "udyog-aadhaar",
  "www-udyamregistration": "udyog-aadhaar",
  "www-udyamregistration-gov-in": "udyog-aadhaar",
  "udyamregistration-gov-in": "udyog-aadhaar",
  "udyamregistration": "udyog-aadhaar",
  "https-udyamregistration-gov-in": "udyog-aadhaar",
  "udyam-aadhaar": "udyog-aadhaar",
  "udyam-aadhar": "udyog-aadhaar",
  "udyam-adhaar": "udyog-aadhaar",
  "udyam-adhar-2": "udyog-aadhaar",
  "aadhaar-udyam": "udyog-aadhaar",
  "aadhar-udyam": "udyog-aadhaar",
  "udyam-msme": "udyog-aadhaar",
  "udyam": "udyog-aadhaar",
  "udyam-portal": "udyog-aadhaar",

  // ── Cluster: /migrate-udyog-aadhaar-to-udyam ────────────────────────────
  "udyog-aadhaar-to-udyam-migration": "migrate-udyog-aadhaar-to-udyam",

  // ── Cluster: /msme-registration-fee ─────────────────────────────────────
  "msme-registration-charges": "msme-registration-fee",
};

/** Set of variant slugs to omit from sitemap.xml. */
export const VARIANT_SLUGS = new Set(Object.keys(CANONICAL_CLUSTERS));

/** Resolve a slug to its canonical path (leading slash). */
export function canonicalPathFor(slug: string): string {
  const clean = slug.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  const primary = CANONICAL_CLUSTERS[clean];
  return `/${primary ?? clean}`;
}
