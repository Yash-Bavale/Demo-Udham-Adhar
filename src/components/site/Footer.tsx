import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Home as HomeIcon,
  Briefcase,
  Mail,
  Phone,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { listPublicSeoPages } from "@/lib/seo-pages.functions";
import { listContentfulSeoPages, type ContentfulSeoPage } from "@/lib/contentful/client.functions";
import { useBrand } from "@/lib/websites/brand-context";
import { useNav, useBlock } from "@/lib/websites/site-content-context";


type SeoPageRow = { id: string; slug: string; label: string; page_type?: string };

type Category = {
  key: string;
  label: string;
  isHome?: boolean;
  childSlugs: string[];
};

// Parent labels render as plain text (no link). The parent's own page (when it
// has one) appears as the first child link inside the section — matching the
// master keyword sequence.
const CATEGORIES: Category[] = [
  { key: "home", label: "Home", isHome: true, childSlugs: [] },
  { key: "udyamregistration", label: "Udyamregistration",
    childSlugs: ["udyamregistration","udyam-regn","udyam","udyog-aadhar","udyam-certificate","register-for-msme","register-msme","udyam-aadhar","udyam-reg-certificate","udyam-regn-certificate"] },
  { key: "udyam-regn-certificate", label: "Udyam Regn Certificate",
    childSlugs: ["udyog-aadhar-registration","msme-certificate","msme-certificate-download","aadhar-udyog","udyam-certificate-download","msme-online-registration","aadhar-udyam","udyam-portal","udyog-aadhar-download","msme-udyam-download"] },
  { key: "udyamregistration-gov-in", label: "Udyamregistration gov in",
    childSlugs: ["udyog-aadhar-registration-2","udyam-download","msme-udyam-registration","udyam-aadhar-registration","udyam-registration-certificate-download","udyam-registration-download","udyam-registration-form","udyam-registration-number","udyam-registration-online","udyam-registration-portal"] },
  { key: "aadhar-udyog-registration", label: "Aadhar Udyog registration",
    childSlugs: ["aadhar-udyog-registration","udyog-aadhar-certificate","udyam-certificate-registration","msme-certificate-registration","udyog-aadhaar","udyog-aadhar-update","msme-udyog-aadhar","udyam-online-registration","msme-udyam-certificate-download","download-msme-certificate"] },
  { key: "udyog-aadhar-certificate-download", label: "Udyog Aadhar certificate download",
    childSlugs: ["udyog-aadhar-certificate-download","udyam-register","udyam-new-registration","udyam-update","udyam-certificate-update","udyam-msme-certificate","udyam-adhaar","udyam-number","aadhar-udyam-certificate","udyog-aadhaar-number"] },
  { key: "official-msme-registration-website", label: "Official MSME Registration Website",
    childSlugs: ["www-udyamregistration-gov-in","udyam-aadhaar-registration","udyog-aadhar-free-registration","udyam-certificate-apply","udyam-update-online","udyam-msme","msme-certificate-update","udyam-card","udyog-aadhar-card","msme-updation"] },
  { key: "aadhaar-udyam", label: "Aadhaar Udyam",
    childSlugs: ["aadhaar-udyam","udyam-register-certificate-download","udyam-download-certificate","aadhar-udyam-download","aadhar-udyam-registration","download-udyam","free-msme-registration-certificate-download","msme-registration-charges","msme-registration-fee","msme-registration-portal"] },
  { key: "msme-registration-process", label: "MSME Registration Process",
    childSlugs: ["msme-registration-process","udyam-card-download","udyam-edit","udyam-msme-registration","udyog-aadhaar-government-in","udyog-aadhaar-no","udyog-aadhaar-register","udyog-aadhaar-update","udyog-aadhaar-govin","www-udyamregistration"] },
  { key: "udyam-aadhaar-download-pdf", label: "Udyam Aadhaar Download PDF",
    childSlugs: ["udyam-aadhaar-download-pdf","msme-registration-free","https-udyamregistration-gov-in","msme-registration-certificate-download","download-udyam-certificate","print-udyam-certificate","udyam-certificate-print","udyam-application","msme-certificate-print","print-msme-certificate"] },
  { key: "udyog-aadhar-registration-section", label: "Udyog Aadhar Registration",
    childSlugs: ["udhar-aadhar-registration","udyog-aadhaar-to-udyam-migration","download-udyam-certificate-online","udyam-adhar-2","msme-apply-online","udyam-certificate-download-pdf","ms-me-certificate","msme-cer","download-udyam-aadhar","udham-aadhar-download"] },
  { key: "udhayam-aadhar-download", label: "Udhayam Aadhar Download",
    childSlugs: ["udhayam-aadhar-download","udyam-print","print-udyam","udyam-register-print","udyam-print-download","udyam-reprint","udyam-print-certificate","msme-print-udyam-certificate","aadhar-udyam-print","msme-print-certificate"] },
  { key: "print-msme-udyam-certificate", label: "Print MSME Udyam Certificate",
    childSlugs: ["print-msme-udyam-certificate","print-udyam-certificate-download","udyam-print-with-annexure","udyam-adhar-download","udyog-aadhaar-download","udyam-aadhaar-verify","udyam-aadhaar-status","udyam-registration-number-verify","udyam-pan-registration","udyam-aadhaar-login"] },
  { key: "udyam-registration-online-section", label: "Udyam Registration Online",
    childSlugs: ["udyog-aadhar-registration-online","udyam-apply","udyam-certificate-apply-online","msme-registration-login","udyam-registration-check","udyam-download-online","udyam-certificate-status","udyam-registration-update","udyam-certificate-reprint","udyam-msme-certificate-download"] },
];

