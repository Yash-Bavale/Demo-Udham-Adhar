// One-time opt-in banner for browser notifications (Final_CRM Part E).
import { Bell, X } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";

export function NotificationsOptIn() {
  const { supported, canPrompt, dismissed, request, dismissBanner, notify, granted } = useNotifications();
  if (!supported || dismissed || granted || !canPrompt) return null;

  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3"
      style={{ background: "var(--admin-accent-soft)", borderColor: "var(--admin-border)" }}
    >
      <Bell className="size-4 shrink-0" style={{ color: "var(--admin-primary)" }} />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-medium" style={{ color: "var(--admin-fg)" }}>
          Turn on desktop notifications
        </div>
        <div className="text-xs" style={{ color: "var(--admin-fg-muted)" }}>
          Get notified instantly when new leads come in — even when this tab is in the background.
        </div>
      </div>
      <button
        onClick={async () => {
          const result = await request();
          if (result === "granted") {
            notify({ title: "Notifications enabled", body: "You'll get a ping for new leads.", tag: "welcome" });
          }
        }}
        className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
        style={{ background: "var(--admin-primary)" }}
      >
        Enable
      </button>
      <button
        onClick={dismissBanner}
        className="rounded-md p-1.5 hover:bg-[var(--admin-surface-2)]"
        aria-label="Dismiss"
      >
        <X className="size-3.5" style={{ color: "var(--admin-fg-muted)" }} />
      </button>
    </div>
  );
}
