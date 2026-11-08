/**
 * Rewrites ONLY the website references in email footers (contact line,
 * copyright bar, policy links, plain site mention) from the default
 * udyamadhar.in to the order's own website domain. Customer form/payment
 * links (/onboarding, /payment, /resume, /api) are never touched.
 */
const DEFAULT_DOMAIN = "udyamadhar.in";
const POLICY_PATHS = [
  "terms-conditions",
  "refund-cancellation-policy",
  "privacy-policy",
  "disclaimer",
  "service-delivery-policy",
];

export function normalizeSiteDomain(domain: string | null | undefined): string | null {
  const d = String(domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

export function applyFooterDomain(html: string, domain: string | null | undefined): string {
  const target = normalizeSiteDomain(domain);
  if (!html || !target || target === DEFAULT_DOMAIN) return html;
  let out = html;
  // Policy links
  for (const p of POLICY_PATHS) {
    out = out.split(`https://${DEFAULT_DOMAIN}/${p}`).join(`https://${target}/${p}`);
    out = out.split(`https://www.${DEFAULT_DOMAIN}/${p}`).join(`https://${target}/${p}`);
  }
  // Bare homepage link + its visible text
  out = out.replace(/href=(["'])https:\/\/(www\.)?udyamadhar\.in\/?\1/gi, `href=$1https://${target}$1`);
  out = out.replace(/>\s*https:\/\/(www\.)?udyamadhar\.in\/?\s*</gi, `>https://${target}<`);
  // Visible "www.udyamadhar.in" text (contact line, copyright bar)
  out = out.replace(/www\.udyamadhar\.in(?![\w/.-])/gi, `www.${target}`);
  // Plain "| udyamadhar.in" mention (E012 footer)
  out = out.replace(/(&nbsp;\|&nbsp;\s*|\|\s*)udyamadhar\.in(?![\w/.-])/gi, `$1${target}`);
  return out;
}
