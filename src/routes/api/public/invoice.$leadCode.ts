import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/invoice/$leadCode")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          "Public invoice access disabled. Customer tax invoices are delivered directly via email attachment.",
          { status: 403, headers: { "Content-Type": "text/plain" } },
        );
      },
    },
  },
});
