import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "documents";

export const Route = (createFileRoute as any)("/api/public/audio/$")({
  server: {
    handlers: {
      GET: async ({ params }: { params: any }) => {
        const splat = String((params as { _splat?: string })._splat || "").trim();
        if (!splat || splat.includes("..")) {
          return new Response("Not found", { status: 404 });
        }

        // Containment: only flat reminder-sound files are served. No folders,
        // no other buckets, no call recordings.
        const name = splat.startsWith("audio/") ? splat.slice(6) : splat;
        if (!/^[A-Za-z0-9._-]{1,120}\.(mp3|wav|ogg|m4a|aac)$/.test(name) || name.startsWith(".")) {
          return new Response("Not found", { status: 404 });
        }
        const path = `audio/${name}`;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          // Download audio file directly to stream or get signed URL
          const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
          if (error || !data) {
            // Fallback: try signed URL redirect
            const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
            if (signed?.signedUrl) {
              return new Response(null, {
                status: 302,
                headers: {
                  Location: signed.signedUrl,
                  "Cache-Control": "public, max-age=3600",
                },
              });
            }
            return new Response("Audio file not found", { status: 404 });
          }

          let contentType = "audio/mpeg";
          if (path.endsWith(".wav")) contentType = "audio/wav";
          else if (path.endsWith(".ogg")) contentType = "audio/ogg";
          else if (path.endsWith(".m4a")) contentType = "audio/mp4";
          else if (path.endsWith(".aac")) contentType = "audio/aac";

          return new Response(data, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, immutable",
              "Accept-Ranges": "bytes",
            },
          });
        } catch (err) {
          console.error("[AudioRoute] error serving audio:", err);
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
