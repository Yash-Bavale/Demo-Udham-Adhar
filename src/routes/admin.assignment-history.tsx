import { createFileRoute } from "@tanstack/react-router";
import { AssignmentManagementView } from "@/components/admin/reassignment/AssignmentManagementView";

export const Route = createFileRoute("/admin/assignment-history")({
  head: () => ({
    meta: [
      { title: "Assignment History & Leaves — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AssignmentHistoryPage,
});

function AssignmentHistoryPage() {
  return <AssignmentManagementView />;
}
