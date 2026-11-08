import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

export const listServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        includeInactive: z.boolean().optional(),
        websiteId: z.string().uuid().optional(),
      })
      .optional()
      .parse(raw)
  )
  .handler(async ({ data: input, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("services")
      .select("*, website:websites(id, name, domain, is_active)")
      .order("sort_order", { ascending: true });

    if (!input?.includeInactive) {
      q = q.eq("is_active", true);
    }
    if (input?.websiteId) {
      q = q.eq("website_id", input.websiteId);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

// Public: active services (code + display name) for the current website's lead form.
export const listActiveServiceCodes = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  const { resolveWebsiteIdFromRequest } = await import("@/lib/websites/default-website.server");
  let websiteId: string | null = null;
  try {
    websiteId = await resolveWebsiteIdFromRequest(getRequest());
  } catch {
    websiteId = null;
  }
  let q = supabaseAdmin
    .from("services")
    .select("service_code, service_name, sort_order")
    .eq("is_active", true);
  if (websiteId) q = q.eq("website_id", websiteId);
  const { data, error } = await q.order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return {
    codes: rows.map((r) => r.service_code as string),
    services: rows.map((r) => ({ code: r.service_code as string, name: r.service_name as string })),
  };
});

const ServiceInput = z.object({
  id: z.string().uuid().optional(),
  service_code: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/, "letters, numbers, hyphen or underscore only"),
  service_name: z.string().trim().min(2).max(160),
  description: z.string().max(2000).nullable().optional(),
  base_amount: z.number().min(0).max(1_000_000),
  gst_amount: z.number().min(0).max(1_000_000),
  total_amount: z.number().min(0).max(1_000_000),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10_000).default(0),
  govt_portal_url: z.string().trim().max(1000).nullable().optional(),
  website_id: z.string().uuid().optional(),
  category_id: z.string().uuid().nullable().optional(),
  expected_processing_days: z.number().int().min(0).max(3650).nullable().optional(),
  journey_key: z.string().trim().max(80).nullable().optional(),
});


export const upsertService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ServiceInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    if (data.id) {
      const { id, ...patch } = data;
      const { error } = await supabase.from("services").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      let website_id = data.website_id;
      if (!website_id) {
        const { getDefaultWebsiteId } = await import("@/lib/websites/default-website.server");
        website_id = await getDefaultWebsiteId();
      }
      const { error } = await supabase.from("services").insert({ ...data, website_id });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });


export const deleteService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { error } = await supabase.from("services").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
