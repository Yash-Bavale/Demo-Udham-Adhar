import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { BASE_URL, SITE_NAME, LEGAL_ENTITY, CONTACT_EMAIL } from "@/lib/brand";

function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// llms-full.txt — full content corpus for AI crawlers.
// Concatenates plain-text content of every enabled SEO page (DB) plus key static pages.
export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const out: string[] = [];
        out.push(`# ${SITE_NAME} — Full Content`);
        out.push("");
        out.push(
          `${SITE_NAME} is a private consultancy operated by ${LEGAL_ENTITY}.`,
        );
        out.push(`Website: ${BASE_URL}`);
        out.push(`Contact: ${CONTACT_EMAIL}`);
        out.push("");
        out.push("---");
        out.push("");

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const site = await (await import("@/lib/websites/current-website.server")).resolveCurrentWebsite(request);
          let { data } = await supabaseAdmin
            .from("seo_pages")
            .select(
              "slug, label, page_type, h1, meta_title, meta_description, intro, sections, faq",
            )
            .eq("website_id", site.id)
            .eq("enabled", true)
            .order("sort_order", { ascending: true });

          if (!data || data.length === 0) {
            const { data: fallbackData } = await supabaseAdmin
              .from("seo_pages")
              .select(
                "slug, label, page_type, h1, meta_title, meta_description, intro, sections, faq",
              )
              .eq("enabled", true)
              .order("sort_order", { ascending: true });
            data = fallbackData;
          }

          for (const row of (data ?? []) as any[]) {
            const slugPath = row.slug.startsWith("/") ? row.slug : `/${row.slug}`;
            out.push(`## ${row.h1 ?? row.meta_title ?? row.label}`);
            out.push("");
            out.push(`URL: ${BASE_URL}${slugPath}`);
            if (row.meta_description) {
              out.push(`Summary: ${row.meta_description}`);
            }
            out.push("");
            if (row.intro) {
              out.push(stripHtml(row.intro));
              out.push("");
            }
            const sections = Array.isArray(row.sections) ? row.sections : [];
            for (const s of sections) {
              if (s?.h2) out.push(`### ${s.h2}`);
              if (s?.h3) out.push(`#### ${s.h3}`);
              if (s?.body_html) out.push(stripHtml(String(s.body_html)));
              out.push("");
            }
            const faq = Array.isArray(row.faq) ? row.faq : [];
            if (faq.length) {
              out.push("FAQ:");
              for (const f of faq) {
                if (f?.q) out.push(`Q: ${f.q}`);
                if (f?.a) out.push(`A: ${stripHtml(String(f.a))}`);
              }
              out.push("");
            }
            out.push("---");
            out.push("");
          }
        } catch {
          // ignore DB failure — still serve header
        }

        return new Response(out.join("\n"), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
