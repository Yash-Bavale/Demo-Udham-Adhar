import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "form-assets";

export const Route = createFileRoute("/api/public/form-asset/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const splat = String((params as { _splat?: string })._splat || "").trim();
        if (!splat || splat.includes("..")) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: signed, error } = await supabaseAdmin
          .storage.from(BUCKET).createSignedUrl(splat, 60 * 10);
        if (error || !signed?.signedUrl) {
          return new Response("File not available.", { status: 404 });
        }
        return new Response(null, {
          status: 302,
          headers: { Location: signed.signedUrl, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
