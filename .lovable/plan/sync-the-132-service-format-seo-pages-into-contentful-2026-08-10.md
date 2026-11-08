# Sync the 132 service-format SEO pages into Contentful

## What's there now (verified)

- `seo_pages` holds **187** rows, all on udyamadhar.in:
  - **132** in the older "service" format (created 30 May) — 127 on, 5 off.
  - **55** in the newer "article" format (7 June) — out of scope for this task.
- Contentful space 1 (udyamadhar.in) currently has only **2** `seoArticle` entries,
13 `servicePage`, 1 `landingPage` — so the old service pages were never pushed there.
- A management token for space 1 is already configured, so entries can be created
and published programmatically.

## What will be done

1. **One-off sync script** that reads the 132 service-format pages from the database and
  upserts each one into Contentful space 1 as a published `seoArticle`, matched by slug:
  - `slug`, `title` (from `h1`, falling back to `label`)
  - `metaTitle`, `metaDescription`
  - `bodySections` + rich-text `body` built from the stored intro/sections
  - `faqs`, `canonicalUrl` (`https://udyamadhar.in/<slug>`), `publishedAt`
  - empty-but-valid `aiOverview`, `quickFacts`, `internalLinks`, `howto`, `eeat`, `ctas`
  so the fields exist for you to fill in later in Contentful.
2. **Skip / don't overwrite** anything that already exists as an entry with the same slug —
  including the 2 existing entries and any of the 55 article-format pages — so nothing you
   authored in Contentful is clobbered.
3. **Publish** every created entry, so the catch-all route serves it from Contentful and the
  sitemap picks it up.
4. **Verify** after the run: entry count in Contentful, a spot check of 3 pages rendering
  live from CMS content, and confirmation the sitemap still lists them.

## Notes

- The 5 currently-disabled service pages are included in the sync but stay disabled in the
SEO Pages list; you can toggle them on later.
- The database rows stay as they are — Contentful becomes the place you edit content, and
the existing lookup order (Contentful first, database fallback) means your Contentful
edits win automatically.
- The 55 article-format pages and the earlier "add missing 22 legal pages" idea are dropped  
from this plan, per your instruction.
- And don't add faq in page section (faq trust block)
- &nbsp;