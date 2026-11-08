# Switch the CMS from Contentful to Sanity

Goal: both sites (udyamadhar.in and udyamregistrations.in) read their content from Sanity instead of Contentful, with zero change to page structure, SEO output, URLs, forms, or the admin panel. The Contentful rate limit stops breaking pages.

You have a blank Sanity project, so I'll do the whole thing: schema, content migration, code switch, verification.

## What stays exactly the same

- All route files, page components, SEO markup, canonical URLs, sitemap output.
- The content types the app consumes today — `faq`, `servicePage`, `seoArticle`, `landingPage`, `emailTemplate` — with identical field names (`slug`, `metaTitle`, `metaDescription`, `bodySections`, `quickFacts`, `eeat`, `faqs`, `internalLinks`, `howto`, `ctas`, …).
- Per-site content separation, resolved by request host exactly as today.

## Plan

1. **Connect Sanity** through the Sanity connector so I can read the project ID, datasets and schema directly — no manual IDs needed from you.
2. **Datasets**: use one Sanity project with two datasets, `udyamadhar` and `udyamregistrations`, one per website. (If you'd rather have two separate projects, say so and I'll create the second one instead.)
3. **Define the schema** in Sanity to match the current models 1:1, same field names, so nothing about content shape changes.
4. **Migrate the content automatically.** I read every published entry straight out of the two Contentful spaces (slow, paced requests so the rate limit isn't hit) and write them into the matching Sanity dataset. Target counts, which I'll verify after import:
   - 115 FAQs
   - 13 service pages
   - ~131 SEO articles
   - 1 landing page (`home`)
   - 16 email templates
   If any Contentful read is throttled, I fall back to your uploaded exports for the missing entries.
5. **New data layer** `src/lib/sanity/client.functions.ts` exporting the same functions and return types as the Contentful module (`getFaqs`, `getSeoArticle`, `getServicePage`, `getLandingPage`, `listSeoPages`, `listSeoSlugs`), so page components don't change at all.
6. **Repoint the call sites**: homepage, `$.tsx` catch-all, the service routes, footer, services grid, sitemap builder, and the admin SEO/sitemap tools.
7. **Website config**: add `sanity_project_id` / `sanity_dataset` columns to `websites` so host → dataset mapping is data-driven and editable in Admin → Websites, alongside the existing Contentful columns (kept as a rollback path until you're happy).
8. **Verify**: fetch a sample of live pages on both domains, confirm titles/meta/body/FAQ render from Sanity, confirm `/sitemap.xml` lists the same slugs as before, then publish.

## Reliability (the actual outage fix)

- Sanity reads go through its CDN endpoint, which doesn't have the delivery-API limit that's currently throttling you.
- The existing 5-minute in-process cache stays, and degrades safely: CMS error → last good cached value → database SEO page → bundled HTML. A CMS hiccup can never blank a page again.

## Technical notes

- `@sanity/client` installed with bun, used server-side only inside `createServerFn` handlers. A read token is only needed if a dataset is private; a write token is needed for the one-time import and will be stored as a secret.
- Rich text: the Contentful rich-text → HTML/sections converters already in the codebase are reused during migration, so articles are stored in Sanity in the exact shape the pages already render (`bodySections`, HTML paragraphs). No Portable Text serializer needed and no visual difference.
- Sitemap: `src/lib/sitemap/sitemap.server.ts` gets an equivalent Sanity query per website; the sitemap manager, overrides and diff tool are untouched.
- One small migration: two nullable columns on `websites`. No other schema change.

## What I need from you

- Approve connecting Sanity, and confirm one project with two datasets is fine.
- A Sanity **write token** (Editor role) so I can push the content in — I'll request it through the secure secret prompt, not in chat.
