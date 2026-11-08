import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/tickets/$ticketId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/support/tickets/$ticketId",
      params: { ticketId: params.ticketId },
    });
  },
});
