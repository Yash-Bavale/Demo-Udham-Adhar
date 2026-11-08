import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Filter shape stored as JSON. Kept loose on purpose so we can extend later.
export const FilterJsonSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(40).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
}).partial();

export type FilterJson = z.infer<typeof FilterJsonSchema>;

export const listSavedFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("saved_lead_filters")
      .select("id, name, filter_json, is_default, created_at, updated_at")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const CreateInput = z.object({
  name: z.string().trim().min(1).max(80),
  filter_json: FilterJsonSchema,
  is_default: z.boolean().optional(),
});

export const createSavedFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.is_default) {
      await supabase.from("saved_lead_filters").update({ is_default: false }).eq("user_id", userId);
    }
    const { data: row, error } = await supabase
      .from("saved_lead_filters")
      .insert({
        user_id: userId,
        name: data.name,
        filter_json: data.filter_json as never,
        is_default: data.is_default ?? false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  filter_json: FilterJsonSchema.optional(),
  is_default: z.boolean().optional(),
});

export const updateSavedFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.is_default) {
      await supabase.from("saved_lead_filters").update({ is_default: false }).eq("user_id", userId);
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.filter_json !== undefined) patch.filter_json = data.filter_json;
    if (data.is_default !== undefined) patch.is_default = data.is_default;
    const { error } = await supabase
      .from("saved_lead_filters")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSavedFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("saved_lead_filters").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
