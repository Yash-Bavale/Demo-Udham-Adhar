# Sanity migration — adapted to this project

Your Sanity project is **Website (519jq1ws)**, dataset **production**. Two things in the pasted instructions don't apply here, so here's the corrected shape of the work.

## Two corrections

1. **No sibling Studio folder.** This project is a single Lovable repo (TanStack Start, not Next.js) — there is no parent folder to run `bun create sanity` in, and Lovable can't host a second app. Two options:
   - **Recommended:** skip a self-hosted Studio and edit content at `sanity.io/manage` → Studio (Sanity's hosted Studio for your project), which works with the schema I define via the API.
   - Or you run the `bun create sanity` command locally on your own machine and keep the Studio in a separate repo; the schema I create will match it exactly.
   Either way, the app itself only ever *reads* from Sanity, so the Studio location doesn't affect the site.

2. **Contentful is now hard-blocked, not just rate-limited.** The live error is `402 SpaceUsageLimitsExceeded — the space has been blocked as it has exceeded the usage limits`. That means I **cannot read your content out of Contentful** any more, by API or gateway. The CSVs you uploaded are entry *listings* (names/dates only) — they contain no page content.

   So the migration source has to be one of:
   - **Your Contentful export JSON** (`contentful-export-*.json` / NDJSON / the ZIP from Contentful's export tool) — best, gives a byte-for-byte port. Upload it and I do the rest.
   - **The database + bundled HTML fallbacks already in this repo** (`seo_pages` rows and `src/content/wp/*.html`) — this recovers most SEO pages but not the structured extras (aiOverview, quickFacts, eeat, ctas, howto).
   - **Unblocking Contentful briefly** (pay/downgrade so the space unblocks for an hour) — then I pull everything live and you can cancel afterwards.

## Work plan

1. **Schema in Sanity** — document types `faq`, `servicePage`, `seoArticle`, `landingPage`, `emailTemplate` with the exact field names the app already uses (`slug`, `metaTitle`, `metaDescription`, `bodySections`, `quickFacts`, `eeat`, `faqs`, `internalLinks`, `howto`, `ctas`, …). Nothing about page structure or SEO output changes.
2. **Datasets** — `production` for udyamadhar.in, plus a second dataset `udyamregistrations` for the other site, mirroring today's two Contentful spaces. (If your Sanity plan only allows one dataset, I'll instead add a `site` field on each document and filter by host — same result.)
3. **Import** — convert the chosen source into Sanity documents and push them in, then verify counts against your CSVs (115 FAQs, 13 service pages, ~131 SEO articles, 1 landing page, 16 email templates).
4. **New read layer** — `src/lib/sanity/client.functions.ts` with the same function names and return types as the Contentful module, so page components stay untouched. Repoint the homepage, catch-all `$.tsx`, service routes, footer, services grid, sitemap builder and admin SEO tools.
5. **Website config** — `sanity_project_id` / `sanity_dataset` columns on `websites` so host → dataset is data-driven and editable in Admin → Websites; Contentful columns stay as a rollback path.
6. **Reliability** — reads via Sanity's CDN, existing 5-minute cache kept, and a safe fallback chain (CMS error → last cached value → database SEO page → bundled HTML) so a CMS outage can never blank a page again.
7. **Verify** — check live pages on both domains, `/sitemap.xml` slug parity, then publish.

## Technical notes

- `@sanity/client` (bun), server-side only inside `createServerFn` handlers; project ID and dataset resolved per request host.
- A **write token** (Editor role) is needed for the one-time import — I'll request it through the secure secret prompt, never in chat. A read token is only needed if the dataset is private.
- Contentful rich text is converted with the converters already in this repo, so articles land in Sanity in the exact shape the pages render today — no Portable Text serializer, no visual difference.
- One small database migration: two nullable columns on `websites`.

## What I need to start

Pick a content source (export upload, repo fallbacks, or temporarily unblocking Contentful) and give me the Sanity write token. I can start the schema and code layer immediately either way.
