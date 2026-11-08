import { defineField, defineType } from "sanity";

export default defineType({
  name: "emailTemplate",
  title: "Email Template",
  type: "document",
  fields: [
    defineField({ name: "code", type: "string", validation: (r) => r.required() }),
    defineField({ name: "name", type: "string" }),
    defineField({ name: "subject", type: "string" }),
    defineField({ name: "bodyHtml", title: "Body (HTML)", type: "text", rows: 25 }),
    defineField({ name: "variables", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "description", type: "text", rows: 3 }),
    defineField({ name: "cfUpdatedAt", title: "Imported from (updated at)", type: "string", readOnly: true }),
  ],
  preview: { select: { title: "code", subtitle: "name" } },
});
