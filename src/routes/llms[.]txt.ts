import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { BASE_URL, SITE_NAME, LEGAL_ENTITY, CONTACT_EMAIL } from "@/lib/brand";

// llms.txt — a concise markdown index for AI crawlers
// (ChatGPT, Perplexity, Claude). Spec: https://llmstxt.org/
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let seoLinks: { slug: string; label: string; description?: string | null }[] = [];
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { resolveCurrentWebsite } = await import(
            "@/lib/websites/current-website.server"
          );
          const site = await resolveCurrentWebsite(request);
          let { data } = await supabaseAdmin
            .from("seo_pages")
            .select("slug, label, meta_description")
            .eq("website_id", site.id)
            .eq("enabled", true)
            .order("sort_order", { ascending: true });
          if (!data || data.length === 0) {
            const { data: fallbackData } = await supabaseAdmin
              .from("seo_pages")
              .select("slug, label, meta_description")
              .eq("enabled", true)
              .order("sort_order", { ascending: true });
            data = fallbackData;
          }
          seoLinks = (data ?? []).map((r: any) => ({
            slug: r.slug,
            label: r.label,
            description: r.meta_description,
          }));
        } catch {
          // ignore — fall through with empty list
        }

        const coreServices = [
          ["/udyam-registration", "New Udyam Registration"],
          ["/update-udyam-certificate", "Update Udyam Certificate"],
          ["/download-udyam-certificate", "Download Udyam Certificate"],
          ["/print-udyam-certificate", "Print Udyam Certificate"],
          ["/migrate-udyog-aadhaar-to-udyam", "Udyog Aadhaar to Udyam Migration"],
        ];

        const lines: string[] = [];
        lines.push(`# ${SITE_NAME}`);
        lines.push("");
        lines.push(
          `> ${SITE_NAME} is a private consultancy operated by ${LEGAL_ENTITY} that helps Indian micro, small, and medium enterprises with Udyam / MSME registration, certificate updates, downloads, and Udyog Aadhaar to Udyam migration. We are not affiliated with any government authority.`,
        );
        lines.push("");
        lines.push(`Site: ${BASE_URL}`);
        lines.push(`Contact: ${CONTACT_EMAIL}`);
        lines.push("");
        lines.push("## Core services");
        lines.push("");
        for (const [path, label] of coreServices) {
          lines.push(`- [${label}](${BASE_URL}${path})`);
        }
        lines.push("");
        if (seoLinks.length) {
          lines.push("## All pages");
          lines.push("");
          for (const link of seoLinks) {
            const slugPath = link.slug.startsWith("/") ? link.slug : `/${link.slug}`;
            const desc = link.description ? `: ${link.description}` : "";
            lines.push(`- [${link.label}](${BASE_URL}${slugPath})${desc}`);
          }
          lines.push("");
        }
        lines.push("## Reference");
        lines.push("");
        lines.push(`- [Sitemap](${BASE_URL}/sitemap.xml)`);
        lines.push(`- [Full content for LLMs](${BASE_URL}/llms-full.txt)`);
        lines.push("");

        return new Response(lines.join("\n"), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
