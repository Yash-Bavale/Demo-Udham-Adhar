import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SeoPage = {
  id: string;
  slug: string;
  label: string;
  enabled: boolean;
  sort_order: number;
  page_type?: string;
};

export type SitemapPageItem = {
  id: string;
  slug: string;
  label: string;
  source: "Contentful CMS" | "Database SEO Page" | "Static Route";
  inSitemap: boolean;
  lastmod: string;
  isSensitive: boolean;
};

const SENSITIVE_PREFIXES = [
  "/api",
  "/admin",
  "/admin-login",
  "/seo-admin",
  "/onboarding",
  "/payment",
  "/payment-pending",
  "/payment-failed",
  "/processing",
  "/success",
  "/apply",
  "/email",
  "/lovable",
  "/mcp",
  "/.mcp",
  "/.well-known",
];

export function isPathSensitive(path: string): boolean {
  const p = path.toLowerCase().trim();
  if (
    p.includes("$") ||
    p.includes("*") ||
    p.includes("[") ||
    p.includes("]") ||
    p.startsWith("/.") ||
    p.includes("mcp") ||
    p.includes("oauth")
  ) {
    return true;
  }
  return SENSITIVE_PREFIXES.some((pre) => p === pre || p.startsWith(pre + "/"));
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

/** Public — used by footer link list. */
export const listPublicSeoPages = createServerFn({ method: "GET" }).handler(
  async (): Promise<SeoPage[]> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { resolveCurrentWebsite } = await import("@/lib/websites/current-website.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const site = await resolveCurrentWebsite(getRequest());
    const { data, error } = await supabaseAdmin
      .from("seo_pages")
      .select("id, slug, label, enabled, sort_order, page_type")
      .eq("enabled", true)
      .eq("website_id", site.id)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SeoPage[];
  },
);

/** Admin — full list including disabled rows. */
export const listAllSeoPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeoPage[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("seo_pages")
      .select("id, slug, label, enabled, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SeoPage[];
  });

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  website_id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  label: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
  sort_order: z.number().int().min(0).max(100000),
});

