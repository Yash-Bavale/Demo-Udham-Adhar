import { createFileRoute } from "@tanstack/react-router";

// Public endpoint disabled — returns 404 Not Found to avoid exposing MCP metadata.
export const Route = createFileRoute("/mcp")({
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
