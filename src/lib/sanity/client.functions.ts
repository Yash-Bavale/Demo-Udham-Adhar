import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/* -------------------------------------------------------------------------- */
/*  Types (identical shape to the previous CMS layer — pages stay unchanged)   */
/* -------------------------------------------------------------------------- */

export type SanityFaq = {
  id: string;
  question: string;
  answer: string;
  category: string;
};

export type SanityServicePage = {
  id: string;
  serviceCode: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  priceInclusive: number | null;
  processingDays: number | null;
  metaTitle: string;
  metaDescription: string;
};

export type SanitySeoArticle = {
  id: string;
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  body: string;
  canonicalUrl: string;
  publishedAt: string;
  aiOverview: { short?: string; medium?: string; long?: string } | null;
  quickFacts: Array<{ label: string; value: string }>;
  bodySections: Array<{
    heading: string;
    level: number;
    paragraphs: string[];
    subsections?: Array<{ heading: string; level: number; paragraphs: string[] }>;
  }>;
  eeat: {
    experience?: string;
    expertise?: string;
    trust?: string;
    transparency?: string;
    disclaimer?: string;
  } | null;
  faqs: Array<{ question: string; answer: string }>;
  internalLinks: Array<{ href: string; anchor: string; reason?: string }>;
  howto: Array<{ name: string; text: string }>;
  ctas: {
    hero?: string;
    middle?: string;
    bottom?: string;
    trust?: string;
    benefits?: string;
    why?: string;
  } | null;
};

export type SanityLandingPage = {
  id: string;
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  hero: { heading?: string; subheading?: string; ctaLabel?: string; ctaUrl?: string } | null;
  howItWorks: string[];
  whyUs: string[];
  faqs: Array<{ question: string; answer: string }>;
  ctas: Record<string, string> | null;
  longDescription?: string;
};

export type SanitySeoSlug = { slug: string; canonicalUrl: string; updatedAt: string };
export type SanitySeoPage = { slug: string; title: string };

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const str = (v: unknown) => String(v ?? "").trim();
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/* -------------------------------------------------------------------------- */
/*  FAQs                                                                       */
/* -------------------------------------------------------------------------- */

export const getSanityFaqs = createServerFn({ method: "GET" }).handler(
  async (): Promise<SanityFaq[]> => {
    try {
      const { sanityQuery } = await import("./sanity.server");
      const rows = await sanityQuery<Array<Record<string, unknown>>>(
        getRequest(),
        `*[_type == "faq"] | order(_createdAt asc){ _id, question, answer, category }`,
      );
      return rows
        .map((r) => ({
          id: str(r["_id"]),
          question: str(r["question"]),
          answer: str(r["answer"]),
          category: str(r["category"]),
        }))
        .filter((f) => f.question && f.answer);
    } catch (err) {
      console.error("[sanity] getSanityFaqs failed:", err);
      return [];
    }
  },
);

/* -------------------------------------------------------------------------- */
/*  Service pages                                                              */
/* -------------------------------------------------------------------------- */

export const getSanityServicePage = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<SanityServicePage | null> => {
    try {
      const { sanityQuery } = await import("./sanity.server");
      const r = await sanityQuery<Record<string, unknown> | null>(
        getRequest(),
        `*[_type == "servicePage" && slug == $slug][0]`,
        { slug: data.slug },
      );
      if (!r) {
        const article = await getSanitySeoArticle({ data: { slug: data.slug } }).catch(() => null);
        if (article) {
          return {
            id: article.id,
            serviceCode: data.slug,
            slug: article.slug,
            name: article.title,
            shortDescription: article.metaDescription,
            longDescription: article.body,
            priceInclusive: null,
            processingDays: null,
            metaTitle: article.metaTitle,
            metaDescription: article.metaDescription,
          };
        }
        return null;
      }
      return {
        id: str(r["_id"]),
        serviceCode: str(r["serviceCode"]),
        slug: str(r["slug"]),
        name: str(r["name"]),
        shortDescription: str(r["shortDescription"]),
        longDescription: str(r["longDescription"]),
        priceInclusive: typeof r["priceInclusive"] === "number" ? (r["priceInclusive"] as number) : null,
        processingDays: typeof r["processingDays"] === "number" ? (r["processingDays"] as number) : null,
        metaTitle: str(r["metaTitle"]),
        metaDescription: str(r["metaDescription"]),
      };
    } catch (err) {
      console.error("[sanity] getSanityServicePage failed:", err);
      return null;
    }
  });

/* -------------------------------------------------------------------------- */
/*  SEO articles                                                               */
/* -------------------------------------------------------------------------- */

