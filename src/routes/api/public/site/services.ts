import { createFileRoute } from "@tanstack/react-router";
import { loadSite, resolveDomain, siteJson, siteOptions } from "@/lib/site-api";

/** Public: active services (code, name, price) for a customer website. */
export const Route = createFileRoute("/api/public/site/services")({
  server: {
    handlers: {
      OPTIONS: async () => siteOptions(),
      GET: async ({ request }) => {
        try {
          const site = await loadSite(resolveDomain(request, new URL(request.url).searchParams.get("domain")));
          if (!site) return siteJson({ ok: false, error: "Website not configured" }, 404);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("services")
            .select("id, service_code, service_name, description, base_amount, gst_amount, total_amount, expected_processing_days, sort_order")
            .eq("website_id", site.id)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });
          if (error) throw new Error(error.message);
          const services = (data ?? []).map((s) => ({
            id: s.id,
            code: s.service_code,
            service_code: s.service_code,
            name: s.service_name,
            service_name: s.service_name,
            description: s.description ?? null,
            baseAmount: Number(s.base_amount),
            gstAmount: Number(s.gst_amount),
            totalAmount: Number(s.total_amount),
            base_amount: Number(s.base_amount),
            gst_amount: Number(s.gst_amount),
            total_amount: Number(s.total_amount),
            processingDays: s.expected_processing_days ?? null,
          }));
          return siteJson({ ok: true, services });
        } catch (e) {
          console.error("[site/services]", e);
          return siteJson({ ok: false, error: "Could not load services" }, 500);
        }
      },
    },
  },
});
