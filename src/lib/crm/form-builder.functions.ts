// Admin form builder — server functions for editing service_form_schemas
// via the OnboardingForm-compatible JSON shape (supports section/nic/plants/etc).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

const FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "number",
  "date",
  "select",
  "textarea",
  "nic",
  "plants",
  "section",
  "state",
  "district",
  "note",
  "checkbox",
] as const;

const FieldSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/, "key must be alphanumeric/underscore"),
  label: z.string().trim().min(1).max(300),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
  help: z.string().max(500).optional(),
  pattern: z.string().max(300).optional(),
  maxLength: z.number().int().positive().max(10000).optional(),
  options: z.array(z.string().max(200)).max(200).optional(),
  nicDigits: z.union([z.literal(2), z.literal(4), z.literal(5)]).optional(),
  activityFrom: z.string().max(80).optional(),
  default: z.string().max(500).optional(),
  visibleIf: z.object({ key: z.string().max(80), equals: z.string().max(200) }).optional(),
});

const SectionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  fields: z.array(FieldSchema).max(200),
});

const DocSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/),
  label: z.string().trim().min(1).max(200),
  required: z.boolean().optional(),
  help: z.string().max(500).optional(),
  sample_url: z
    .string()
    .trim()
    .max(2000)
    .refine((s) => s === "" || s.startsWith("/") || /^https?:\/\//i.test(s), "Invalid URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sample_label: z.string().max(200).optional(),
});

const SaveInput = z.object({
  service_code: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  sections: z.array(SectionSchema).min(1).max(30),
  documents: z.array(DocSchema).max(40).default([]),
  sample_form_url: z
    .string()
    .trim()
    .max(2000)
    .refine((s) => s === "" || s.startsWith("/") || /^https?:\/\//i.test(s), "Invalid URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sample_form_label: z.string().max(200).optional(),
  enable_document_merge: z.boolean().optional(),
});

export type BuilderSaveInput = z.infer<typeof SaveInput>;

export const getBuilderSchema = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ service_code: z.string().min(1).max(80) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const [{ data: svc }, { data: schema }, { data: versions }] = await Promise.all([
      context.supabase
        .from("services")
        .select("service_code, service_name")
        .eq("service_code", data.service_code)
        .maybeSingle(),
      context.supabase
        .from("service_form_schemas")
        .select("id, version, title, description, schema, documents, is_active, updated_at")
        .eq("service_code", data.service_code)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("service_form_schemas")
        .select("id, version, is_active, updated_at, title")
        .eq("service_code", data.service_code)
        .order("version", { ascending: false })
        .limit(30),
    ]);

    return {
      service: svc ?? null,
      active: schema ?? null,
      versions: versions ?? [],
    };
  });

export const getBuilderSchemaVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const { data: row, error } = await context.supabase
      .from("service_form_schemas")
      .select("id, service_code, version, title, description, schema, documents, is_active, updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row };
  });

export const saveBuilderSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);

    // Duplicate key check across all sections
    const seen = new Set<string>();
    for (const sec of data.sections) {
      for (const f of sec.fields) {
        if (seen.has(f.key)) throw new Error(`Duplicate field key: ${f.key}`);
        seen.add(f.key);
      }
    }
    // Validate regex patterns
    for (const sec of data.sections) {
      for (const f of sec.fields) {
        if (f.pattern) {
          try { new RegExp(f.pattern); } catch {
            throw new Error(`Invalid regex in field "${f.key}": ${f.pattern}`);
          }
        }
      }
    }

    const schemaJson = {
      sections: data.sections,
      meta: {
        sample_form_url: data.sample_form_url ?? null,
        sample_form_label: data.sample_form_label ?? null,
        enable_document_merge: data.enable_document_merge ?? false,
      },
    };

    const { data: result, error } = await context.supabase.rpc("upsert_service_form_schema", {
      _service_code: data.service_code,
      _title: data.title,
      _description: data.description ?? "",
      _schema: schemaJson,
      _documents: data.documents,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; version: number };
  });

// List other services (with an active schema) the admin can copy sections from.
export const listCopyableForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ exclude_service_code: z.string().min(1).max(80) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const { data: rows, error } = await context.supabase
      .from("service_form_schemas")
      .select("service_code, title, schema, documents")
      .eq("is_active", true)
      .neq("service_code", data.exclude_service_code)
      .order("service_code", { ascending: true });
    if (error) throw new Error(error.message);

    type JsonScalar = string | number | boolean | null;
    type JsonValue = JsonScalar | JsonValue[] | { [k: string]: JsonValue };
    type Sec = { key: string; label: string; description?: string; fields: JsonValue[] };
    return {
      rows: (rows ?? []).map((r) => {
        const schema = (r.schema ?? {}) as { sections?: Sec[]; fields?: JsonValue[] };
        const sections: Sec[] = schema.sections?.length
          ? schema.sections
          : schema.fields?.length
            ? [{ key: "default", label: "Details", fields: schema.fields }]
            : [];
        return {
          service_code: r.service_code as string,
          title: (r.title as string) || (r.service_code as string),
          sections: sections.map((s) => ({
            key: s.key,
            label: s.label,
            description: s.description ?? "",
            fieldCount: Array.isArray(s.fields) ? s.fields.length : 0,
          })),
          documents: (Array.isArray(r.documents) ? (r.documents as JsonValue[]) : []),
          rawSections: sections,
        };
      }),
    };
  });
