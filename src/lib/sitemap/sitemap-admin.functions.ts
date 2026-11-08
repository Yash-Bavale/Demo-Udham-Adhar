import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SitemapWebsite = {
  id: string;
  name: string;
  domain: string;
  is_primary: boolean;
  sitemapUrl: string;
};

export type SitemapManagerItem = {
  slug: string;
  label: string;
  source: "Contentful CMS" | "Database SEO Page" | "Static Route";
  lastmod: string;
  included: boolean;
  hasOverride: boolean;
};

export type SitemapCheckResult = {
  sitemapUrl: string;
  status: number;
  ok: boolean;
  parsed: boolean;
  urlCount: number;
  missing: string[];
  unexpected: string[];
  wrongHost: string[];
  error?: string;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin role required");
}

/** Websites available in the sitemap manager. */
export const listSitemapWebsites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SitemapWebsite[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("websites")
      .select("id, name, domain, is_primary")
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((w) => {
      const domain = ((w.domain as string) || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      return {
        id: w.id as string,
        name: (w.name as string) || domain,
        domain,
        is_primary: !!w.is_primary,
        sitemapUrl: domain ? `https://${domain}/sitemap.xml` : "",
      };
    });
  });

/** Every page discoverable for a website, with its sitemap inclusion state. */
export const getSitemapManagerData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ websiteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SitemapManagerItem[]> => {
    await assertAdmin(context.userId);
    const { collectSitemapItems } = await import("@/lib/sitemap/sitemap.server");
    return collectSitemapItems(data.websiteId);
  });

/** Include or exclude a single page from a website's sitemap. */
export const setSitemapInclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        websiteId: z.string().uuid(),
        slug: z.string().trim().min(1).max(300),
        included: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizePath } = await import("@/lib/sitemap/sitemap.server");
    const slug = normalizePath(data.slug);
    const { error } = await supabaseAdmin.from("sitemap_overrides").upsert(
      { website_id: data.websiteId, slug, included: data.included },
      { onConflict: "website_id,slug" },
    );
    if (error) throw new Error(error.message);

    // Note: this only controls sitemap inclusion. The page itself stays
    // published — publishing is managed separately via seo_pages.enabled.

    return { ok: true };
  });

/** Fetch a website's live sitemap and diff it against what should be listed. */
export const checkLiveSitemap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ websiteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SitemapCheckResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { collectSitemapItems, normalizePath } = await import(
      "@/lib/sitemap/sitemap.server"
    );
    const { data: site } = await supabaseAdmin
      .from("websites")
      .select("domain")
      .eq("id", data.websiteId)
      .maybeSingle();
    const host = ((site?.domain as string) || "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const sitemapUrl = host ? `https://${host}/sitemap.xml` : "";

    const base: SitemapCheckResult = {
      sitemapUrl,
      status: 0,
      ok: false,
      parsed: false,
      urlCount: 0,
      missing: [],
      unexpected: [],
      wrongHost: [],
    };
    if (!host) return { ...base, error: "This website has no domain configured." };

    let xml = "";
    try {
      const res = await fetch(sitemapUrl, { headers: { "Cache-Control": "no-cache" } });
      base.status = res.status;
      base.ok = res.ok;
      xml = await res.text();
    } catch (err) {
      return { ...base, error: (err as Error).message };
    }
    if (!base.ok) return { ...base, error: `Sitemap responded with HTTP ${base.status}` };

    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
    base.parsed = xml.includes("<urlset") && locs.length > 0;
    base.urlCount = locs.length;

    const livePaths = new Set<string>();
    for (const loc of locs) {
      try {
        const u = new URL(loc);
        if (u.hostname.replace(/^www\./, "") !== host.replace(/^www\./, "")) {
          base.wrongHost.push(loc);
        }
        livePaths.add(normalizePath(u.pathname));
      } catch {
        base.wrongHost.push(loc);
      }
    }

    const expectedItems = await collectSitemapItems(data.websiteId);
    const expected = expectedItems.filter((i) => i.included).map((i) => i.slug);
    const excluded = new Set(expectedItems.filter((i) => !i.included).map((i) => i.slug));

    base.missing = expected.filter((p) => !livePaths.has(p)).sort();
    base.unexpected = Array.from(livePaths)
      .filter((p) => excluded.has(p))
      .sort();

    return base;
  });