export const getSanitySeoArticle = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<SanitySeoArticle | null> => {
    try {
      const { sanityQuery } = await import("./sanity.server");
      const r = await sanityQuery<Record<string, unknown> | null>(
        getRequest(),
        `*[_type == "seoArticle" && slug == $slug][0]`,
        { slug: data.slug.toLowerCase() },
      );
      if (!r) return null;
      return {
        id: str(r["_id"]),
        slug: str(r["slug"]),
        title: str(r["title"]),
        metaTitle: str(r["metaTitle"]),
        metaDescription: str(r["metaDescription"]),
        body: str(r["body"]),
        canonicalUrl: str(r["canonicalUrl"]),
        publishedAt: str(r["publishedAt"]),
        aiOverview: (r["aiOverview"] as SanitySeoArticle["aiOverview"]) ?? null,
        quickFacts: arr(r["quickFacts"]),
        bodySections: arr(r["bodySections"]),
        eeat: (r["eeat"] as SanitySeoArticle["eeat"]) ?? null,
        faqs: arr(r["faqs"]),
        internalLinks: arr(r["internalLinks"]),
        howto: arr(r["howto"]),
        ctas: (r["ctas"] as SanitySeoArticle["ctas"]) ?? null,
      };
    } catch (err) {
      console.error("[sanity] getSanitySeoArticle failed:", err);
      return null;
    }
  });

/* -------------------------------------------------------------------------- */
/*  Landing page                                                               */
/* -------------------------------------------------------------------------- */

export const getSanityLandingPage = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<SanityLandingPage | null> => {
    try {
      const { sanityQuery } = await import("./sanity.server");
      const r = await sanityQuery<Record<string, unknown> | null>(
        getRequest(),
        `*[_type == "landingPage" && slug == $slug][0]`,
        { slug: data.slug },
      );
      if (!r) return null;
      return {
        id: str(r["_id"]),
        slug: str(r["slug"]),
        title: str(r["title"]),
        metaTitle: str(r["metaTitle"]),
        metaDescription: str(r["metaDescription"]),
        hero: (r["hero"] as SanityLandingPage["hero"]) ?? null,
        howItWorks: arr(r["howItWorks"]),
        whyUs: arr(r["whyUs"]),
        faqs: arr(r["faqs"]),
        ctas: (r["ctas"] as SanityLandingPage["ctas"]) ?? null,
        longDescription: str(r["longDescription"]),
      };
    } catch (err) {
      console.error("[sanity] getSanityLandingPage failed:", err);
      return null;
    }
  });

/* -------------------------------------------------------------------------- */
/*  Slug / page indexes (service grids, sitemap)                               */
/* -------------------------------------------------------------------------- */

export const listSanitySeoPages = createServerFn({ method: "GET" }).handler(
  async (): Promise<SanitySeoPage[]> => {
    try {
      const { sanityQuery } = await import("./sanity.server");
      const rows = await sanityQuery<Array<{ slug?: string; title?: string }>>(
        getRequest(),
        `*[_type == "seoArticle" && defined(slug)]{ slug, title }`,
      );
      const seen = new Set<string>();
      const out: SanitySeoPage[] = [];
      for (const r of rows) {
        const slug = str(r.slug).toLowerCase();
        if (!slug || slug === "home" || slug === "index" || seen.has(slug)) continue;
        seen.add(slug);
        out.push({
          slug,
          title: str(r.title) || slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        });
      }
      return out;
    } catch (err) {
      console.error("[sanity] listSanitySeoPages failed:", err);
      return [];
    }
  },
);

export const listSanitySeoSlugs = createServerFn({ method: "GET" }).handler(
  async (): Promise<SanitySeoSlug[]> => {
    try {
      const { sanityQuery } = await import("./sanity.server");
      const rows = await sanityQuery<Array<{ slug?: string; canonicalUrl?: string; _updatedAt?: string }>>(
        getRequest(),
        `*[_type == "seoArticle" && defined(slug)]{ slug, canonicalUrl, _updatedAt }`,
      );
      const seen = new Set<string>();
      const out: SanitySeoSlug[] = [];
      for (const r of rows) {
        const slug = str(r.slug).toLowerCase();
        if (!slug || slug === "home" || slug === "index" || seen.has(slug)) continue;
        seen.add(slug);
        out.push({
          slug,
          canonicalUrl: str(r.canonicalUrl),
          updatedAt: str(r._updatedAt).slice(0, 10),
        });
      }
      return out;
    } catch (err) {
      console.error("[sanity] listSanitySeoSlugs failed:", err);
      return [];
    }
  },
);
