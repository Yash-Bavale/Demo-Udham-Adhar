import { sanitizeHtmlLite } from "@/lib/html/sanitize-lite";
import { LeadForm } from "@/components/site/LeadForm";
import { TrustBlock } from "@/components/site/TrustBlock";
import certImg from "@/assets/udyam-sample-certificate.png.asset.json";
import { BASE_URL } from "@/lib/brand";

// Allow only safe formatting tags; strip <script>, event handlers, iframes,
// inline styles, etc. Admin-authored HTML in seo_pages.sections/faq is
// sanitized before it reaches dangerouslySetInnerHTML so a compromised
// admin account cannot inject stored XSS into public pages.
// Uses a dependency-free sanitizer so the browser bundle doesn't ship
// sanitize-html's postcss/source-map payload (~250KB) on every page.
function sanitizeHtml(html: string): string {
  return sanitizeHtmlLite(html);
}



export interface ArticleSection {
  h2?: string;
  h3?: string;
  body_html?: string;
}

export interface ArticleFaq {
  q: string;
  a: string;
}

export interface ArticleRelated {
  slug: string;
  label: string;
}

export interface ArticlePageProps {
  h1: string;
  intro?: string | null;
  sections: ArticleSection[];
  faq?: ArticleFaq[];
  coverImageUrl?: string | null;
  related?: ArticleRelated[];
  publishedAt?: string | null;
  updatedAt?: string | null;
}

const proseClasses =
  "p-6 md:p-8 space-y-4 text-foreground/85 text-[15px] leading-relaxed " +
  "[&_h1]:font-display [&_h1]:text-brand-navy-deep [&_h1]:text-2xl md:[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:first:mt-0 " +
  "[&_h2]:font-display [&_h2]:text-brand-navy-deep [&_h2]:text-xl md:[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-7 [&_h2]:first:mt-0 " +
  "[&_h3]:font-display [&_h3]:text-foreground [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-5 " +
  "[&_a]:text-brand-navy [&_a]:underline " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 " +
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 " +
  "[&_p]:my-3 [&_strong]:text-foreground";

export function ArticlePageLayout({
  h1,
  intro,
  sections,
  faq,
  coverImageUrl,
  related,
  publishedAt,
  updatedAt,
}: ArticlePageProps) {
  const dateLabel = updatedAt ?? publishedAt;
  const keyword = (h1.split(/[:\u2014\u2013\-]/)[0] || h1).trim();

  return (
    <div>
      {/* Top: lead form + sample certificate — same as service pages */}
      <section className="mx-auto max-w-7xl px-4 py-6 md:py-8 grid gap-6 lg:grid-cols-2 items-start">
        <LeadForm title={keyword} />

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-form-header text-white text-center py-4">
            <h2 className="text-xl font-bold font-display">Sample Certificate</h2>
          </div>
          <div className="p-6">
            <img
              src={certImg.url}
              alt="Sample Udyam Adhar Certificate"
              className="w-full h-auto rounded-md border border-border"
              loading="eager"
              fetchPriority="high"
            />
            <p className="mt-3 text-center text-sm text-muted-foreground text-slate-950">
              Note: Sample Udyam Adhar Certificate shown for reference purposes only.
            </p>
          </div>
        </div>
      </section>

      {/* SEO article body */}
      <section className="mx-auto max-w-5xl px-4 pb-10">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-form-header text-white text-center py-4">
            <h2 className="text-xl font-bold font-display">{keyword}</h2>
          </div>
          <div className={proseClasses}>
            <h1 className="!text-center">
              <a href="" className="text-brand-navy-deep underline">
                {h1}
              </a>
            </h1>


            {dateLabel ? (
              <p className="text-sm text-muted-foreground !my-1">
                Updated{" "}
                {new Date(dateLabel).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            ) : null}

            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt={h1}
                className="my-4 w-full h-auto rounded-xl border border-border"
                loading="lazy"
              />
            ) : null}

            {intro ? (
              <p className="text-lg text-foreground/85 leading-relaxed">{intro}</p>
            ) : null}

            {sections.map((s, i) => (
              <div key={i}>
                {s.h2 ? <h2>{s.h2}</h2> : null}
                {s.h3 ? <h3>{s.h3}</h3> : null}
                {s.body_html ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.body_html) }} />
                ) : null}

              </div>
            ))}

            {faq && faq.length ? (
              <div className="mt-10">

                <div className="space-y-3 not-prose">
                  {faq.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-muted/30 p-4"
                    >
                      <p className="font-semibold text-brand-navy-deep">{f.q}</p>
                      <div
                        className="mt-2 text-foreground/85 text-[15px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(f.a) }}
                      />

                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {related && related.length ? (
              <nav aria-label="Related articles" className="mt-10">
                <h2>Related reading</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {related.map((r) => {
                    const path = r.slug.startsWith("/") ? r.slug : `/${r.slug}`;
                    return (
                      <li key={r.slug}>
                        <a href={path}>{r.label}</a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ) : null}
          </div>
        </div>
      </section>

      {/* Standard trust block (includes "Udyam Assistance Process – Fast & Simple"
          and "We provide consultancy services across India") */}
      <TrustBlock />
    </div>
  );
}

export function buildArticleJsonLd(args: {
  slug: string;
  h1: string;
  description?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  faq?: ArticleFaq[];
}) {
  const slugPath = args.slug.startsWith("/") ? args.slug : `/${args.slug}`;
  const url = `${BASE_URL}${slugPath}`;
  const graph: unknown[] = [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: args.h1,
      description: args.description ?? undefined,
      image: args.coverImageUrl ?? undefined,
      datePublished: args.publishedAt ?? undefined,
      dateModified: args.updatedAt ?? args.publishedAt ?? undefined,
      mainEntityOfPage: url,
      publisher: { "@id": `${BASE_URL}/#organization` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL + "/" },
        { "@type": "ListItem", position: 2, name: args.h1, item: url },
      ],
    },
  ];
  if (args.faq && args.faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: args.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
