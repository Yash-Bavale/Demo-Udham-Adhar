import { createFileRoute } from "@tanstack/react-router";

// Public endpoint disabled — returns 404 Not Found to avoid exposing OAuth metadata.
export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      ANY: async () =>
        new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        }),
    },
  },
});
