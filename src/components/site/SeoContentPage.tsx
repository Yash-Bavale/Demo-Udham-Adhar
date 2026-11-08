import { useState } from "react";
import { LeadForm } from "@/components/site/LeadForm";
import { TrustBlock } from "@/components/site/TrustBlock";
import certImg from "@/assets/udyam-sample-certificate.png.asset.json";

export interface SeoPageParagraph {
  paragraphs?: string[];
}

export interface SeoPageSection {
  heading: string;
  level: number;
  paragraphs: string[];
  subsections?: {
    heading: string;
    level: number;
    paragraphs: string[];
  }[];
}

export interface SeoPageFaq {
  question: string;
  answer: string;
}

export interface SeoPageLink {
  href: string;
  anchor: string;
  reason?: string;
}

export interface SeoPageData {
  slug: string;
  canonical: string;
  h1: string;
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonical: string;
    ogTitle: string;
    ogDescription: string;
    twitterTitle: string;
    twitterDescription: string;
    breadcrumb: string;
  };
  aiOverview: { short: string; medium: string; long?: string };
  quickFacts: { label: string; value: string }[];
  body: SeoPageSection[];
  eeat: {
    experience: string;
    expertise: string;
    trust: string;
    transparency: string;
    disclaimer: string;
  };
  faq: SeoPageFaq[];
  internalLinks: SeoPageLink[];
  cta: {
    hero: string;
    middle: string;
    bottom: string;
    trust: string;
    benefits: string;
    why: string;
  };
  howto: { name: string; text: string }[];
  breadcrumb: { name: string; href: string }[];
}

/**
 * Weave internal links into a paragraph the first time their anchor text
 * appears (case-insensitive). Each link is used at most once per page.
 */
function renderParagraph(text: string, linkPool: Map<string, SeoPageLink>) {
  const parts: (string | { href: string; label: string })[] = [text];
  for (const [key, link] of Array.from(linkPool.entries())) {
    let inserted = false;
    for (let i = 0; i < parts.length && !inserted; i++) {
      const part = parts[i];
      if (typeof part !== "string") continue;
      const idx = part.toLowerCase().indexOf(key.toLowerCase());
      if (idx === -1) continue;
      const before = part.slice(0, idx);
      const match = part.slice(idx, idx + link.anchor.length);
      const after = part.slice(idx + link.anchor.length);
      parts.splice(i, 1, before, { href: link.href, label: match }, after);
      inserted = true;
    }
    if (inserted) linkPool.delete(key);
  }
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <a
        key={i}
        href={p.href}
        className="text-brand-navy underline hover:text-brand-navy-deep"
      >
        {p.label}
      </a>
    ),
  );
}

function CtaBox({ text, tone = "primary" }: { text: string; tone?: "primary" | "muted" }) {
  const bg =
    tone === "primary"
      ? "bg-brand-navy-deep text-white"
      : "bg-brand-navy/5 text-brand-navy-deep border border-brand-navy/20";
  return (
    <div className={`rounded-xl ${bg} p-6 my-8 shadow-sm`}>
      <p className="text-lg font-semibold leading-snug">{text}</p>
      <a
        href="#lead-form"
        className={`mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold ${
          tone === "primary"
            ? "bg-white text-brand-navy-deep hover:bg-white/90"
            : "bg-brand-navy-deep text-white hover:bg-brand-navy"
        }`}
      >
        Get expert help
      </a>
    </div>
  );
}

