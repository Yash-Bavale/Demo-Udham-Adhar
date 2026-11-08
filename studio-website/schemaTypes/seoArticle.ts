import { defineField, defineType } from "sanity";

const sectionFields = [
  defineField({ name: "heading", type: "string" }),
  defineField({ name: "level", type: "number", initialValue: 2 }),
  defineField({ name: "paragraphs", type: "array", of: [{ type: "text" }] }),
];

export default defineType({
  name: "seoArticle",
  title: "SEO Article",
  type: "document",
  fields: [
    defineField({ name: "slug", type: "string", validation: (r) => r.required() }),
    defineField({ name: "title", type: "string" }),
    defineField({ name: "metaTitle", type: "string" }),
    defineField({ name: "metaDescription", type: "text", rows: 3 }),
    defineField({ name: "body", title: "Body (HTML)", type: "text", rows: 25 }),
    defineField({ name: "canonicalUrl", type: "string" }),
    defineField({ name: "publishedAt", type: "string" }),
    defineField({
      name: "aiOverview",
      type: "object",
      fields: [
        defineField({ name: "short", type: "text", rows: 2 }),
        defineField({ name: "medium", type: "text", rows: 4 }),
        defineField({ name: "long", type: "text", rows: 8 }),
      ],
    }),
    defineField({
      name: "quickFacts",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "label", type: "string" },
            { name: "value", type: "string" },
          ],
        },
      ],
    }),
    defineField({
      name: "bodySections",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            ...sectionFields,
            defineField({
              name: "subsections",
              type: "array",
              of: [{ type: "object", fields: sectionFields }],
            }),
          ],
          preview: { select: { title: "heading" } },
        },
      ],
    }),
    defineField({
      name: "eeat",
      type: "object",
      fields: [
        defineField({ name: "experience", type: "text", rows: 3 }),
        defineField({ name: "expertise", type: "text", rows: 3 }),
        defineField({ name: "trust", type: "text", rows: 3 }),
        defineField({ name: "transparency", type: "text", rows: 3 }),
        defineField({ name: "disclaimer", type: "text", rows: 3 }),
      ],
    }),
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
    defineField({
      name: "internalLinks",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "href", type: "string" },
            { name: "anchor", type: "string" },
            { name: "reason", type: "string" },
          ],
          preview: { select: { title: "anchor", subtitle: "href" } },
        },
      ],
    }),
    defineField({
      name: "howto",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "name", type: "string" },
            { name: "text", type: "text", rows: 3 },
          ],
          preview: { select: { title: "name" } },
        },
      ],
    }),
    defineField({
      name: "ctas",
      type: "object",
      fields: [
        defineField({ name: "hero", type: "string" }),
        defineField({ name: "middle", type: "string" }),
        defineField({ name: "bottom", type: "string" }),
        defineField({ name: "trust", type: "string" }),
        defineField({ name: "benefits", type: "string" }),
        defineField({ name: "why", type: "string" }),
      ],
    }),
    defineField({ name: "cfUpdatedAt", title: "Imported from (updated at)", type: "string", readOnly: true }),
  ],
  preview: { select: { title: "title", subtitle: "slug" } },
});
