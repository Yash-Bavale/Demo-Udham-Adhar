import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { VARIANT_SLUGS } from "@/lib/seo/canonical-clusters";

// Path prefixes that must never appear in the sitemap.
// Intentional exclusions (not bugs — scanner may flag these as "missing"):
//   /admin-login, /llms.txt, /llms-full.txt — not indexable pages.
//   /$ (splat 404) — catch-all, not a real URL.
const EXCLUDED_PREFIXES = [
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


// Top-funnel high-priority paths (includes Batch 1 SEO landing pages).
const HIGH_PRIORITY = new Set<string>([
  "/",
  // Batch 1 SEO pages
  "/udyam-registration",
  "/udyam-registration-online",
  "/udyam-registration-process",
  "/udyam-registration-number",
  "/udyam-registration-status",
  "/udyam-registration-fee",
  "/udyam-registration-free",
  "/udyam-registration-benefits",
  "/udyam-registration-eligibility",
  "/udyam-registration-documents-required",
  "/udyam-registration-certificate",
  "/udyam-registration-update",
  "/udyam-certificate",
  "/udyam-login",
  "/forgot-udyam-registration-number",
  "/download-udyam-certificate",
  "/print-udyam-certificate",
  "/verify-udyam-certificate",
  "/msme-registration",
  "/msme-certificate-benefits",
  // Other top-funnel
  "/udyam-aadhar-registration",
  "/new-udyam-registration",
  "/update-udyam-certificate",
  "/migrate-udyog-aadhaar-to-udyam",
  "/msme-registration-fee",
]);


function isExcluded(p: string, applyVariantClusters = false): boolean {
  if (p === "/sitemap.xml" || p === "/llms.txt" || p === "/llms-full.txt") return true;
  if (
    p.includes("$") ||
    p.includes("*") ||
    p.includes("[") ||
    p.includes("]") ||
    p.startsWith("/.") ||
    p.includes("mcp") ||
    p.includes("oauth")
  )
    return true;
  // Retired / non-indexable paths that should never appear in sitemap.
  if (
    p === "/home" ||
    p === "/index.html" ||
    p === "/unauthorized" ||
    p === "/not-found" ||
    p === "/404"
  ) return true;
  // Keyword-variant pages stay live and should be included when published;
  // only exclude if applyVariantClusters is explicitly true.
  const slug = p.replace(/^\/+/, "");
  if (applyVariantClusters && VARIANT_SLUGS.has(slug)) return true;
  return EXCLUDED_PREFIXES.some((pre) => p === pre || p.startsWith(pre + "/"));
}

const BUILTIN_STATIC_ROUTES = [
  "/",
  "/about-us",
  "/contact-us",
  "/terms-conditions",
  "/privacy-policy",
  "/refund-cancellation-policy",
  "/service-delivery-policy",
  "/pricing-transparency",
  "/disclaimer",
  "/cookie-policy",
  "/important-notice",
  "/grievance-redressal-policy",
  "/complaint-grievance-policy",
  "/compliance-statement",
  "/consent-acknowledgment",
  "/aml-anti-fraud-policy",
  "/talk-to-expert",
  "/udyam-registration",
  "/new-udyam-registration",
  "/download-udyam-certificate",
  "/print-udyam-certificate",
  "/verify-udyam-certificate",
  "/update-udyam-certificate",
  "/forgot-udyam-registration-number",
  "/msme-registration",
  "/msme-registration-fee",
  "/migrate-udyog-aadhaar-to-udyam",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Resolve the correct base URL for this domain so each website
        // (udyamadhar.in, udyamregistrations.in) gets its own sitemap URLs.
        const reqUrl = new URL(request.url);
        const SITE_BASE = `${reqUrl.protocol}//${reqUrl.host}`;

        const { resolveCurrentWebsite } = await import(
          "@/lib/websites/current-website.server"
        );
        const { isBlockedOnSecondarySite } = await import(
          "@/lib/websites/secondary-site-routes"
        );
        const currentSite = await resolveCurrentWebsite(request).catch(() => null);
        const publicOnly = currentSite ? !currentSite.allow_admin : false;

        // A secondary site still links to its own nav/service pages — those
        // must stay in its sitemap, so feed them to the route gate.
        let navPaths: string[] = [];
        if (publicOnly && currentSite?.id) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("site_nav_items")
              .select("path")
              .eq("website_id", currentSite.id);
            navPaths = (data ?? [])
              .map((r) => (r as { path?: string }).path ?? "")
              .filter(Boolean);
          } catch {
            // nav lookup is best-effort
          }
        }
        const siteBlocked = (p: string) =>
          publicOnly && isBlockedOnSecondarySite(p, navPaths);

        // 1. Discover static routes from the generated route tree + builtin list.
        const mod = await import("@/routeTree.gen");
        const tree = (mod as unknown as {
          routeTree: { children?: Record<string, unknown> | Array<unknown> };
        }).routeTree;
        const all: string[] = [...BUILTIN_STATIC_ROUTES];

        const walk = (node: {
          id?: string;
          path?: string;
          fullPath?: string;
          options?: { path?: string };
          children?: Record<string, unknown> | Array<unknown>;
        }) => {
          if (!node || typeof node !== "object") return;
          const rawPath = node.fullPath || node.id || node.path || node.options?.path;
          if (typeof rawPath === "string" && rawPath && rawPath.startsWith("/")) {
            all.push(rawPath);
          }
          const ch = node.children;
          if (ch) {
            if (Array.isArray(ch)) {
              ch.forEach((child) => walk(child as never));
            } else if (typeof ch === "object") {
              Object.values(ch).forEach((child) => walk(child as never));
            }
          }
        };
        walk(tree as never);

        const routePaths = all
          .filter((p): p is string => typeof p === "string")
          .map((p) => (p.length > 1 ? p.replace(/\/$/, "") : p))
          .map((p) => p.toLowerCase())
          .filter((p) => !isExcluded(p, false) && !siteBlocked(p));

        // Stable lastmod for static routes. Bump this string only when the
        // route list or page content materially changes — do NOT use
        // `new Date()` here or Google sees every URL "updated today" on
        // every crawl, which suppresses re-indexing signals.
        const STATIC_LASTMOD = "2026-07-11";

        type Entry = { path: string; lastmod: string };
        const entries = new Map<string, Entry>();
        for (const p of routePaths) entries.set(p, { path: p, lastmod: STATIC_LASTMOD });

        // 2. Pull enabled SEO pages from the DB and merge in — these carry
        //    their own updated_at so lastmod reflects real edits.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let query = supabaseAdmin
            .from("seo_pages")
            .select("slug, updated_at")
            .eq("enabled", true);

          if (currentSite?.id) {
            query = query.or(`website_id.eq.${currentSite.id},website_id.is.null`);
          }

          const { data } = await query;

          for (const row of data ?? []) {
            const slug = (row as { slug: string }).slug?.trim().toLowerCase();
            if (!slug) continue;
            let path = slug.startsWith("/") ? slug : `/${slug}`;
            path = path.length > 1 ? path.replace(/\/$/, "") : path;
            if (isExcluded(path, false)) continue;
            const raw = (row as { updated_at?: string }).updated_at;
            const lastmod = raw ? raw.slice(0, 10) : STATIC_LASTMOD;
            entries.set(path, { path, lastmod });
          }
        } catch {
          // If DB is unreachable, still emit the static route list.
        }

        // 3. Contentful is the source of truth for SEO pages: every published
        //    page entry for THIS site is added automatically. Entries whose
        //    canonical points at a different page (keyword variants) are
        //    skipped so the sitemap only lists canonical URLs.
        try {
          const { listContentfulPageSlugsForWebsite } = await import(
            "@/lib/sitemap/sitemap.server"
          );
          let cfSlugs = currentSite?.id
            ? await listContentfulPageSlugsForWebsite(currentSite.id)
            : [];

          if (!cfSlugs || cfSlugs.length === 0) {
            const { listContentfulSeoSlugs } = await import(
              "@/lib/contentful/client.functions"
            );
            const globalCf = await listContentfulSeoSlugs().catch(() => []);
            cfSlugs = globalCf.map((g) => ({
              slug: g.slug,
              title: g.slug,
              canonicalUrl: g.canonicalUrl,
              updatedAt: g.updatedAt,
              contentType: "seoArticle",
            }));
          }

          for (const row of cfSlugs) {
            const path = `/${row.slug.replace(/^\/+/, "")}`;
            // No siteBlocked() here: these entries come from Contentful, so publishing
            // one there puts it in the sitemap.
            if (isExcluded(path, false)) continue;
            if (row.canonicalUrl) {
              let canonicalPath = row.canonicalUrl.trim().toLowerCase();
              canonicalPath = canonicalPath.replace(/^https?:\/\/[^/]+/, "");
              canonicalPath = canonicalPath.replace(/^[^/]+\.[a-z]{2,}/, "");
              if (canonicalPath && !canonicalPath.startsWith("/")) canonicalPath = `/${canonicalPath}`;
              canonicalPath = canonicalPath.replace(/\/$/, "");
              if (canonicalPath && canonicalPath !== path) continue;
            }
            entries.set(path, { path, lastmod: row.updatedAt || STATIC_LASTMOD });
          }
        } catch {
          // CMS unreachable — keep the static + DB entries.
        }

        // 4. Admin exclusions win over every source above.
        if (currentSite?.id) {
          try {
            const { loadSitemapExclusions } = await import("@/lib/sitemap/sitemap.server");
            const excluded = await loadSitemapExclusions(currentSite.id);
            for (const path of excluded) entries.delete(path);
          } catch {
            // ignore — overrides are best-effort
          }
        }

        const sorted = Array.from(entries.values()).sort((a, b) =>
          a.path.localeCompare(b.path),
        );


        const urls = sorted.map((e) => {
          const priority = HIGH_PRIORITY.has(e.path)
            ? "1.0"
            : e.path.length < 25
              ? "0.8"
              : "0.6";
          const changefreq = e.path === "/" ? "weekly" : "monthly";
          return [
            "  <url>",
            `    <loc>${SITE_BASE}${e.path}</loc>`,
            `    <lastmod>${e.lastmod}</lastmod>`,
            `    <changefreq>${changefreq}</changefreq>`,
            `    <priority>${priority}</priority>`,
            "  </url>",
          ].join("\n");
        });

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          "</urlset>",
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            // Newly published CMS pages must show up right away, so the
            // sitemap is only briefly cached and always revalidated.
            "Cache-Control": "public, max-age=60, must-revalidate",
          },
        });
      },
    },
  },
});
