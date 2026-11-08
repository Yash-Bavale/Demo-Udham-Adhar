import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Canonicalise /index.html to / with a permanent redirect so search
// engines consolidate ranking signals on a single URL.
export const Route = createFileRoute("/index.html")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 301,
          headers: {
            Location: "https://udyamadhar.in/",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
