# Connect Contentful for udyamregistrations.in

Goal: make the second site's CMS pages (SEO articles, FAQs, sitemap entries) load from its own Contentful space.

## Current state (verified)

- Only one Contentful connection exists in this workspace ("Udyam Aadhar Contnetul"), linked to the project. It supplies `CONTENTFUL_API_KEY` / `CONTENTFUL_SPACE_ID`, used by udyamadhar.in.
- The `udyamregistrations.in` website row is configured with `contentful_delivery_token_secret = CONTENTFUL_API_KEY_1` and an empty `contentful_space_id`, so every CMS lookup for that site currently finds no credentials and returns nothing.
- Code already supports per-site credentials via `CONTENTFUL_API_KEY`, `_1`, or `_2` and a matching space id.

## Steps

1. Open a Contentful connect card so a second connection is created with the credentials of the udyamregistrations.in space (its Content Delivery API token). You complete the form; the workspace then injects a new secret.
2. Read back the exact secret name the link produced (a second connection is typically named `CONTENTFUL_API_KEY_2`, not `_1`).
3. Point the `udyamregistrations.in` website row at that exact secret name, and set its `contentful_space_id` explicitly to that space's ID so resolution never depends on suffix guessing.
4. Verify with a live gateway call plus a fetch of an SEO/article page and `/sitemap.xml` for udyamregistrations.in, confirming entries are returned.

## Technical notes

- No app-code changes expected; the resolver in `src/lib/contentful/client.functions.ts` and `src/lib/sitemap/sitemap.server.ts` already picks the secret named on the website row.
- Only the `websites` row for udyamregistrations.in changes (secret name + space id). udyamadhar.in is untouched.
- If the new connection lands on a name outside the allowed set (`CONTENTFUL_API_KEY`, `_1`, `_2`), the small enum in `websites-admin.functions.ts` and the dropdown in `admin.websites.tsx` get that name added — no other logic changes.

## What I need from you

The Content Delivery API token and space ID for the udyamregistrations.in Contentful space, entered in the connect card when it appears.
