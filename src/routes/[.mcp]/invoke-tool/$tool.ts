import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
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
