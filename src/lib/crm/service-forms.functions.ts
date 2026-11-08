import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

// ───────────────────────── Schemas ─────────────────────────

const FieldSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/),
  label: z.string().trim().min(1).max(200),
  type: z.enum([
    "text",
    "textarea",
    "number",
    "email",
    "tel",
    "date",
    "select",
    "radio",
    "checkbox",
    "file",
  ]),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional().nullable(),
  help: z.string().max(500).optional().nullable(),
  options: z
    .array(z.object({ value: z.string().max(120), label: z.string().max(200) }))
    .max(50)
    .optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().max(200).optional(),
    })
    .optional(),
  group: z.string().max(80).optional().nullable(),
});

const DocumentSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/),
  label: z.string().trim().min(1).max(200),
  required: z.boolean().default(false),
  accept: z.string().max(120).default("image/*,application/pdf"),
  max_size_mb: z.number().min(1).max(25).default(5),
  help: z.string().max(500).optional().nullable(),
});

const FormSchemaInput = z.object({
  id: z.string().uuid().optional(),
  service_code: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().default(true),
  schema: z.object({
    fields: z.array(FieldSchema).max(120),
  }),
  documents: z.array(DocumentSchema).max(40),
});

const StatusStep = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  is_terminal: z.boolean().default(false),
  sla_hours: z.number().int().min(0).max(10_000).optional().nullable(),
});

const WorkflowInput = z.object({
  id: z.string().uuid().optional(),
  service_code: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  display_name: z.string().trim().min(2).max(160),
  default_assignee_role: z.string().max(40).nullable().optional(),
  is_active: z.boolean().default(true),
  application_statuses: z.array(StatusStep).min(1).max(40),
});

// ───────────────────────── Form Schemas ─────────────────────────

export const getServiceConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ service_code: z.string().min(1).max(80) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [service, formSchema, workflow] = await Promise.all([
      supabase.from("services").select("*").eq("service_code", data.service_code).maybeSingle(),
      supabase
        .from("service_form_schemas")
        .select("*")
        .eq("service_code", data.service_code)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("service_workflows")
        .select("*")
        .eq("service_code", data.service_code)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    return {
      service: service.data ?? null,
      formSchema: formSchema.data ?? null,
      workflow: workflow.data ?? null,
    };
  });

export const saveFormSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FormSchemaInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);

    // Find latest version for this service
    const { data: existing } = await supabase
      .from("service_form_schemas")
      .select("version")
      .eq("service_code", data.service_code)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (existing?.version ?? 0) + 1;

    // Deactivate prior active versions
    await supabase
      .from("service_form_schemas")
      .update({ is_active: false })
      .eq("service_code", data.service_code);

    const { error } = await supabase.from("service_form_schemas").insert({
      service_code: data.service_code,
      title: data.title,
      description: data.description ?? null,
      is_active: data.is_active,
      schema: data.schema,
      documents: data.documents,
      version: nextVersion,
    });
    if (error) throw new Error(error.message);
    return { ok: true, version: nextVersion };
  });

export const listFormSchemaVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ service_code: z.string().min(1).max(80) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { data: rows, error } = await context.supabase
      .from("service_form_schemas")
      .select("id, version, title, is_active, created_at, updated_at")
      .eq("service_code", data.service_code)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ───────────────────────── Workflows ─────────────────────────

export const saveWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WorkflowInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);

    const { data: existing } = await supabase
      .from("service_workflows")
      .select("id")
      .eq("service_code", data.service_code)
      .maybeSingle();

    const payload = {
      service_code: data.service_code,
      display_name: data.display_name,
      default_assignee_role: data.default_assignee_role ?? null,
      is_active: data.is_active,
      application_statuses: data.application_statuses,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("service_workflows")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("service_workflows").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