const FOOTER_LINKS = [
  { to: "/terms-conditions", label: "Terms & Conditions" },
  { to: "/privacy-policy", label: "Privacy Policy" },
  { to: "/refund-cancellation-policy", label: "Refund & Cancellation Policy" },
  { to: "/disclaimer", label: "Disclaimer" },
  { to: "/pricing-transparency", label: "Pricing Transparency" },
  { to: "/service-delivery-policy", label: "Service Delivery Policy" },
  { to: "/consent-acknowledgment", label: "Consent & Acknowledgment" },
  
  { to: "/compliance-statement", label: "Compliance Statement" },
  { to: "/cookie-policy", label: "Cookie Policy" },
  { to: "/aml-anti-fraud-policy", label: "AML / Anti-Fraud Policy" },
  {
    to: "/payment-notice-service-acknowledgment",
    label: "Payment Notice & Service Acknowledgment",
  },
  { to: "/important-notice", label: "Important Notice" },
  { to: "/contact", label: "Contact Us" },
] as const;

export function Footer() {
  const brand = useBrand();
  const footerLinks = useNav(
    "footer",
    FOOTER_LINKS.filter((l) => l.to !== "/contact" && l.to !== "/important-notice").map((l) => ({
      id: l.to,
      label: l.label,
      path: l.to,
      openInNew: false,
    })),
  );
  const addressBlock = useBlock<{ text?: string } | null>("footer.address", null);
  const copyrightBlock = useBlock<{ text?: string } | null>("footer.copyright", null);
  const brandHeadingBlock = useBlock<{ text?: string } | null>("footer.brand_heading", null);
  const contactNameBlock = useBlock<{ text?: string } | null>("footer.contact_name", null);

  const footerBrandHeading = brandHeadingBlock?.text || brand.companyName || "Business Help Services";
  const footerContactName = contactNameBlock?.text || brand.companyName || "Business Help Services";

  const address =
    brand.postalAddress ||
    addressBlock?.text ||
    [brand.companyName, brand.postalAddress].filter(Boolean).join(" ") ||
    "Koregaon Bk, Taluka-Khed, Pune, Maharashtra – 410505, India";
  const loadSeoPages = useServerFn(listPublicSeoPages);
  const loadCfSeoPages = useServerFn(listContentfulSeoPages);
  const [pages, setPages] = useState<SeoPageRow[] | null>(null);
  const [cfPages, setCfPages] = useState<ContentfulSeoPage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const year = new Date().getFullYear();

  // Detect if this is the 2nd website (udyamregistrations.in)
  const isUdyamRegistrationsSite =
    brand.domain?.toLowerCase().includes("udyamregistration") ||
    (typeof window !== "undefined" && window.location.hostname.includes("udyamregistration"));

  // Only fetch the (heavy) SEO page list once the gated SEO tree is unlocked.
  // Avoids one server-fn round-trip on every page load for every visitor.
  const fetchPagesIfNeeded = () => {
    if (loading) return;
    if (isUdyamRegistrationsSite) {
      // For 2nd website: fetch Contentful pages directly
      if (cfPages !== null) return;
      setLoading(true);
      setLoadError(false);
      loadCfSeoPages()
        .then((data) => setCfPages(data ?? []))
        .catch(() => {
          setLoadError(true);
          setCfPages([]);
        })
        .finally(() => setLoading(false));
    } else {
      // For primary site: use DB-backed SEO pages
      if (pages !== null) return;
      setLoading(true);
      setLoadError(false);
      loadSeoPages()
        .then((data) => setPages((data ?? []) as SeoPageRow[]))
        .catch(() => {
          setLoadError(true);
          setPages([]);
        })
        .finally(() => setLoading(false));
    }
  };

  return (
    <footer className="bg-brand-navy-deep text-white mt-12">
      <div className="mx-auto max-w-7xl px-4 py-12 grid gap-10 md:grid-cols-3">
        {/* Col 1: Business Help Services — full SEO tree inline */}
        <div>
          <h4 className="text-2xl font-bold font-display leading-tight">
            {footerBrandHeading}
          </h4>
          <SeoTree
            pages={pages}
            cfPages={cfPages}
            isUdyamRegistrationsSite={isUdyamRegistrationsSite}
            loading={loading}
            loadError={loadError}
            onUnlock={fetchPagesIfNeeded}
            unlockCode={brand.footerUnlockCode || "113355"}
          />
        </div>

        {/* Col 3: Useful Links */}
        <div>
          <h4 className="text-2xl font-bold font-display leading-tight">
            Useful Links
          </h4>
          <ul className="mt-6 space-y-2.5 text-[15px] text-white/90">
            {footerLinks.map((l) => (
              <li key={l.id}>
                <Link to={l.path} target={l.openInNew ? "_blank" : undefined} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Col 4: Get in touch */}
        <div>
          <h4 className="text-2xl font-bold font-display leading-tight">
            Get in touch
          </h4>
          <p className="mt-3 text-base font-bold text-white">
            {footerContactName}
          </p>
          <ul className="mt-4 space-y-4 text-[14.5px] text-white/90">
            <li className="flex items-start gap-3">
              <Briefcase className="h-5 w-5 mt-0.5 shrink-0 text-white/80" />
              <span>Working Hours: {brand.businessHours || "10:00 AM to 05:00 PM (IST) ( Sunday & Public Holidays Off)"}</span>
            </li>
            <li className="flex items-start gap-3">
              <Mail className="h-5 w-5 mt-0.5 shrink-0 text-white/80" />
              <span>
                Email:<br />
                <a href={`mailto:${brand.supportEmail}`} className="hover:underline break-all">
                  {brand.supportEmail}
                </a>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Phone className="h-5 w-5 mt-0.5 shrink-0 text-white/80" />
              <span>
                Phone:{" "}
                <a href={`tel:${(brand.supportPhone || "+91-9767870331").replace(/\s+/g, "")}`} className="hover:underline">
                  {brand.supportPhone || "+91-9767870331"}
                </a>
              </span>
            </li>
            {brand.whatsappNumber && (
              <li className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 mt-0.5 shrink-0 text-white/80" />
                <span>
                  WhatsApp:{" "}
                  <a href={`https://wa.me/${brand.whatsappNumber.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {brand.whatsappNumber}
                  </a>
                </span>
              </li>
            )}
            <li className="flex items-start gap-3">
              <MapPin className="h-5 w-5 mt-0.5 shrink-0 text-white/80" />
              <span>Address: {address}</span>
            </li>
          </ul>
          <div className="mt-5 pt-4 border-t border-white/15 text-xs text-white/75 leading-relaxed">
            <strong>Disclaimer:</strong> {brand.legalFooterLine || "Business Help Services is operated as a private consultancy. We are not affiliated with, authorised by, endorsed by, or associated with any government authority or department."}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">

        <div className="mx-auto max-w-7xl px-4 py-5 text-center text-sm font-semibold text-white/85">
          {copyrightBlock?.text
            ? copyrightBlock.text.replace("{{year}}", String(year))
            : `© ${year} ${brand.companyName}. All Rights Reserved. Operated by ${brand.legalEntity}.`}
        </div>
      </div>
    </footer>
  );
}

function SeoTree({
  pages,
  cfPages,
  isUdyamRegistrationsSite,
  loading,
  loadError,
  onUnlock,
  unlockCode,
}: {
  pages: SeoPageRow[] | null;
  cfPages: ContentfulSeoPage[] | null;
  isUdyamRegistrationsSite: boolean;
  loading: boolean;
  loadError: boolean;
  onUnlock: () => void;
  unlockCode: string;
}) {
  // Route to the appropriate rendering mode based on which website is active
  if (isUdyamRegistrationsSite) {
    return (
      <ContentfulSeoTree
        cfPages={cfPages}
        loading={loading}
        loadError={loadError}
        onUnlock={onUnlock}
        unlockCode={unlockCode}
      />
    );
  }

  return (
    <PrimarySeoTree
      pages={pages}
      loading={loading}
      loadError={loadError}
      onUnlock={onUnlock}
      unlockCode={unlockCode}
    />
  );
}

/** DB-backed hierarchical SEO tree — used by the primary website (udyamadhar.in). */
function PrimarySeoTree({
  pages,
  loading,
  loadError,
  onUnlock,
  unlockCode,
}: {
  pages: SeoPageRow[] | null;
  loading: boolean;
  loadError: boolean;
  onUnlock: () => void;
  unlockCode: string;
}) {

  const expandedAll = () =>
    Object.fromEntries(CATEGORIES.filter((c) => !c.isHome).map((c) => [c.key, true]));
  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [clicks, setClicks] = useState(0);
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (window.sessionStorage.getItem("udyam_footer_unlock") === "1") {
        setUnlocked(true);
        setExpanded(expandedAll());
        onUnlock();
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const grouped = useMemo(() => {
    const map = new Map<string, SeoPageRow[]>();
    CATEGORIES.forEach((c) => map.set(c.key, []));
    if (!pages) return map;
    const bySlug = new Map(pages.map((p) => [p.slug, p]));
    for (const cat of CATEGORIES) {
      const list = map.get(cat.key)!;
      for (const slug of cat.childSlugs) {
        const p = bySlug.get(slug);
        if (p) list.push(p);
      }
    }
    return map;
  }, [pages]);

  // Articles (blog-style SEO pages) grouped into themed parents.
  const articleGroups = useMemo(() => {
    const articles = (pages ?? []).filter((p) => p.page_type === "article");
    const groups: { key: string; label: string; match: (s: string) => boolean }[] = [
      { key: "art-registration", label: "Udyam Registration (Articles)",
        match: (s) => s.startsWith("udyam-registration") && !s.includes("verify") && !s.includes("download") && !s.includes("print") && !s.includes("update") && !s.includes("change") && !s.includes("correction") && !s.includes("renewal") && !s.includes("status") && !s.includes("login") },
      { key: "art-certificate", label: "Udyam Certificate (Articles)",
        match: (s) => s.includes("certificate") || s.includes("aadhar-card") || s.includes("aadhaar-card") || s === "udyam-registration-download-guide" || s === "udyam-registration-print" },
      { key: "art-verification", label: "Udyam Verification & Status (Articles)",
        match: (s) => s.includes("verif") || s.includes("verify") || s.includes("status") || s === "udyam-registration-login" || s === "msme-login" },
      { key: "art-update", label: "Udyam Updates & Changes (Articles)",
        match: (s) => s.includes("update") || s.includes("change") || s.includes("correction") || s.includes("renewal") || s.includes("mobile-number") || s.includes("pan-card") || s.includes("name-change") },
      { key: "art-forgot", label: "Forgot / Recovery (Articles)",
        match: (s) => s.startsWith("forgot-") },
      { key: "art-msme-other", label: "MSME & Other (Articles)",
        match: () => true },
    ];
    const used = new Set<string>();
    const result: { key: string; label: string; items: SeoPageRow[] }[] = [];
    for (const g of groups) {
      const items: SeoPageRow[] = [];
      for (const a of articles) {
        if (used.has(a.slug)) continue;
        if (g.match(a.slug)) {
          items.push(a);
          used.add(a.slug);
        }
      }
      if (items.length) result.push({ key: g.key, label: g.label, items });
    }
    return result;
  }, [pages]);

  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const homeCat = CATEGORIES.find((c) => c.isHome)!;
  const restCats = CATEGORIES.filter((c) => !c.isHome);

  function handleHomeRowClick() {
    if (unlocked) return;
    const next = clicks + 1;
    setClicks(next);
    if (next >= 3) {
      setShowPwd(true);
    }
  }

  function submitPwd(e: React.FormEvent) {
    e.preventDefault();
    if (pwd === unlockCode) {
      try {
        window.sessionStorage.setItem("udyam_footer_unlock", "1");
      } catch { /* ignore */ }
      setUnlocked(true);
      setExpanded(expandedAll());
      setShowPwd(false);
      setPwd("");
      setPwdError(false);
      onUnlock();

    } else {
      setPwdError(true);
      setPwd("");
      setClicks(0);
      setShowPwd(false);
    }
  }

  return (
    <nav className="mt-6" aria-label="SEO landing pages">
      <ul className="space-y-1 text-[15px] font-semibold leading-snug">
        {/* Home row — clicking the row 3× while locked reveals the password input */}
        <li>
          <div
            className="flex items-center gap-1 cursor-default select-none"
            onClick={handleHomeRowClick}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center text-white/40">
              <HomeIcon className="h-3.5 w-3.5" />
            </span>
            <Link
              to="/"
              className="flex-1 py-1.5 text-white hover:text-brand-gold"
              onClick={(e) => {
                if (!unlocked) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleHomeRowClick();
                }
              }}
            >
              {homeCat.label}
            </Link>
          </div>

          {showPwd && !unlocked && (
            <form
              onSubmit={submitPwd}
              className="ml-6 mt-2 mb-3 flex items-center gap-2"
            >
              <input
                type="password"
                value={pwd}
                onChange={(e) => { setPwd(e.target.value); setPwdError(false); }}
                autoFocus
                className={`flex-1 rounded-md border bg-white/10 px-2 py-1.5 text-sm text-white outline-none focus:ring-2 ${
                  pwdError ? "border-red-400 ring-red-400/40" : "border-white/30 focus:ring-brand-gold/40"
                }`}
              />
              <button
                type="submit"
                className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-semibold text-brand-navy-deep hover:bg-brand-gold/90"
              >
                Open
              </button>
            </form>
          )}
        </li>

        {/* Locked: nothing else is shown. Unlocked: render the full SEO tree. */}
        {mounted && unlocked && (
          <>
            {loading && <li className="py-2 text-sm text-white/75">Loading pages…</li>}
            {loadError && (
              <li className="py-2 text-sm text-white/75">Could not load SEO pages.</li>
            )}
            {!loading && restCats.map((cat) => {
              const children = grouped.get(cat.key) ?? [];
              const isOpen = expanded[cat.key];
              const hasChildren = children.length > 0;
              return (
                <li key={cat.key}>
                  <div className="flex items-center gap-1">
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggle(cat.key)}
                        className="p-1 text-white/85 hover:text-brand-gold"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 stroke-[3]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 stroke-[3]" />
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex h-6 w-6 items-center justify-center text-white/40">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="flex-1 py-1.5 text-white font-semibold">
                      {cat.label}
                    </span>
                  </div>
                  {hasChildren && isOpen && (
                    <ul className="ml-6 mt-1 mb-2 space-y-1 border-l border-white/15 pl-3 text-sm font-normal">
                      {children.map((p) => (
                        <li key={p.id}>
                          <a
                            href={`/${p.slug}`}
                            className="flex items-start gap-2 py-1 text-white/85 hover:text-brand-gold"
                          >
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{p.label}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {!loading && articleGroups.map((cat) => {
              const isOpen = expanded[cat.key];
              return (
                <li key={cat.key}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggle(cat.key)}
                      className="p-1 text-white/85 hover:text-brand-gold"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 stroke-[3]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 stroke-[3]" />
                      )}
                    </button>
                    <span className="flex-1 py-1.5 text-white font-semibold">
                      {cat.label}
                    </span>
                  </div>
                  {isOpen && (
                    <ul className="ml-6 mt-1 mb-2 space-y-1 border-l border-white/15 pl-3 text-sm font-normal">
                      {cat.items.map((p) => (
                        <li key={p.id}>
                          <a
                            href={`/${p.slug}`}
                            className="flex items-start gap-2 py-1 text-white/85 hover:text-brand-gold"
                          >
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{p.label}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </>
        )}
      </ul>
    </nav>
  );
}

/** Flat list of Contentful SEO pages — used by the 2nd website footer (udyamregistrations.in). */
function ContentfulSeoTree({
  cfPages,
  loading,
  loadError,
  onUnlock,
  unlockCode,
}: {
  cfPages: ContentfulSeoPage[] | null;
  loading: boolean;
  loadError: boolean;
  onUnlock: () => void;
  unlockCode: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [clicks, setClicks] = useState(0);
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (window.sessionStorage.getItem("udyam_footer_unlock") === "1") {
        setUnlocked(true);
        onUnlock();
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleHomeRowClick() {
    if (unlocked) return;
    const next = clicks + 1;
    setClicks(next);
    if (next >= 3) setShowPwd(true);
  }

  function submitPwd(e: React.FormEvent) {
    e.preventDefault();
    if (pwd === unlockCode) {
      try { window.sessionStorage.setItem("udyam_footer_unlock", "1"); } catch { /* ignore */ }
      setUnlocked(true);
      setShowPwd(false);
      setPwd("");
      setPwdError(false);
      onUnlock();
    } else {
      setPwdError(true);
      setPwd("");
      setClicks(0);
      setShowPwd(false);
    }
  }

  // Sort pages alphabetically by title
  const sortedPages = useMemo(
    () => [...(cfPages ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
    [cfPages],
  );

  return (
    <nav className="mt-6" aria-label="SEO landing pages">
      <ul className="space-y-1 text-[15px] font-semibold leading-snug">
        {/* Home row — click 3× to reveal password */}
        <li>
          <div
            className="flex items-center gap-1 cursor-default select-none"
            onClick={handleHomeRowClick}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center text-white/40">
              <HomeIcon className="h-3.5 w-3.5" />
            </span>
            <Link
              to="/"
              className="flex-1 py-1.5 text-white hover:text-brand-gold"
              onClick={(e) => {
                if (!unlocked) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleHomeRowClick();
                }
              }}
            >
              Home
            </Link>
          </div>
          {showPwd && !unlocked && (
            <form onSubmit={submitPwd} className="ml-6 mt-2 mb-3 flex items-center gap-2">
              <input
                type="password"
                value={pwd}
                onChange={(e) => { setPwd(e.target.value); setPwdError(false); }}
                autoFocus
                className={`flex-1 rounded-md border bg-white/10 px-2 py-1.5 text-sm text-white outline-none focus:ring-2 ${
                  pwdError ? "border-red-400 ring-red-400/40" : "border-white/30 focus:ring-brand-gold/40"
                }`}
              />
              <button type="submit" className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-semibold text-brand-navy-deep hover:bg-brand-gold/90">
                Open
              </button>
            </form>
          )}
        </li>

        {/* Unlocked: flat list of all Contentful SEO pages sorted alphabetically */}
        {mounted && unlocked && (
          <>
            {loading && <li className="py-2 text-sm text-white/75">Loading pages…</li>}
            {loadError && <li className="py-2 text-sm text-white/75">Could not load SEO pages.</li>}
            {!loading && sortedPages.map((page) => (
              <li key={page.slug}>
                <a
                  href={`/${page.slug}`}
                  className="flex items-center gap-1 py-1 text-white/85 hover:text-brand-gold font-normal text-sm"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span>{page.title}</span>
                </a>
              </li>
            ))}
          </>
        )}
      </ul>
    </nav>
  );
}
