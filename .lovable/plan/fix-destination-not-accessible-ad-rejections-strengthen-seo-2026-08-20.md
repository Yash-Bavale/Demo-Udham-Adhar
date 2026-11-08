# Fix "Destination not accessible" ad rejections + strengthen SEO

I crawled both live sites as Google's ads crawler (AdsBot-Google) and found real bugs. This is not a Google glitch.

## What I found (verified live)

**1. Key landing pages return a real 404**

| URL | udyamadhar.in | udyamregistrations.in |
|---|---|---|
| /udyam-registration | 404 | 404 |
| /msme-registration | 404 | 200 |
| /verify-udyam-certificate | 404 | 404 |
| /print-udyam-certificate | 200 | 404 |
| /udyam-registration-online | 200 | 404 |

`/udyam-registration` is the single most likely ad landing page and it is dead on both domains. In the database its page row exists but is switched off (`enabled = false`), and it does not exist in Contentful either, so the catch-all route returns 404. `/verify-udyam-certificate` has no row at all on either site, yet it is still listed in the sitemap for udyamadhar.in — so Google is being pointed at a dead URL.

**2. Why ads work for 2-3 days and then stop**

Almost every marketing page is rendered from the database + Contentful at request time. If either is briefly unavailable (backend paused, an API key rebound, a space swapped — all of which happened on this project in recent weeks), the page does not show an error, it silently returns **404**. Google Ads crawls the final URL repeatedly; the first 404 it catches disapproves the ad with "Destination not working" even after the site recovers.

**3. Cross-domain canonical tags (major SEO leak)**

On udyamregistrations.in, pages such as /about-us, /talk-to-expert, /new-udyam-registration, /update-udyam-certificate declare a canonical pointing at **udyamadhar.in**. That tells Google those pages belong to the other domain, so udyamregistrations.in loses its own ranking for them. ~30 route files hardcode `udyamadhar.in`.

**4. robots.txt is the wrong one**

There are two robots.txt sources: a dynamic route and a static `public/robots.txt`. The static one wins, and its `Sitemap:` line is relative (`/sitemap.xml`), which crawlers ignore — it must be an absolute URL per domain.

## What I'll fix

**A. No more dead ad destinations**
- Turn `/udyam-registration` and `/msme-registration` back on for udyamadhar.in and confirm they render full content on both domains.
- Give `/verify-udyam-certificate` real content on both sites (or, if you prefer, 301 it to the closest live page) so nothing in the sitemap 404s.
- Restore `/print-udyam-certificate` and `/udyam-registration-online` on udyamregistrations.in.

**B. Stop transient outages from producing 404s**
- In the catch-all page route, separate "page genuinely does not exist" from "content source failed". A backend/CMS failure returns **503 with a retry hint**, never 404. Google Ads and Google Search treat 503 as temporary and do not disapprove or de-index.
- Add a short in-memory cache of rendered page data on the server so a brief CMS hiccup serves the last good copy instead of nothing.

**C. Guarantee the sitemap never lists a broken URL**
- The sitemap's hardcoded static route list currently includes pages that do not resolve. Filter entries against pages that actually exist for that website before emitting them.
- Add a "Broken URL check" to the existing Sitemap Manager in the admin panel: one click crawls every sitemap URL for the selected website and shows status codes, so you can catch a dead ad destination before Google does.

**D. SEO hardening across all pages**
- Replace hardcoded `udyamadhar.in` canonicals with the requesting domain, so each site self-canonicalises. Same for `og:url`.
- Delete the static `public/robots.txt` so the dynamic per-domain one serves, with an absolute `Sitemap:` line.
- Audit every content route for a unique title, meta description, og tags and a single H1; fill gaps found during the pass.

## Technical notes

- Files touched: `src/routes/$.tsx` (404 vs 503 split, caching), `src/routes/sitemap[.]xml.ts` (existence filter), `src/lib/sitemap/sitemap.server.ts` + `src/lib/sitemap/sitemap-admin.functions.ts` (URL checker), `src/routes/admin.seo.tsx` (checker UI), ~30 static route files (canonical/og host), removal of `public/robots.txt`.
- Page enable/disable and any missing rows are data changes in `seo_pages`, applied per website id.
- No changes to orders, payments or admin workflow logic.

## After this ships

Re-submit the disapproved ads for review. If a specific ad final URL is not in the table above, tell me the exact URL and I'll verify it too.

## Pre-step: fix the current build error

`src/lib/crm/orders-v2.functions.ts` fails to typecheck — the lead lookup map is inferred as an empty type, so `lead.service_id` / `lead.service` / `lead.id` error. One-line fix: type the map explicitly (`new Map<string, any>(...)`). This must go in before anything else, since the site can't build otherwise.
