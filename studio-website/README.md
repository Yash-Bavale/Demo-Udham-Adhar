# Studio (standalone)

Content editing UI for the two websites. It is **not** part of the web app build — the app only reads from Sanity.

- Project: `519jq1ws`
- Datasets: `production` (udyamadhar.in) and `udyamregistrations` (udyamregistrations.in)

## Run it locally

```bash
cd studio-website
npm install
npx sanity login
npm run dev          # http://localhost:3333
```

Open `/udyamadhar` or `/udyamregistrations` to edit the matching site.

## Host it on sanity.io (optional)

```bash
npm run deploy
```

## Schema

Document types live in `schemaTypes/` and match exactly the field names the website reads:
`faq`, `servicePage`, `seoArticle`, `landingPage`, `emailTemplate`.

Publishing an entry here makes it live on the site within ~5 minutes (server cache) and it is picked up by `/sitemap.xml`.
