import { defineField, defineType } from "sanity";

export default defineType({
  name: "landingPage",
  title: "Landing Page",
  type: "document",
  fields: [
    defineField({ name: "slug", type: "string", validation: (r) => r.required() }),
    defineField({ name: "title", type: "string" }),
    defineField({ name: "metaTitle", type: "string" }),
    defineField({ name: "metaDescription", type: "text", rows: 3 }),
    defineField({
      name: "hero",
      type: "object",
      fields: [
        defineField({ name: "heading", type: "string" }),
        defineField({ name: "subheading", type: "text", rows: 3 }),
        defineField({ name: "ctaLabel", type: "string" }),
        defineField({ name: "ctaUrl", type: "string" }),
      ],
    }),
    defineField({ name: "howItWorks", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "whyUs", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "faqs",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "question", type: "string" },
            { name: "answer", type: "text", rows: 4 },
          ],
          preview: { select: { title: "question" } },
        },
      ],
    }),
    defineField({ name: "longDescription", title: "Long description (HTML)", type: "text", rows: 20 }),
    defineField({ name: "cfUpdatedAt", title: "Imported from (updated at)", type: "string", readOnly: true }),
  ],
  preview: { select: { title: "title", subtitle: "slug" } },
});
