import { createFileRoute } from "@tanstack/react-router";
import { InboxManagementPage } from "./admin.inbox-management";

export const Route = createFileRoute("/admin/quarantine")({
  head: () => ({
    meta: [
      { title: "Email Pipeline Health — BHS Support" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: QuarantineRedirectPage,
});

function QuarantineRedirectPage() {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-md text-xs mx-6 mt-4 flex items-center justify-between">
        <span>
          ℹ️ The legacy Email Quarantine has been upgraded to <strong>Email Pipeline Health & Processing Errors</strong>. Inbound emails are now deterministically ingested directly into Support Tickets or recorded in Processing Errors.
        </span>
      </div>
      <InboxManagementPage />
    </div>
  );
}
