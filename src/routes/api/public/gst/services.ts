import { createFileRoute } from "@tanstack/react-router";

const GST_DOMAIN = "gstcertificate.in";

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

/** Public: active GST services (code, name, price) for gstcertificate.in. */
export const Route = createFileRoute("/api/public/gst/services")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: site } = await supabaseAdmin
            .from("websites")
            .select("id")
            .eq("domain", GST_DOMAIN)
            .maybeSingle();
          if (!site?.id) {
            return new Response(JSON.stringify({ ok: false, error: "Website not configured" }), {
              status: 404,
              headers: cors,
            });
          }
          const { data, error } = await supabaseAdmin
            .from("services")
            .select("service_code, service_name, description, base_amount, gst_amount, total_amount, expected_processing_days, sort_order")
            .eq("website_id", site.id)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });
          if (error) throw new Error(error.message);

          const services = (data ?? []).map((s) => ({
            code: s.service_code,
            name: s.service_name,
            description: s.description ?? null,
            baseAmount: Number(s.base_amount),
            gstAmount: Number(s.gst_amount),
            totalAmount: Number(s.total_amount),
            processingDays: s.expected_processing_days ?? null,
          }));
          return new Response(JSON.stringify({ ok: true, services }), { status: 200, headers: cors });
        } catch (e) {
          console.error("[gst/services]", e);
          return new Response(JSON.stringify({ ok: false, error: "Could not load services" }), {
            status: 500,
            headers: cors,
          });
        }
      },
    },
  },
});
