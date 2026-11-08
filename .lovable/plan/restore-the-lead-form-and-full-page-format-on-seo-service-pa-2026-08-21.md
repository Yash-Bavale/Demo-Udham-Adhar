# Restore the lead form and full page format on SEO/service pages

## What's wrong

Two separate problems stack up on pages like `/msme-certificate-download`:

1. **The site can't read the new CMS.** All 287 documents are in Sanity and published, but unauthenticated reads from the project return nothing, and the app has no read token configured. Every CMS lookup silently returns empty, so the page falls all the way through to the old bundled WordPress HTML copy. That fallback layout has no lead form and prints the title twice (once as heading, once as a link) — exactly what the screenshots show.

2. **The migrated pages are thin.** Confirmed on the live data: of 130 migrated articles, 0 have FAQs and 0 have more than one body section. Titles were auto-capitalised ("Msme Certificate Download"), the body HTML repeats the H1, and CTAs / quick facts / E-E-A-T blocks are empty. So even once reading works, pages would render a stripped-down version of the old format.

## Fix

### 1. Make CMS reads work (root cause)

- Read Sanity server-side with the token that already exists in the project's secrets, so reads no longer depend on public dataset access.
- Keep the 5-minute cache and last-good-value fallback as-is.
- Verify with a live request that `/msme-certificate-download` and a few other slugs render from the CMS (lead form present, single H1) on both domains.

### 2. Never serve a formless fallback page

- Add the lead form, sample-certificate block, and trust/CTA sections to the bundled-HTML fallback layout, so even during a CMS outage a page keeps the standard format and a working enquiry form.
- Strip a leading duplicate `<h1>`/title link from bundled HTML before rendering.

### 3. Repair the migrated content

Run a one-off content repair against both datasets (no page-code changes needed):

- Use the CMS meta title as the display title instead of the auto-capitalised slug ("MSME Certificate Download — Get Your MSME Certificate Online").
- Remove the duplicated H1/H2 from the top of each body.
- Split the single long paragraph into proper sections with headings so the page renders the multi-section format again.
- Attach the standard FAQ set and CTA/quick-fact defaults used by the previous format when an entry has none, so every page shows FAQs, CTAs and schema markup.

### 4. Verify

- Spot-check ~10 slugs per domain: lead form present, one H1, sections + FAQs rendering, canonical/meta correct, `/sitemap.xml` counts unchanged.

## Technical notes

- Read path: `src/lib/sanity/sanity.server.ts` (token + client), `src/lib/sanity/client.functions.ts` (queries).
- Fallback rendering: `WpPage` in `src/components/site/PageHero.tsx`, used by the catch-all route `src/routes/$.tsx`.
- Full format renderer: `src/components/site/SeoContentPage.tsx` (already includes `LeadForm`, sample certificate, CTA boxes, FAQ + JSON-LD).
- Content repair is a script against the Sanity write API; no schema changes, no changes to service/order/payment code.
