import { createFileRoute, redirect, notFound } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getArticleBySlug } from "@/lib/seo-articles.functions";
import {
  ArticlePageLayout,
  buildArticleJsonLd,
  type ArticleFaq,
  type ArticleSection,
} from "@/components/site/ArticlePageLayout";
import { BASE_URL } from "@/lib/brand";
import { WpPage } from "@/components/site/PageHero";
import { getContentfulSeoArticle } from "@/lib/contentful/client.functions";
import {
  SeoContentPage,
  buildSeoJsonLd,
  type SeoPageData,
} from "@/components/site/SeoContentPage";

import { cfToSeoPageData } from "@/lib/contentful/seo-page-data";


const setGoneStatus = createIsomorphicFn()
  .client(() => {})
  .server(() => {
    // Lazy import so client bundle never sees the server-only module.
    void import("@tanstack/react-start/server").then(({ setResponseStatus }) =>
      setResponseStatus(410),
    );
  });

// A CMS/database outage must NOT look like a missing page: Google (and Google
// Ads) treat a 404 as "destination not accessible" and disapprove ads, while a
// 503 just tells them to come back later.
const setUnavailableStatus = createIsomorphicFn()
  .client(() => {})
  .server(() => {
    void import("@tanstack/react-start/server").then(({ setResponseStatus }) =>
      setResponseStatus(503),
    );
  });

// Ported legacy page content bundled with the app. Used as a last-resort
// fallback so a page that exists in content stays reachable even when the CMS
// or database is briefly unavailable.
const WP_HTML = import.meta.glob("../content/wp/*.html", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

function titleize(slug: string) {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}



// Retired / never-offered legacy slugs — return 410 Gone so Google de-indexes
// them quickly instead of re-crawling forever (faster than a soft 404).
const GONE_EXACT = new Set<string>([
  "obc-mahamandal-loan-scheme",
  "pmfme-scheme",
  "download-udyam-certificate-2",
  "annasaheb-patil-loan-scheme-documents",
  "annasaheb-patil-mahamandal-loan-scheme-details",
  "annasaheb-patil-customer-care",
  "annasaheb-patil-business-loan",
  "annasaheb-patil-loi",
  "udyam-msme-government-portal-for-msme-registration",
  "udyam-register-how-to-register-your-business-as-msme",
  "kviconline-all-services-united-in-one-place",
  "online-kvic-the-new-face-of-digital-khadi",
  "home",
  "home-3",
  "home-2",
  "shop-act",
  "nlm-scheme",
  "cmegp-scheme",
  "udyam-registration-form-2",
  "udyam-registration-certificate-download-2",
]);
// Anything starting with these prefixes is retired legacy content → 410.
const GONE_PREFIXES = [
  "annasaheb-patil-",
  "wp-",
  "wp_",
  "xmlrpc",
  "pmegp",
  "pmgp-",
  "pm-egp",
  "prime-minister-employment-",
  "kvic-",
  "kvic_",
  "kviconline",
  "elementor-hf",
  "feed",
  "category/",
  "author/",
  "tag/",
  "page/",
  "?p=",
];

function isGone(slug: string) {
  if (GONE_EXACT.has(slug)) return true;
  return GONE_PREFIXES.some((p) => slug.startsWith(p));
}

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const raw = ((params as any)._splat ?? "").toString();

    // Bail on internal/static/multi-segment paths.
    if (!raw || raw.startsWith(".")) {
      throw redirect({ to: "/" });
    }

    // Strip trailing slash. Lowercase for canonicalisation.
    const stripped = raw.replace(/\/+$/, "");
    const lower = stripped.toLowerCase();

    // First segment (for multi-segment paths like /wp-content/uploads/foo).
    const firstSeg = lower.split("/")[0] ?? lower;

    // 410 Gone for retired legacy paths — check BEFORE multi-segment handoff
    // so /wp-content/*, /feed/*, /category/* return 410 instead of redirecting.
    if (isGone(lower) || isGone(firstSeg)) {
      setGoneStatus();
      return { gone: true as const };
    }

    // Canonicalise multi-segment paths: strip trailing slash + lowercase → 301.
    if (raw !== lower) {
      // Multi-segment: nothing to serve at that depth, but land on the
      // canonical (lowercase, no trailing slash) form of the first segment.
      if (stripped.includes("/")) {
        throw redirect({ to: "/" });
      }
      throw redirect({
        to: "/$",
        params: { _splat: lower },
        statusCode: 301,
      });
    }

    // Already-lowercase multi-segment splats: nothing to serve, hand off.
    if (stripped.includes("/")) {
      throw redirect({ to: "/" });
    }

    // Contentful is the source of truth for SEO pages — check it first so a
    // newly published (or edited) entry goes live with no code change.
    let cmsDown = false;
    const cf = await getContentfulSeoArticle({ data: { slug: lower } }).catch(
      () => {
        cmsDown = true;
        return null;
      },
    );
    if (cf) return { cfArticle: cf };

    let dbDown = false;
    const db = await getArticleBySlug({ data: { slug: lower } }).catch(() => {
      dbDown = true;
      return null;
    });
    if (db?.article) return db;

    // Last resort: the ported page content shipped with the app.
    const loadHtml = WP_HTML[`../content/wp/${lower}.html`];
    if (loadHtml) {
      const wpHtml = await loadHtml();
      return { wpHtml, slug: lower };
    }

    // Nothing served it AND a backend was unreachable → temporary, not missing.
    if (cmsDown || dbDown) {
      setUnavailableStatus();
      return { unavailable: true as const };
    }

    throw notFound();
  },
  head: ({ loaderData }) => {
    const cf = (loaderData as any)?.cfArticle;
    if (cf) {
      const d = cfToSeoPageData(cf);
      return {
        meta: [
          { title: d.seo.metaTitle },
          { name: "description", content: d.seo.metaDescription },
          { property: "og:title", content: d.seo.ogTitle },
          { property: "og:description", content: d.seo.ogDescription },
          { property: "og:type", content: "article" },
          { property: "og:url", content: d.canonical },
          { name: "twitter:card", content: "summary_large_image" },
        ],
        links: [{ rel: "canonical", href: d.canonical }],
        scripts: [
          { type: "application/ld+json", children: buildSeoJsonLd(d) },
        ],
      };
    }
    const wpSlug = (loaderData as any)?.wpHtml ? (loaderData as any).slug : null;
    if (wpSlug) {
      const t = `${titleize(wpSlug)} | Udyam Aadhar`;
      return {
        meta: [
          { title: t },
          { property: "og:title", content: t },
          { property: "og:type", content: "article" },
          { property: "og:url", content: `${BASE_URL}/${wpSlug}` },
        ],
        links: [{ rel: "canonical", href: `${BASE_URL}/${wpSlug}` }],
      };
    }
    const a = (loaderData as any)?.article;
    if (!a) {
      if ((loaderData as any)?.gone) {
        return {
          meta: [
            { title: "Gone — Udyam Adhar" },
            { name: "robots", content: "noindex" },
          ],
        };
      }
      if ((loaderData as any)?.unavailable) {
        return {
          meta: [
            { title: "Temporarily unavailable — Udyam Aadhar" },
            { name: "robots", content: "noindex" },
          ],
        };
      }
      return {};
    }
    const slugPath = a.slug.startsWith("/") ? a.slug : `/${a.slug}`;
    const title = a.meta_title ?? a.h1 ?? a.label;
    const description = a.meta_description ?? "";
    const url = `${BASE_URL}${slugPath}`;
    const faq = (Array.isArray(a.faq) ? a.faq : []) as ArticleFaq[];
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        ...(a.cover_image_url
          ? [{ property: "og:image", content: a.cover_image_url }]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            buildArticleJsonLd({
              slug: a.slug,
              h1: a.h1 ?? a.label,
              description: a.meta_description,
              coverImageUrl: a.cover_image_url,
              publishedAt: a.published_at,
              updatedAt: a.updated_at,
              faq,
            }),
          ),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-4 text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <a href="/" className="mt-6 inline-block text-primary underline">
        Return to homepage
      </a>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-4 text-muted-foreground">{String(error)}</p>
      <a href="/" className="mt-6 inline-block text-primary underline">
        Return to homepage
      </a>
    </div>
  ),
  component: ArticleRoute,
});

