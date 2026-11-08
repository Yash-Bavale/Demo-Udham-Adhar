// Server-only: load a service form schema from DB, fall back to the TS registry.
// Keeps the existing OnboardingSchema shape so renderer + validator don't change.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getSchema as getTsSchema,
  type OnboardingSchema,
  type FieldDef,
  type DocDef,
  withSectionHeadings,
} from "@/lib/onboarding/schemas";

type DbSchemaRow = {
  title: string;
  description: string | null;
  schema: {
    fields?: FieldDef[];
    sections?: Array<{ key: string; label: string; fields: FieldDef[] }>;
    meta?: { sample_form_url?: string | null; sample_form_label?: string | null };
  } | null;
  documents: DocDef[] | null;
};

function normalize(row: DbSchemaRow, fallback: OnboardingSchema): OnboardingSchema {
  // Preserve saved builder section boundaries when flattening for the customer renderer.
  let fields: FieldDef[] = [];
  if (row.schema?.sections?.length) {
    fields = withSectionHeadings(row.schema.sections);
  } else if (row.schema?.fields?.length) {
    fields = row.schema.fields;
  } else {
    fields = fallback.fields;
  }
  const fallbackByKey = new Map(fallback.fields.map((f) => [f.key, f]));
  // The saved form-builder layout is authoritative: NIC codes appear only when
  // the admin added NIC fields to the form. Never inject them automatically.
  const normalizedFields = fields.map((field) => {
    const fallbackField = fallbackByKey.get(field.key);
    if (fallbackField?.type !== "nic") return field;

    return {
      ...field,
      ...fallbackField,
      label: field.label || fallbackField.label,
      required: field.required ?? fallbackField.required,
    };
  });

  const sampleUrl = row.schema?.meta?.sample_form_url ?? fallback.sample_form_url;
  const sampleLabel =
    row.schema?.meta?.sample_form_label ?? fallback.sample_form_label ?? "Download Standard Form";

  // Keep the red instruction block (and its download button) working when the
  // schema comes from the DB: carry over the registry lines and attach the
  // sample-form URL configured in the form builder.
  const baseInstructions = fallback.documentsInstructions;
  const documentsInstructions =
    baseInstructions || sampleUrl
      ? {
          lines: baseInstructions?.lines ?? [],
          downloadUrl: sampleUrl ?? baseInstructions?.downloadUrl,
          downloadLabel: sampleLabel ?? baseInstructions?.downloadLabel,
        }
      : undefined;

  return {
    title: row.title || fallback.title,
    description: row.description ?? fallback.description,
    fields: normalizedFields,
    documents: row.documents ?? fallback.documents,
    documentsInstructions,
    sample_form_url: sampleUrl,
    sample_form_label: sampleLabel,
  };
}

export async function loadServiceSchema(serviceCode: string): Promise<OnboardingSchema> {
  const fallback = getTsSchema(serviceCode);
  try {
    const { data } = await supabaseAdmin
      .from("service_form_schemas")
      .select("title, description, schema, documents")
      .eq("service_code", serviceCode)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return fallback;
    return normalize(data as DbSchemaRow, fallback);
  } catch (e) {
    console.error("loadServiceSchema fallback:", e);
    return fallback;
  }
}
