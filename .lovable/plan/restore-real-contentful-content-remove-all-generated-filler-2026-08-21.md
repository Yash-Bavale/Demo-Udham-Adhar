# Restore real Contentful content (remove all generated filler)

You're right — the repair scripts I ran earlier invented sections, FAQs, CTAs and "EEAT" blocks. That was wrong. This plan wipes all synthesized text and re-imports the pages exactly as they exist in Contentful.

Good news: I already have the full Contentful exports on hand (both spaces), so you don't have to export anything unless you want a fresher copy:

- udyamadhar.in space: 130 SEO articles, 13 service pages, 115 FAQs, 2 hero sections, 1 landing page
- udyamregistrations.in space: 18 SEO articles, 13 service pages, 100 FAQs, 1 landing page

Each article carries the original rich-text `body`, `metaTitle`, `metaDescription`, `slug`, plus its linked FAQ entries.

## What I'll do

1. Re-import every article and service page into Sanity from the Contentful export, overwriting the repaired documents.
  - `body` rich text converted 1:1 (headings, paragraphs, lists, bold/links, embedded entries/assets) — no paraphrasing, no re-splitting into invented "sections".
  - FAQs come only from the linked Contentful `faq` entries. If a page had none, it shows none.
  - Titles and meta fields taken verbatim from Contentful.
2. Delete the generated fields on every migrated document: fabricated `sections`, `faqs`, `quickFacts`, `cta`, `eeat` content that was not in Contentful.
3. Rendering: the page renders the Contentful body as the article), and keeps the enquiry form / trust block, which are app UI, not content.
4. Verify a sample of pages on both domains against the Contentful source (heading order, paragraph count, FAQ count) and report any page where content still doesn't match.

## Technical notes

- Source: `/tmp/cfexport/uhj8bglazbnm.json` (udyamadhar.in) and `/tmp/cfexport/xn7rc3iqh7xq.json` (udyamregistrations.in). If you upload a newer export, I'll use that instead.
- Import script writes to Sanity project `519jq1ws`, datasets `production` and `udyamregistrations`, using the write token; documents are replaced by `_id` derived from the Contentful entry id, so no duplicates.
- Rich text → Portable Text conversion handled by a mapper over the Contentful `nodeType` tree; unknown node types are logged, not silently dropped.
- No changes to orders, payments, CRM, or admin code.