function FaqAccordion({ faq }: { faq: SeoPageFaq[] }) {
  const [open, setOpen] = useState<number | null>(0);
  if (!faq.length) return null;
  return (
    <div className="space-y-2">
      {faq.map((item, idx) => {
        const isOpen = open === idx;
        return (
          <div key={idx} className="rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : idx)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="font-semibold text-foreground">{item.question}</span>
              <span aria-hidden className="text-brand-navy">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border px-4 py-3 text-[15px] leading-relaxed text-foreground/85">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface SeoContentOverrides {
  h1?: string;
  metaTitle?: string;
  metaDescription?: string;
  aiOverview?: { short?: string; medium?: string; long?: string } | null;
  quickFacts?: { label: string; value: string }[];
  body?: SeoPageSection[];
  eeat?: Partial<SeoPageData["eeat"]> | null;
  faq?: SeoPageFaq[];
  internalLinks?: SeoPageLink[];
  howto?: { name: string; text: string }[];
  cta?: Partial<SeoPageData["cta"]> | null;
}

function mergeSeoData(local: SeoPageData, o?: SeoContentOverrides | null): SeoPageData {
  if (!o) return local;
  const nonEmpty = <T,>(v: T[] | undefined, fallback: T[]): T[] =>
    Array.isArray(v) && v.length ? v : fallback;
  return {
    ...local,
    h1: o.h1?.trim() || local.h1,
    seo: {
      ...local.seo,
      metaTitle: o.metaTitle?.trim() || local.seo.metaTitle,
      metaDescription: o.metaDescription?.trim() || local.seo.metaDescription,
    },
    aiOverview: o.aiOverview ? { ...local.aiOverview, ...stripUndef(o.aiOverview) } : local.aiOverview,
    quickFacts: nonEmpty(o.quickFacts, local.quickFacts),
    body: nonEmpty(o.body, local.body),
    eeat: o.eeat ? { ...local.eeat, ...stripUndef(o.eeat) } : local.eeat,
    faq: nonEmpty(o.faq, local.faq),
    internalLinks: nonEmpty(o.internalLinks, local.internalLinks),
    howto: nonEmpty(o.howto, local.howto),
    cta: o.cta ? { ...local.cta, ...stripUndef(o.cta) } : local.cta,
  };
}

function stripUndef<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in o) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}


export function SeoContentPage({
  data,
  overrides,
}: {
  data: SeoPageData;
  overrides?: SeoContentOverrides | null;
}) {
  const merged = mergeSeoData(data, overrides);
  return <SeoContentPageInner data={merged} />;
}

function SeoContentPageInner({ data }: { data: SeoPageData }) {
  const formTitle = data.seo.metaTitle || data.h1;
  // Build a link pool keyed by anchor text for natural insertion
  const linkPool = new Map<string, SeoPageLink>();
  for (const l of data.internalLinks) {
    if (l.anchor && !linkPool.has(l.anchor)) linkPool.set(l.anchor, l);
  }

  const mid = Math.floor(data.body.length / 2);

  return (
    <div>
      {/* Hero: LeadForm + Sample Certificate (unchanged design) */}
      <section
        id="lead-form"
        className="mx-auto max-w-7xl px-4 py-6 md:py-8 grid gap-6 lg:grid-cols-2 items-start"
      >
        <LeadForm title={formTitle} />
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-form-header text-white text-center py-4">
            <h2 className="text-xl font-bold font-display">Sample Certificate</h2>
          </div>
          <div className="p-6">
            <img
              src={certImg.url}
              alt="Sample Udyam Adhar Certificate"
              width={800}
              height={1035}
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

      {/* Content column */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6 md:p-10">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              {data.breadcrumb.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden>›</span>}
                  {i === data.breadcrumb.length - 1 ? (
                    <span aria-current="page" className="text-foreground">{c.name}</span>
                  ) : (
                    <a href={c.href} className="hover:underline">
                      {c.name}
                    </a>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          {/* H1 */}
          <h1 className="font-display text-3xl md:text-4xl font-bold text-brand-navy-deep">
            {data.h1}
          </h1>

          {/* AI Overview summary box */}
          {data.aiOverview.short && (
            <div
              data-speakable="ai-overview"
              className="mt-6 rounded-xl border-l-4 border-brand-navy bg-brand-navy/5 p-5"
            >
              <p className="text-[15px] leading-relaxed text-foreground/90">
                {data.aiOverview.short}
              </p>
            </div>
          )}

          {/* Hero CTA */}
          {data.cta.hero && <CtaBox text={data.cta.hero} tone="primary" />}

          {/* Quick Facts */}
          {data.quickFacts.length > 0 && (
            <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
              <h2 className="font-display text-xl font-bold text-brand-navy-deep">
                Quick Facts
              </h2>
              <dl className="mt-3 divide-y divide-border">
                {data.quickFacts.map((f, i) => (
                  <div key={i} className="grid grid-cols-1 gap-1 py-2 md:grid-cols-3">
                    <dt className="font-semibold text-foreground">{f.label}</dt>
                    <dd className="md:col-span-2 text-foreground/85">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Body content */}
          <div className="prose-body mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/85">
            {data.body.map((sec, i) => (
              <div key={i}>
                <h2 className="font-display text-2xl font-bold text-brand-navy-deep">
                  {sec.heading}
                </h2>
                {sec.paragraphs.map((p, j) => {
                  const isHtml = /^<[a-z]/i.test(p.trim());
                  return isHtml ? (
                    <div
                      key={j}
                      className="mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_li]:mt-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic [&_a]:text-brand-navy [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: p }}
                    />
                  ) : (
                    <p key={j} className="mt-3">
                      {renderParagraph(p, linkPool)}
                    </p>
                  );
                })}
                {sec.subsections?.map((sub, k) => (
                  <div key={k} className="mt-4">
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      {sub.heading}
                    </h3>
                    {sub.paragraphs.map((p, j) => {
                      const isHtml = /^<[a-z]/i.test(p.trim());
                      return isHtml ? (
                        <div
                          key={j}
                          className="mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_li]:mt-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic [&_a]:text-brand-navy [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: p }}
                        />
                      ) : (
                        <p key={j} className="mt-2">
                          {renderParagraph(p, linkPool)}
                        </p>
                      );
                    })}
                  </div>
                ))}

                {/* Middle CTA halfway through body */}
                {i === mid && data.cta.middle && (
                  <CtaBox text={data.cta.middle} tone="muted" />
                )}
              </div>
            ))}
          </div>

          {/* EEAT — "Why trust this page" */}
          {(data.eeat.experience || data.eeat.expertise || data.eeat.trust || data.eeat.disclaimer) && (
            <div className="mt-10 rounded-xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold text-brand-navy-deep">
                Why trust this guide
              </h2>
              <dl className="mt-3 space-y-2 text-[14px] text-foreground/85">
                {data.eeat.experience && (
                  <div>
                    <dt className="font-semibold text-foreground">Experience</dt>
                    <dd>{data.eeat.experience}</dd>
                  </div>
                )}
                {data.eeat.expertise && (
                  <div>
                    <dt className="font-semibold text-foreground">Expertise</dt>
                    <dd>{data.eeat.expertise}</dd>
                  </div>
                )}
                {data.eeat.trust && (
                  <div>
                    <dt className="font-semibold text-foreground">Trust</dt>
                    <dd>{data.eeat.trust}</dd>
                  </div>
                )}
                {data.eeat.transparency && (
                  <div>
                    <dt className="font-semibold text-foreground">Transparency</dt>
                    <dd>{data.eeat.transparency}</dd>
                  </div>
                )}
                {data.eeat.disclaimer && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 mt-3">
                    <dt className="font-semibold">Private consultancy disclaimer</dt>
                    <dd>{data.eeat.disclaimer}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* FAQ */}
          {data.faq.length > 0 && (
            <div className="mt-10">
              <h2 className="font-display text-2xl font-bold text-brand-navy-deep">
                Frequently Asked Questions
              </h2>
              <div className="mt-4">
                <FaqAccordion faq={data.faq} />
              </div>
            </div>
          )}

          {/* Related guides — always render declared internal links */}
          {data.internalLinks.length > 0 && (
            <div className="mt-10 rounded-xl border border-border bg-muted/30 p-6">
              <h2 className="font-display text-xl font-bold text-brand-navy-deep">
                Related guides
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.internalLinks.map((l, i) => (
                  <li key={i}>
                    <a
                      href={l.href}
                      className="text-brand-navy underline hover:text-brand-navy-deep"
                    >
                      {l.anchor}
                    </a>
                    {l.reason && (
                      <span className="ml-1 text-sm text-muted-foreground">
                        — {l.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bottom CTA */}
          {data.cta.bottom && <CtaBox text={data.cta.bottom} tone="primary" />}
        </div>
      </section>


      <TrustBlock />
    </div>
  );
}

/**
 * Build the JSON-LD script contents for a page.
 * Returns a JSON-serialised @graph object so a single script tag covers
 * Organization / Service / WebPage / BreadcrumbList / FAQPage / Article
 * / HowTo / Speakable.
 */
export function buildSeoJsonLd(data: SeoPageData): string {
  const url = data.canonical;
  const graph: Record<string, unknown>[] = [];

  graph.push({
    "@type": "Organization",
    "@id": "https://udyamadhar.in/#organization",
    name: "Udyam Aadhar",
    alternateName: "Udyamadhar",
    url: "https://udyamadhar.in/",
    logo: "https://udyamadhar.in/favicon.ico",
    description:
      "Udyam Aadhar is a private MSME and Udyam Registration consultancy assisting Indian small businesses.",
  });

  graph.push({
    "@type": "Service",
    serviceType: data.h1,
    provider: { "@id": "https://udyamadhar.in/#organization" },
    areaServed: "India",
    description: data.seo.metaDescription,
    url,
  });

  graph.push({
    "@type": "WebPage",
    "@id": url,
    url,
    name: data.seo.metaTitle,
    description: data.seo.metaDescription,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["[data-speakable=ai-overview]"],
    },
  });

  graph.push({
    "@type": "BreadcrumbList",
    itemListElement: data.breadcrumb.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `https://udyamadhar.in${c.href}`,
    })),
  });

  if (data.faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: data.faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  graph.push({
    "@type": "Article",
    headline: data.h1,
    description: data.seo.metaDescription,
    author: { "@type": "Organization", name: "Udyam Aadhar Editorial Team" },
    publisher: { "@id": "https://udyamadhar.in/#organization" },
    mainEntityOfPage: url,
  });

  if (data.howto.length) {
    graph.push({
      "@type": "HowTo",
      name: data.h1,
      step: data.howto.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}
