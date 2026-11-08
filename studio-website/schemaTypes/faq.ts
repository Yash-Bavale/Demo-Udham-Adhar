import { defineField, defineType } from "sanity";

export default defineType({
  name: "faq",
  title: "FAQ",
  type: "document",
  fields: [
    defineField({ name: "question", type: "string", validation: (r) => r.required() }),
    defineField({ name: "answer", type: "text", rows: 6, validation: (r) => r.required() }),
    defineField({ name: "category", type: "string" }),
    defineField({ name: "cfUpdatedAt", title: "Imported from (updated at)", type: "string", readOnly: true }),
  ],
  preview: { select: { title: "question", subtitle: "category" } },
});
