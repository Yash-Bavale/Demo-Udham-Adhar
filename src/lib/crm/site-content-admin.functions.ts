import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

const WebsiteId = z.object({ websiteId: z.string().uuid() });

/** Load nav items + content blocks + editable brand fields for one website. */
export const getWebsiteContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WebsiteId.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const [site, nav, blocks] = await Promise.all([
      supabase
        .from("websites")
        .select(
          "id, name, domain, support_email, support_phone, whatsapp_number, business_hours, postal_address, footer_unlock_code, legal_footer_line",
        )
        .eq("id", data.websiteId)
        .maybeSingle(),
      supabase
        .from("site_nav_items")
        .select("*")
        .eq("website_id", data.websiteId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("site_content_blocks")
        .select("*")
        .eq("website_id", data.websiteId)
        .order("block_key", { ascending: true }),
    ]);
    if (site.error) throw new Error(site.error.message);
    if (nav.error) throw new Error(nav.error.message);
    if (blocks.error) throw new Error(blocks.error.message);
    if (!site.data) throw new Error("Website not found");
    return { website: site.data, nav: nav.data ?? [], blocks: blocks.data ?? [] };
  });

const NavInput = z.object({
  id: z.string().uuid().optional(),
  website_id: z.string().uuid(),
  nav_group: z.enum(["header", "footer"]),
  label: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(300),
  open_in_new: z.boolean().default(false),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10_000).default(0),
});

export const upsertNavItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => NavInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    if (data.id) {
      const { id, ...patch } = data;
      const { error } = await supabase.from("site_nav_items").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("site_nav_items").insert(data);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteNavItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { error } = await supabase.from("site_nav_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BlockInput = z.object({
  website_id: z.string().uuid(),
  block_key: z.string().trim().min(2).max(120),
  content: z.unknown(),
  is_active: z.boolean().default(true),
});

export const upsertContentBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BlockInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { error } = await supabase
      .from("site_content_blocks")
      .upsert(
        {
          website_id: data.website_id,
          block_key: data.block_key,
          content: data.content as never,
          is_active: data.is_active,
        },
        { onConflict: "website_id,block_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ContactInput = z.object({
  websiteId: z.string().uuid(),
  support_email: z.string().trim().email().max(200).nullable(),
  support_phone: z.string().trim().max(60).nullable(),
  whatsapp_number: z.string().trim().max(60).nullable(),
  business_hours: z.string().trim().max(200).nullable(),
  postal_address: z.string().trim().max(500).nullable(),
  footer_unlock_code: z.string().trim().max(60).nullable(),
  legal_footer_line: z.string().trim().max(1000).nullable(),
});

import { clearWebsiteCache } from "@/lib/websites/current-website.server";

export const updateWebsiteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ContactInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { websiteId, ...patch } = data;
    const { error } = await supabase.from("websites").update(patch).eq("id", websiteId);
    if (error) throw new Error(error.message);
    clearWebsiteCache();
    return { ok: true };
  });
