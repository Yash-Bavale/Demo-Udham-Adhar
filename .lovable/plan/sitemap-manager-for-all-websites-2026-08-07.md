# Sitemap Manager for all websites

Goal: sitemaps that always reflect what is published (Contentful, database pages, static routes) for each domain, plus a real sitemap manager and checker inside the admin panel.

## What's wrong today

- `sitemap.xml` is served with a 1-hour cache header, so newly published pages can take up to an hour (often longer behind the CDN) to appear.
- Everything is scoped to the domain the request came from. Signed into the admin panel on one domain, you can only see and manage that domain's sitemap — the second website's sitemap can't be inspected or edited at all.
- Contentful pages are auto-included with no way to exclude one, and Contentful entries of any type that happen to have a slug can leak in.
- No way to see what is actually in the live sitemap versus what should be there.

## What gets built

### 1. Always-fresh sitemaps

- Drop the 1-hour cache on `/sitemap.xml`; serve it with a short revalidating cache so a page published in Contentful shows up on the next request.
- Only pull Contentful entries of the SEO/article and service page types (skip FAQs and other models), so junk slugs stop appearing.
- `lastmod` keeps coming from the real source (Contentful `updatedAt`, database `updated_at`), never from "today".

### 2. Sitemap manager in `/admin/seo` (new "Sitemap" tab)

- Website switcher listing every configured website; all data below loads for the selected site regardless of which domain you are signed in on.
- Table of every discoverable page for that site: slug, human label, source (Static route / Database page / Contentful), last modified, and an **Include in sitemap** switch.
- Toggling the switch is stored per website and per slug and is honoured by `sitemap.xml` — this works for Contentful pages too, so a published CMS page can be kept out of the sitemap.
- Search and source filters, plus counts (total, included, excluded).
- Add / edit / delete database SEO pages stays available, now scoped to the selected website.

### 3. Sitemap checker

- "Check live sitemap" fetches the selected website's real `https://<domain>/sitemap.xml` and reports:
  - HTTP status, URL count, and whether the XML parses.
  - **Missing** — pages that should be listed but aren't.
  - **Unexpected** — URLs in the live sitemap that no longer exist or are excluded.
  - Any URL whose host doesn't match the selected website (cross-site leak detector).
- Copy-ready sitemap URL and a link to open the raw XML.
- Google Search Console stays manual: the panel shows the exact sitemap URL to submit/refresh in GSC; no Google credentials are needed.

## Technical notes

- New table `sitemap_overrides` (`website_id`, `slug`, `included`, timestamps, unique on the pair) with admin-only RLS and the standard grants; `sitemap.xml` applies it as the final filter over static, `seo_pages`, and Contentful entries.
- Contentful credential resolution (`resolveCfCreds` in `src/lib/contentful/client.functions.ts`) currently derives the space from the request host. It gains an optional explicit `websiteId` so admin tools can read any site's space; the public path is unchanged.
- Server functions in `src/lib/seo-pages.functions.ts` (`getSitemapPageManagerData`, `submitAllPagesToSitemap`, plus new `setSitemapInclusion` and `checkLiveSitemap`) take an optional `websiteId` instead of always resolving the current host; all remain admin-gated.
- UI added as a tab in `src/routes/admin.seo.tsx`; the existing standalone `/seo-admin` page keeps working.
