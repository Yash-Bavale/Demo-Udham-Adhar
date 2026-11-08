import { useEffect } from "react";
import { UdyamRegistrationsSections, UDYAM_SERVICES_LIST } from "@/components/site/UdyamRegistrationsSections";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { LeadForm } from "@/components/site/LeadForm";
import { UserSquare2, Fingerprint, Share2, Download, ArrowRight } from "lucide-react";
import { HomeFaqSection } from "@/components/site/HomeFaqSection";
import { trackEvent } from "@/lib/analytics/track";
import certImg from "@/assets/udyam-sample-certificate.png.asset.json";
import mapImg from "@/assets/india-map.svg.asset.json";
import {
  orgSchema,
  websiteSchema,
  faqSchema,
  jsonLdScript,
} from "@/lib/seo/jsonld";
import { useBrand } from "@/lib/websites/brand-context";
import { getCurrentBrand } from "@/lib/websites/current-brand.functions";
import { useBlockItems } from "@/lib/websites/site-content-context";
import {
  getContentfulLandingPage,
  getContentfulFaqs,
  listContentfulSeoPages,
  type ContentfulLandingPage,
  type ContentfulSeoPage,
} from "@/lib/contentful/client.functions";
import { FAQS as FALLBACK_FAQS } from "@/lib/faqs-data";

const HOMEPAGE_TITLE =
  "Udyam Registration Online | MSME Portal";
const HOMEPAGE_DESC =
  "Apply for Udyam Registration online — new MSME registration, certificate download, Udyog Aadhaar migration and Udyam updates, with expert help.";


const STEPS = [
  { icon: UserSquare2, label: "Fill Form & Make Payment", color: "text-brand-navy" },
  { icon: Fingerprint, label: "Submit Required Information", color: "text-brand-red" },
  { icon: Share2, label: "Expert Assistance & Verification", color: "text-brand-navy" },
  { icon: Download, label: "Updates Shared via Email", color: "text-green-600" },
];

const FACTS: [string, string][] = [
  ["Country", "India"],
  ["Area", "3,287,263 sq. km."],
  ["States", "28"],
  ["Population", "1,46,39,00,000"],
  ["Literacy", "80.9%"],
];

export const Route = createFileRoute("/")({
  loader: async () => {
    const brand = await getCurrentBrand();
    const isUdyamRegistrationsSite =
      brand.baseUrl.toLowerCase().includes("udyamregistration");

    const [cms, cfFaqs, cfSeoPages] = await Promise.all([
      getContentfulLandingPage({ data: { slug: "home" } }),
      getContentfulFaqs(),
      // Only fetch the full SEO page list for the 2nd website (avoids extra
      // round-trip for every visitor on the primary site).
      isUdyamRegistrationsSite
        ? listContentfulSeoPages().catch(() => [] as ContentfulSeoPage[])
        : Promise.resolve([] as ContentfulSeoPage[]),
    ]);
    // Prefer the Contentful `faq` content type (scales past 100 entries),
    // then the landing-page faqs field, then the local fallback dataset.
    const rawFaqs = cfFaqs.length
      ? cfFaqs.map((f) => ({ q: f.question, a: f.answer }))
      : cms?.faqs?.length
        ? cms.faqs.map((f) => ({ q: f.question, a: f.answer }))
        : FALLBACK_FAQS.map((f) => ({ q: f.q, a: f.a }));
    const seen = new Set<string>();
    const faqs = rawFaqs.filter((f) => {
      const key = f.q.trim().toLowerCase();
      if (!f.q.trim() || !f.a.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      cms,
      faqs,
      seoPages: cfSeoPages,
      baseUrl: brand.baseUrl,
      siteName: brand.siteName,
      legalEntity: brand.legalEntity,
    };
  },
  head: ({ loaderData }) => {
    const ld = loaderData as
      | {
        cms: ContentfulLandingPage | null;
        faqs?: Array<{ q: string; a: string }>;
        baseUrl?: string;
        legalEntity?: string;
      }
      | undefined;
    const cms = ld?.cms;
    const baseUrl = ld?.baseUrl || "https://udyamadhar.in";
    const orgName = ld?.legalEntity || "Business Help Services";
    const title = cms?.metaTitle || HOMEPAGE_TITLE;
    const desc = cms?.metaDescription || HOMEPAGE_DESC;
    const faqList = ld?.faqs ?? [];
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: `${baseUrl}/` },
      ],
      links: [
        { rel: "canonical", href: `${baseUrl}/` },
        // Preload the LCP image so the browser fetches it before React mounts.
        {
          rel: "preload",
          as: "image",
          href: certImg.url,
          fetchPriority: "high",
        },
      ],
      scripts: [
        jsonLdScript(orgSchema(baseUrl)),
        jsonLdScript(faqSchema(faqList)),
        jsonLdScript(websiteSchema(baseUrl)),
        ...(baseUrl.toLowerCase().includes("udyamregistration")
          ? [
            jsonLdScript({
              "@context": "https://schema.org",
              "@type": "ItemList",
              "name": "Udyam & MSME Registration Services",
              "itemListElement": UDYAM_SERVICES_LIST.map((srv, index) => ({
                "@type": "ListItem",
                "position": index + 1,
                "name": srv.title,
                "url": `${baseUrl}${srv.path}`,
              })),
            }),
          ]
          : []),
      ],
    };
  },
  component: HomePage,
});