function ArticleRoute() {
  const data = Route.useLoaderData() as any;
  if (data?.gone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold">410 — Gone</h1>
        <p className="mt-4 text-muted-foreground">
          This page has been permanently removed.
        </p>
        <a href="/" className="mt-6 inline-block text-primary underline">
          Return to homepage
        </a>
      </div>
    );
  }
  if (data?.unavailable) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold">Temporarily unavailable</h1>
        <p className="mt-4 text-muted-foreground">
          We couldn't load this page right now. Please try again in a moment.
        </p>
        <a href="/" className="mt-6 inline-block text-primary underline">
          Return to homepage
        </a>
      </div>
    );
  }
  if (data?.wpHtml) {
    return <WpPage title={titleize(data.slug)} html={data.wpHtml} withForm />;
  }
  if (data?.cfArticle) {
    return <SeoContentPage data={cfToSeoPageData(data.cfArticle)} />;
  }
  const { article, related } = data;
  const sections = (Array.isArray(article.sections) ? article.sections : []) as ArticleSection[];
  const faq = (Array.isArray(article.faq) ? article.faq : []) as ArticleFaq[];
  return (
    <ArticlePageLayout
      h1={article.h1 ?? article.label}
      intro={article.intro}
      sections={sections}
      faq={faq}
      coverImageUrl={article.cover_image_url}
      related={related}
      publishedAt={article.published_at}
      updatedAt={article.updated_at}
    />
  );
}
