import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, X, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { NAV_LINKS } from "@/lib/constants";
import { useNav, useBlock } from "@/lib/websites/site-content-context";
import { useBrand } from "@/lib/websites/brand-context";

declare global {
  interface Window {
    google?: any;
    googleTranslateElementInit?: () => void;
  }
}

const LANGS: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
  { code: "bn", label: "বাংলা" },
  { code: "gu", label: "ગુજરાતી" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ml", label: "മലയാളം" },
  { code: "pa", label: "ਪੰਜਾਬੀ" },
  { code: "sd", label: "سنڌي" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "ur", label: "اردو" },
];

const STORAGE_KEY = "site_lang";

function setGoogTransCookie(lang: string) {
  const value = `/en/${lang}`;
  // Set on current host and parent domain so it persists across SPA navigation.
  document.cookie = `googtrans=${value};path=/`;
  const host = window.location.hostname;
  const parts = host.split(".");
  if (parts.length > 1) {
    const parent = "." + parts.slice(-2).join(".");
    document.cookie = `googtrans=${value};path=/;domain=${parent}`;
  }
  document.cookie = `googtrans=${value};path=/;domain=.${host}`;
}

function readStoredLang(): string {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem(STORAGE_KEY) || "en";
}

function applyLang(lang: string) {
  const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (!combo) return false;
  combo.value = lang;
  combo.dispatchEvent(new Event("change"));
  return true;
}

