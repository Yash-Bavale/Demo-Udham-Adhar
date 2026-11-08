import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

/** List websites with their categories and services (tree view). */
export const listWebsiteTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [ws, cats, svcs] = await Promise.all([
      supabase.from("websites").select("*").order("sort_order", { ascending: true }),
      supabase.from("service_categories").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("services")
        .select("id, service_code, service_name, is_active, sort_order, website_id, category_id, total_amount")
        .order("sort_order", { ascending: true }),
    ]);
    if (ws.error) throw new Error(ws.error.message);
    if (cats.error) throw new Error(cats.error.message);
    if (svcs.error) throw new Error(svcs.error.message);
    return {
      websites: ws.data ?? [],
      categories: cats.data ?? [],
      services: svcs.data ?? [],
    };
  });

const WebsiteInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  domain: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9.-]+$/i, "Domain must contain only letters, digits, dots and hyphens"),
  description: z.string().trim().max(2000).nullable().optional(),
  is_active: z.boolean().default(true),
  allow_admin: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10_000).default(0),
  contentful_space_id: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9]*$/i, "Space ID must be letters and digits only")
    .nullable()
    .optional(),
  contentful_delivery_token_secret: z
    .enum(["CONTENTFUL_API_KEY", "CONTENTFUL_API_KEY_1", "CONTENTFUL_API_KEY_2"])
    .nullable()
    .optional(),
  sanity_project_id: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9]*$/i, "Project ID must be letters and digits only")
    .nullable()
    .optional(),
  sanity_dataset: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9_-]*$/i, "Dataset must be letters, digits, hyphens or underscores")
    .nullable()
    .optional(),
});



export const upsertWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WebsiteInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const payload = { ...data, domain: data.domain.toLowerCase().replace(/^www\./, "") };

    // Friendly guard: the domain column is unique across websites.
    const dupQuery = supabase.from("websites").select("id, name").eq("domain", payload.domain);
    const { data: dup, error: dupErr } = await (payload.id
      ? dupQuery.neq("id", payload.id)
      : dupQuery
    ).maybeSingle();
    if (dupErr) throw new Error(dupErr.message);
    if (dup) {
      throw new Error(
        `The domain "${payload.domain}" is already used by the website "${dup.name}". Use a different domain or edit that website instead.`,
      );
    }

    if (payload.id) {
      const { id, ...patch } = payload;
      const { error } = await supabase.from("websites").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("websites").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin"]);
    // Guard: refuse deleting a website that still has services attached.
    const { count, error: cErr } = await supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("website_id", data.id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete: ${count} service(s) still linked. Move or delete them first.`);
    }
    const { error } = await supabase.from("websites").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CategoryInput = z.object({
  id: z.string().uuid().optional(),
  website_id: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10_000).default(0),
});

export const upsertServiceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CategoryInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    if (data.id) {
      const { id, ...patch } = data;
      const { error } = await supabase.from("service_categories").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("service_categories").insert(data);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteServiceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    // Unlink services first (set category_id NULL), then delete category.
    const { error: uErr } = await supabase
      .from("services")
      .update({ category_id: null })
      .eq("category_id", data.id);
    if (uErr) throw new Error(uErr.message);
    const { error } = await supabase.from("service_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Move a service to a different website (and optionally category). */
export const moveService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        service_id: z.string().uuid(),
        website_id: z.string().uuid(),
        category_id: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { error } = await supabase
      .from("services")
      .update({ website_id: data.website_id, category_id: data.category_id ?? null })
      .eq("id", data.service_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