function HomePage() {
  const { cms, faqs: faqList, seoPages } = useLoaderData({ from: "/" }) as {
    cms: ContentfulLandingPage | null;
    faqs: Array<{ q: string; a: string }>;
    seoPages: ContentfulSeoPage[];
  };
  const factsBlock = useBlockItems<{ label: string; value: string }>(
    "home.facts",
    FACTS.map(([label, value]) => ({ label, value })),
  );
  const brand = useBrand();
  const certUrl = brand.sampleCertificateAssetUrl || certImg.url;
  const heroHeading = cms?.hero?.heading || "Udyam Registration & MSME Certificate Services";
  const heroSub = cms?.hero?.subheading ||
    "Private consultancy & assistance for new Udyam (MSME) registration, certificate updates, downloads and Udyog Aadhaar to Udyam migration — pan-India support in English & Hindi.";

  const isUdyamRegistrations =
    brand.domain.toLowerCase().includes("udyamregistration") ||
    (typeof window !== "undefined" && window.location.search.includes("site=udyamregistrations"));

  useEffect(() => {
    trackEvent("page_view_landing", { path: "/" });
  }, []);
  return (
    <>
      {/* SEO H1 — kept in DOM for crawlers, visually hidden */}
      <section className="sr-only">
        <h1>{heroHeading}</h1>
        <p>{heroSub}</p>
      </section>


      {/* Form + Sample Certificate */}
      <section className="mx-auto max-w-7xl px-4 py-6 md:py-8 grid gap-6 lg:grid-cols-2 items-start">
        <LeadForm />
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-form-header text-white text-center py-4">
            <h2 className="text-xl font-bold font-display">Sample Certificate</h2>
          </div>
          <div className="p-6">
            <img
              src={certUrl}
              alt={`Sample ${brand.siteName} certificate`}
              width={1200}
              height={849}
              className="w-full h-auto rounded-md border border-border"
              loading="eager"
              fetchPriority="high"
            />

            <p className="mt-3 text-center text-sm text-muted-foreground text-slate-950">
              Note: Sample Udyam Certificate shown for reference purposes only.
            </p>
          </div>
        </div>
      </section>

      {/* Contentful Homepage Rich Content Section */}
      {cms?.longDescription ? (
        <section className="w-full bg-white border-y border-border py-10 md:py-14 my-6">
          <div className="mx-auto max-w-7xl px-4">
            <div
              className="text-foreground/90 text-[15px] space-y-4 [&_h1]:font-display [&_h1]:text-brand-navy-deep [&_h1]:text-3xl [&_h1]:md:text-4xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-6 [&_h2]:font-display [&_h2]:text-brand-navy-deep [&_h2]:text-2xl [&_h2]:md:text-3xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-border/50 [&_h3]:font-display [&_h3]:text-foreground [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3 [&_h4]:font-display [&_h4]:text-foreground [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_p]:my-3.5 [&_p]:leading-relaxed [&_p]:text-foreground/85 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_ol]:space-y-2 [&_a]:text-brand-navy [&_a]:font-medium [&_a]:underline [&_a]:hover:text-brand-navy-deep [&_strong]:font-semibold [&_strong]:text-foreground [&_blockquote]:border-l-4 [&_blockquote]:border-brand-navy [&_blockquote]:bg-muted/30 [&_blockquote]:p-4 [&_blockquote]:rounded-r-md [&_blockquote]:italic [&_blockquote]:my-4"
              dangerouslySetInnerHTML={{ __html: cms.longDescription }}
            />
          </div>
        </section>
      ) : null}

      {/* 2nd Website Sections: ONLY rendered for 2nd website udyamregistrations.in */}
      {isUdyamRegistrations && <UdyamRegistrationsSections seoPages={seoPages} />}

      <HomeFaqSection faqs={faqList} />


      {/* Process Steps */}
      <section className="bg-brand-navy/10">
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-12">
          <h2 className="text-center text-2xl md:text-3xl font-bold font-display text-foreground">
            Udyam Assistance Process – Fast &amp; Simple
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-4 items-start">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white shadow-md flex items-center justify-center">
                    <Icon className={`w-9 h-9 md:w-11 md:h-11 ${s.color}`} strokeWidth={2} />
                  </div>
                  <p className="mt-4 font-bold text-foreground text-sm md:text-base leading-snug max-w-[12ch]">
                    {s.label}
                  </p>
                  {i < STEPS.length - 1 && (
                    <ArrowRight
                      className="hidden md:block absolute top-10 -right-3 w-6 h-6 text-foreground"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* India Coverage + Served States */}
      <section className="mx-auto max-w-5xl px-4 py-10 md:py-12">
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <div className="bg-muted/40 px-6 py-5 border-b border-border">
            <h2 className="text-center text-2xl md:text-3xl font-bold font-display text-foreground">
              A Vision on India
            </h2>
          </div>
          <div className="p-4 md:p-6 flex justify-center">
            <img
              src={mapImg.url}
              alt="Map of India showing all states where consultancy services are provided"
              className="w-full max-w-xl h-auto"
              loading="lazy"
            />
          </div>
          <table className="w-full border-t border-border text-sm md:text-base">
            <tbody>
              {factsBlock.map(({ label: k, value: v }) => (
                <tr key={k} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="w-1/2 text-left font-normal text-foreground px-4 md:px-6 py-4 border-r border-border"
                  >
                    {k}
                  </th>
                  <td className="px-4 md:px-6 py-4 text-foreground">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
