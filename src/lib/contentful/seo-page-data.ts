import { BASE_URL } from "@/lib/brand";
import type { SeoPageData } from "@/components/site/SeoContentPage";

/** Map a Contentful seoArticle entry onto the shared SEO page shape. */
export function cfToSeoPageData(cf: any): SeoPageData {
  const slugPath = cf.slug.startsWith("/") ? cf.slug : `/${cf.slug}`;
  const canonical = cf.canonicalUrl || `${BASE_URL}${slugPath}`;
  const title = cf.metaTitle || cf.title;
  return {
    slug: cf.slug,
    canonical,
    h1: cf.title || title,
    seo: {
      metaTitle: title,
      metaDescription: cf.metaDescription ?? "",
      canonical,
      ogTitle: title,
      ogDescription: cf.metaDescription ?? "",
      twitterTitle: title,
      twitterDescription: cf.metaDescription ?? "",
      breadcrumb: cf.title || title,
    },
    aiOverview: cf.aiOverview ?? { short: "", medium: "" },
    quickFacts: cf.quickFacts ?? [],
    body: cf.bodySections ?? [],
    eeat: {
      experience: cf.eeat?.experience ?? "",
      expertise: cf.eeat?.expertise ?? "",
      trust: cf.eeat?.trust ?? "",
      transparency: cf.eeat?.transparency ?? "",
      disclaimer: cf.eeat?.disclaimer ?? "",
    },
    faq: (cf.faqs ?? []).map((f: any) => ({ question: f.question, answer: f.answer })),
    internalLinks: cf.internalLinks ?? [],
    cta: {
      hero: cf.ctas?.hero ?? "",
      middle: cf.ctas?.middle ?? "",
      bottom: cf.ctas?.bottom ?? "",
      trust: cf.ctas?.trust ?? "",
      benefits: cf.ctas?.benefits ?? "",
      why: cf.ctas?.why ?? "",
    },
    howto: cf.howto ?? [],
    breadcrumb: [
      { name: "Home", href: "/" },
      { name: cf.title || title, href: slugPath },
    ],
  };
}