export const upsertSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("seo_pages")
        .update({
          slug: data.slug,
          label: data.label,
          enabled: data.enabled,
          sort_order: data.sort_order,
          ...(data.website_id ? { website_id: data.website_id } : {}),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      let websiteId = data.website_id;
      if (!websiteId) {
        const { data: site, error: sErr } = await supabaseAdmin
          .from("websites")
          .select("id")
          .eq("is_primary", true)
          .maybeSingle();
        if (sErr) throw new Error(sErr.message);
        if (!site) throw new Error("No primary website configured");
        websiteId = site.id;
      }
      const { error } = await supabaseAdmin.from("seo_pages").insert({
        website_id: websiteId,
        slug: data.slug,
        label: data.label,
        enabled: data.enabled,
        sort_order: data.sort_order,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("seo_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

/** CRM Sitemap Page Manager — Fetches 1-to-1 page map (Contentful, DB, Static) hiding sensitive routes. */
export const getSitemapPageManagerData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SitemapPageItem[]> => {
    await assertAdmin(context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { resolveCurrentWebsite } = await import("@/lib/websites/current-website.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listContentfulSeoSlugs } = await import("@/lib/contentful/client.functions");

    const site = await resolveCurrentWebsite(getRequest());

    const itemsMap = new Map<string, SitemapPageItem>();

    // 1. Static Core Landing Pages
    const CORE_PAGES = [
      { slug: "/", label: "Homepage" },
      { slug: "/udyam-registration", label: "Udyam Registration Online" },
      { slug: "/new-udyam-registration", label: "New Udyam Registration" },
      { slug: "/download-udyam-certificate", label: "Download Udyam Certificate" },
      { slug: "/print-udyam-certificate", label: "Print Udyam Certificate" },
      { slug: "/verify-udyam-certificate", label: "Verify Udyam Certificate" },
      { slug: "/update-udyam-certificate", label: "Update Udyam Certificate" },
      { slug: "/forgot-udyam-registration-number", label: "Forgot Udyam Registration Number" },
      { slug: "/msme-registration", label: "MSME Registration" },
      { slug: "/msme-registration-fee", label: "MSME Registration Fee" },
      { slug: "/migrate-udyog-aadhaar-to-udyam", label: "Migrate Udyog Aadhaar to Udyam" },
      { slug: "/talk-to-expert", label: "Talk to Expert" },
      { slug: "/about-us", label: "About Us" },
      { slug: "/contact-us", label: "Contact Us" },
      { slug: "/terms-conditions", label: "Terms & Conditions" },
      { slug: "/privacy-policy", label: "Privacy Policy" },
      { slug: "/refund-cancellation-policy", label: "Refund & Cancellation Policy" },
      { slug: "/service-delivery-policy", label: "Service Delivery Policy" },
      { slug: "/pricing-transparency", label: "Pricing Transparency" },
      { slug: "/disclaimer", label: "Disclaimer" },
      { slug: "/cookie-policy", label: "Cookie Policy" },
      { slug: "/important-notice", label: "Important Notice" },
      { slug: "/grievance-redressal-policy", label: "Grievance Redressal Policy" },
      { slug: "/complaint-grievance-policy", label: "Complaint Grievance Policy" },
      { slug: "/compliance-statement", label: "Compliance Statement" },
      { slug: "/consent-acknowledgment", label: "Consent Acknowledgment" },
      { slug: "/aml-anti-fraud-policy", label: "AML & Anti-Fraud Policy" },
    ];

    for (const c of CORE_PAGES) {
      if (isPathSensitive(c.slug)) continue;
      itemsMap.set(c.slug, {
        id: `static-${c.slug}`,
        slug: c.slug,
        label: c.label,
        source: "Static Route",
        inSitemap: true,
        lastmod: new Date().toISOString().slice(0, 10),
        isSensitive: false,
      });
    }

    // 2. Database SEO Pages for this website
    try {
      const { data: dbPages } = await supabaseAdmin
        .from("seo_pages")
        .select("id, slug, label, enabled, updated_at")
        .or(`website_id.eq.${site.id},website_id.is.null`);
      for (const row of dbPages ?? []) {
        const path = row.slug.startsWith("/") ? row.slug : `/${row.slug}`;
        if (isPathSensitive(path)) continue;
        itemsMap.set(path, {
          id: row.id,
          slug: path,
          label: row.label || path,
          source: "Database SEO Page",
          inSitemap: row.enabled ?? true,
          lastmod: (row.updated_at ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
          isSensitive: false,
        });
      }
    } catch {
      // ignore
    }

    // 3. Contentful SEO Articles
    try {
      const cfSlugs = await listContentfulSeoSlugs();
      for (const row of cfSlugs) {
        const path = `/${row.slug.replace(/^\/+/, "")}`;
        if (isPathSensitive(path)) continue;
        const formattedLabel = row.slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        itemsMap.set(path, {
          id: `cf-${row.slug}`,
          slug: path,
          label: formattedLabel,
          source: "Contentful CMS",
          inSitemap: true,
          lastmod: row.updatedAt || new Date().toISOString().slice(0, 10),
          isSensitive: false,
        });
      }
    } catch {
      // ignore
    }

    return Array.from(itemsMap.values()).sort((a, b) => a.slug.localeCompare(b.slug));
  });

/** Bulk submit all clean public pages into the database sitemap list. */
export const submitAllPagesToSitemap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { resolveCurrentWebsite } = await import("@/lib/websites/current-website.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listContentfulSeoSlugs } = await import("@/lib/contentful/client.functions");

    const site = await resolveCurrentWebsite(getRequest());
    if (!site?.id) throw new Error("Could not resolve the current website");

    // Contentful slugs come from THIS site's space, so they may only ever be
    // written to THIS site's seo_pages rows.
    const cfSlugs = await listContentfulSeoSlugs().catch(() => []);
    let count = 0;

    for (const cf of cfSlugs) {
      const path = cf.slug.replace(/^\/+/, "");
      if (isPathSensitive(`/${path}`)) continue;
      const label = path.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

      const { error } = await supabaseAdmin.from("seo_pages").upsert(
        {
          website_id: site.id,
          slug: path,
          label,
          enabled: true,
          sort_order: 10,
        },
        { onConflict: "website_id,slug" },
      );
      if (!error) count++;
    }

    return { ok: true, submitted: count };
  });

