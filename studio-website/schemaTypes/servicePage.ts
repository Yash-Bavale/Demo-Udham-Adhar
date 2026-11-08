import { defineField, defineType } from "sanity";

export default defineType({
  name: "servicePage",
  title: "Service Page",
  type: "document",
  fields: [
    defineField({ name: "slug", type: "string", validation: (r) => r.required() }),
    defineField({ name: "serviceCode", type: "string" }),
    defineField({ name: "name", type: "string" }),
    defineField({ name: "shortDescription", type: "text", rows: 3 }),
    defineField({ name: "longDescription", title: "Long description (HTML)", type: "text", rows: 20 }),
    defineField({ name: "priceInclusive", type: "number" }),
    defineField({ name: "processingDays", type: "number" }),
    defineField({ name: "benefits", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "documentsRequired", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "metaTitle", type: "string" }),
    defineField({ name: "metaDescription", type: "text", rows: 3 }),
    defineField({ name: "cfUpdatedAt", title: "Imported from (updated at)", type: "string", readOnly: true }),
  ],
  preview: { select: { title: "name", subtitle: "slug" } },
});
