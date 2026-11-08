import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface NavItem {
  id: string;
  label: string;
  path: string;
  openInNew: boolean;
}

export interface SiteContent {
  websiteId: string;
  headerNav: NavItem[];
  footerNav: NavItem[];
  /** block_key -> content JSON */
  blocks: Record<string, JsonValue>;
}

const EMPTY: SiteContent = {
  websiteId: "",
  headerNav: [],
  footerNav: [],
  blocks: {},
};

/**
 * Public, unauthenticated read of the current website's navigation and
 * editable content blocks. Safe for SSR / prerender on public routes.
 */
export const getSiteContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteContent> => {
    try {
      const { resolveCurrentWebsite } = await import("./current-website.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const site = await resolveCurrentWebsite(getRequest());

      const [navRes, blockRes] = await Promise.all([
        supabaseAdmin
          .from("site_nav_items")
          .select("id, label, path, nav_group, open_in_new, sort_order")
          .eq("website_id", site.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabaseAdmin
          .from("site_content_blocks")
          .select("block_key, content")
          .eq("website_id", site.id)
          .eq("is_active", true),
      ]);

      const rows = navRes.data ?? [];
      const toItem = (r: (typeof rows)[number]): NavItem => ({
        id: r.id,
        label: r.label,
        path: r.path,
        openInNew: !!r.open_in_new,
      });

      const blocks: Record<string, JsonValue> = {};
      for (const b of blockRes.data ?? []) blocks[b.block_key] = b.content as JsonValue;

      return {
        websiteId: site.id,
        headerNav: rows.filter((r) => r.nav_group === "header").map(toItem),
        footerNav: rows.filter((r) => r.nav_group === "footer").map(toItem),
        blocks,
      };
    } catch (err) {
      console.warn("[getSiteContent] falling back to code defaults", err);
      return EMPTY;
    }
  },
);
