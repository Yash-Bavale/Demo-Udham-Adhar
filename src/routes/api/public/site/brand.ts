import { createFileRoute } from "@tanstack/react-router";
import { loadSite, resolveDomain, siteJson, siteOptions } from "@/lib/site-api";

/** Public: branding/contact details for a customer website (no secrets). */
export const Route = createFileRoute("/api/public/site/brand")({
  server: {
    handlers: {
      OPTIONS: async () => siteOptions(),
      HEAD: async ({ request }) => {
        const site = await loadSite(resolveDomain(request, new URL(request.url).searchParams.get("domain")));
        return new Response(null, { status: site ? 200 : 404 });
      },
      GET: async ({ request }) => {
        try {
          const site = await loadSite(resolveDomain(request, new URL(request.url).searchParams.get("domain")));
          if (!site) return siteJson({ ok: false, error: "Website not configured" }, 404);
          const { is_active: _a, ...brand } = site;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [blocksRes, navRes] = await Promise.all([
            supabaseAdmin
              .from("site_content_blocks")
              .select("block_key, content, sort_order")
              .eq("website_id", site.id)
              .eq("is_active", true)
              .order("sort_order"),
            supabaseAdmin
              .from("site_nav_items")
              .select("label, path, nav_group, open_in_new, sort_order")
              .eq("website_id", site.id)
              .eq("is_active", true)
              .order("sort_order"),
          ]);
          const blocks: Record<string, unknown> = {};
          for (const b of blocksRes.data ?? []) blocks[b.block_key] = b.content;
          const text = (k: string): string | null => {
            const c = blocks[k] as { text?: unknown } | string | null | undefined;
            if (typeof c === "string") return c || null;
            return c && typeof c.text === "string" && c.text.trim() ? c.text : null;
          };
          const nav = navRes.data ?? [];
          const content = {
            blocks,
            header_brand_title: text("header.brand_title"),
            header_brand_subtitle: text("header.brand_subtitle"),
            header_center_title: text("header.center_title"),
            header_center_subtitle: text("header.center_subtitle"),
            footer_brand_heading: text("footer.brand_heading"),
            footer_contact_name: text("footer.contact_name"),
            nav: {
              header: nav.filter((n) => n.nav_group === "header"),
              footer: nav.filter((n) => n.nav_group !== "header"),
            },
          };
          return siteJson({ ok: true, ...brand, ...content, brand, website: brand, content });
        } catch (e) {
          console.error("[site/brand]", e);
          return siteJson({ ok: false, error: "Could not load website" }, 500);
        }
      },
    },
  },
});