export function Header() {
  const brand = useBrand();
  const centerTitleBlock = useBlock<{ text?: string } | null>("header.center_title", null);
  const centerSubtitleBlock = useBlock<{ text?: string } | null>("header.center_subtitle", null);
  const brandTitleBlock = useBlock<{ text?: string } | null>("header.brand_title", null);
  const brandSubtitleBlock = useBlock<{ text?: string } | null>("header.brand_subtitle", null);

  const centerTitle = centerTitleBlock?.text || "सूक्ष्म, लघु और मध्यम उद्यम पंजीकरण सहायता सेवा";
  const centerSubtitle = centerSubtitleBlock?.text || "REGISTRATION ADVISORY FOR MICRO, SMALL & MEDIUM ENTERPRISES";
  const brandTitle = brandTitleBlock?.text || brand.companyName || "Business Help Services";
  const brandSubtitle = brandSubtitleBlock?.text || "Business Consultancy & Assistance Services";

  const [open, setOpen] = useState(false);
  const navLinks = useNav(
    "header",
    NAV_LINKS.map((l) => ({ id: `${l.to}-${l.label}`, label: l.label, path: l.to, openInNew: false })),
  );

  const [lang, setLang] = useState<string>("en");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hydrate selected language from storage
  useEffect(() => {
    setLang(readStoredLang());
  }, []);

  // Lazy-bootstrap Google Translate: only when needed (returning user with a
  // non-English stored language, OR after the user interacts with the picker).
  // Avoids a ~hundreds-of-KB script on every fresh visit.
  function ensureTranslateScript() {
    if (typeof window === "undefined") return;
    if (document.getElementById("google-translate-script")) return;
    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: LANGS.map((l) => l.code).join(","),
          layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
          autoDisplay: false,
        },
        "google_translate_element",
      );
      const stored = readStoredLang();
      if (stored && stored !== "en") {
        const tryApply = (n = 0) => {
          if (applyLang(stored)) return;
          if (n < 20) setTimeout(() => tryApply(n + 1), 200);
        };
        tryApply();
      }
    };
    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);
  }

  // Only bootstrap on mount if the visitor already has a non-English language
  // selected from a previous visit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredLang();
    if (stored && stored !== "en") ensureTranslateScript();
  }, []);

  // Re-apply translation after each SPA route change
  useEffect(() => {
    const stored = readStoredLang();
    if (!stored || stored === "en") return;
    setGoogTransCookie(stored);
    const tryApply = (n = 0) => {
      if (applyLang(stored)) return;
      if (n < 25) setTimeout(() => tryApply(n + 1), 200);
    };
    // Give the new page a tick to mount before re-translating
    const t = setTimeout(() => tryApply(), 50);
    return () => clearTimeout(t);
  }, [pathname]);

  const onLangChange = (code: string) => {
    setLang(code);
    localStorage.setItem(STORAGE_KEY, code);
    setGoogTransCookie(code);
    if (code === "en") {
      // Restore original by clearing cookie + reload (most reliable)
      document.cookie = "googtrans=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT";
      const host = window.location.hostname;
      const parts = host.split(".");
      if (parts.length > 1) {
        const parent = "." + parts.slice(-2).join(".");
        document.cookie = `googtrans=;path=/;domain=${parent};expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
      window.location.reload();
      return;
    }
    // Ensure the translate script is loaded (lazy on first user interaction).
    ensureTranslateScript();
    if (!applyLang(code)) {
      // Widget not ready yet — full reload picks up the cookie
      window.location.reload();
    }
  };

  const handleTitleClick = () => {
    if (pathname === "/") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate({ to: "/" });
    }
  };

  return (
    <>
      {/* Top thin bar */}
      <div className="bg-[#d2e3f3] border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-center md:justify-end gap-3">
          <Globe className="w-4 h-4 text-brand-navy" aria-hidden />
          <label htmlFor="site-lang" className="text-xs font-semibold text-brand-navy">
            Change Language
          </label>
          <select
            id="site-lang"
            value={lang}
            onChange={(e) => onLangChange(e.target.value)}
            className="notranslate rounded-md border border-brand-navy bg-white px-2 py-1 text-xs font-semibold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          {/* Hidden Google widget host (required for script to mount) */}
          <div id="google_translate_element" className="gtranslate-host sr-only" aria-hidden />
        </div>
      </div>

      {/* Main header */}
      <header className="bg-background border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-3 md:py-5 bg-white">
          {/* Mobile */}
          <div className="md:hidden flex items-center gap-3">
            <button
              type="button"
              onClick={handleTitleClick}
              className="flex-1 text-left bg-transparent p-0 cursor-pointer min-w-0"
              aria-label="Go to homepage"
            >
              <p className="font-bold text-brand-red font-display leading-snug text-center text-lg">
                {centerTitle}
              </p>
              <p className="text-[10px] tracking-wide text-brand-navy font-semibold font-display mt-0.5 leading-tight text-center">
                {centerSubtitle}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-md border-2 border-brand-navy text-brand-navy bg-transparent"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop */}
          <div className="hidden md:grid grid-cols-3 items-center gap-4">
            <Link
              to="/"
              className="flex flex-col"
              aria-label={brandTitle}
              title={brandTitle}
              itemScope
              itemType="https://schema.org/Organization"
            >
              <span
                itemProp="name"
                className="text-xl lg:text-2xl font-bold text-brand-red font-display whitespace-nowrap leading-loose"
              >
                {brandTitle}
              </span>
              <span className="text-sm text-foreground/80 leading-relaxed">
                {brandSubtitle}
              </span>
            </Link>

            <button
              type="button"
              onClick={handleTitleClick}
              className="text-center bg-transparent p-0 cursor-pointer"
              aria-label="Go to homepage"
            >
              <div className="text-2xl font-bold text-brand-red font-display leading-tight">
                {centerTitle}
              </div>
              <p className="text-xs tracking-wider text-brand-navy font-semibold mt-1">
                {centerSubtitle}
              </p>
            </button>

            <div className="flex justify-end">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-md bg-brand-navy px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-deep transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile sidebar drawer */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setOpen(false)}>
          <aside
            className="absolute right-0 top-0 h-full w-[82%] max-w-sm bg-brand-navy text-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-brand-navy px-5 py-4 border-b border-white/15 flex items-center justify-between">
              <span className="font-display text-lg font-bold">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="px-5 py-4">
              <ul className="space-y-1">
                {navLinks.map((l) => (
                  <li key={l.id}>
                    <Link
                      to={l.path}
                      target={l.openInNew ? "_blank" : undefined}
                      onClick={() => setOpen(false)}
                      activeOptions={{ exact: l.path === "/" }}
                      activeProps={{ className: "bg-white/10 text-brand-gold" }}
                      className="block px-3 py-3 rounded-md text-base font-medium text-white hover:bg-white/10 hover:text-brand-gold transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
