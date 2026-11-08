import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/applications")({
  // Only the bare list redirects; child /admin/applications/$id has its own redirect to the order page.
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, "") === "/admin/applications") throw redirect({ to: "/admin/orders" });
  },
});
