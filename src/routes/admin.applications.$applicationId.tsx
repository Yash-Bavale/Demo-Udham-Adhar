import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/applications/$applicationId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/admin/orders/$orderId", params: { orderId: params.applicationId } });
  },
});
