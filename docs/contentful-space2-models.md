# Contentful — Space 2 (udyamregistrations.in) Content Models

Space: `xn7rc3iqh7xq` · Environment: `master` · Delivery key: `CONTENTFUL_API_KEY_2`

All 7 models below already exist and are published. Use this as the authoring
reference (and to recreate them manually if ever needed).

Legend: `*` = required. "Object" = JSON object field. "RichText" = rich text.

---

## 1. `faq` — display field: `question`
| Field ID | Type | Notes |
|---|---|---|
| question* | Symbol | Short text |
| answer* | RichText | Rendered as plain text on site |
| category | Symbol | Groups FAQs on homepage |

Used by: homepage FAQ accordion (10 per page, "read more").

## 2. `servicePage` — display: `serviceCode`
| Field ID | Type | Notes |
|---|---|---|
| serviceCode* | Symbol | Must match the CRM service code |
| name* | Symbol | |
| slug* | Symbol | URL segment, lowercase-hyphen |
| shortDescription* | Symbol | |
| longDescription* | RichText | |
| heroImage | Link (Asset) | |
| priceInclusive* | Integer | GST-inclusive price in INR |
| processingDays | Integer | |
| benefits | Array of Symbol | |
| documentsRequired | Array of Symbol | |
| faqs | Array of Link (Entry → faq) | |
| metaTitle* | Symbol | <60 chars |
| metaDescription* | Symbol | <160 chars |
| bodySections | Object | Optional structured body override |
| internalLinksJson | Object | `[{ href, anchor, reason }]` |
| ctas | Object | `{ hero, middle, bottom, trust }` |

## 3. `seoArticle` — display: `slug`
| Field ID | Type | Notes |
|---|---|---|
| title* | Array of Symbol | First item is used |
| slug* | Symbol | Also resolvable as a live URL via the catch-all route |
| metaTitle* | Symbol | |
| metaDescription* | Symbol | |
| heroImage | Link (Asset) | Used for og:image |
| body* | RichText | |
| publishedAt* | Date | |
| tags | Array of Symbol | |
| canonicalUrl | Symbol | |
| aiOverview | Object | `{ short, medium, long }` |
| quickFacts | Object | `[{ label, value }]` |
| bodySections | Object | `[{ heading, level, paragraphs[], subsections[] }]` |
| eeat | Object | `{ experience, expertise, trust, transparency, disclaimer }` |
| faqs | Object | `[{ question, answer }]` |
| internalLinks | Object | `[{ href, anchor, reason }]` |
| howto | Object | `[{ name, text }]` |
| ctas | Object | `{ hero, middle, bottom, trust, benefits, why }` |

Publishing a `seoArticle` with a new slug makes that page live on
udyamregistrations.in immediately — no DB row needed.

## 4. `landingPage` — display: `slug`
| Field ID | Type | Notes |
|---|---|---|
| slug* | Symbol | Use `home` for the homepage |
| title* | Symbol | |
| sections* | Array of Link (Entry → heroSection, featureSection) | |
| metaTitle* | Symbol | |
| metaDescription | Symbol | |
| ogImage | Link (Asset) | |
| hero | Object | `{ heading, subheading, ctaLabel, ctaUrl }` |
| howItWorks | Object | array of strings |
| whyUs | Object | array of strings |
| faqs | Object | `[{ question, answer }]` |
| ctas | Object | key → label map |

## 5. `heroSection` — display: `internalName`
| Field ID | Type |
|---|---|
| internalName* | Symbol |
| heading* | Symbol |
| subheading | Text |
| ctaLabel | Symbol |
| ctaUrl | Symbol |
| backgroundImage | Link (Asset) |

## 6. `featureSection` — display: `internalName`
| Field ID | Type | Notes |
|---|---|---|
| internalName* | Symbol | |
| heading* | Symbol | |
| items* | Object | `[{ title, description, icon }]` |

## 7. `emailTemplate` — display: `code`
| Field ID | Type | Notes |
|---|---|---|
| code* | Symbol | e.g. `E001` |
| name* | Symbol | |
| subject* | Symbol | |
| bodyHtml* | Text | |
| variables | Array of Symbol | `{{name}}` placeholders |
| description | Symbol | |

---

## Current content in space 2
- 115 `faq` entries
- 13 `servicePage` entries
- 1 `landingPage` (`home`)
- 0 `seoArticle` — start authoring here for new SEO pages

## Rules
- Always **Publish** (not just save) — the delivery API only returns published entries.
- Slugs: lowercase, hyphens only, no leading slash.
- Content falls back to local defaults if an entry is missing, so a bad slug never breaks the page.
