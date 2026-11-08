import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/admin/pipeline")({
  head: () => ({ meta: [{ title: "Application Pipeline — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <ComingSoon
      title="Application Pipeline"
      subtitle="Drag-and-drop Kanban across every workflow column with revenue and SLA roll-ups."
      phase="5.5f"
      fallbackHref="/admin/applications"
      fallbackLabel="the flat Application Queue"
    />
  ),
});
