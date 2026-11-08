import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/support/tickets")({
  head: () => ({
    meta: [
      { title: "Support Tickets — BHS CRM" },
      { name: "description", content: "Customer support ticket operations." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <Outlet />,
});
