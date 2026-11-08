import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/tickets/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/support/tickets" });
  },
});
