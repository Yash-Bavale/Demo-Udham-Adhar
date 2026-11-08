import { Check } from "lucide-react";
import { APPLICATION_STATUSES } from "@/lib/crm/types";

const LABELS: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  payment_received: "Payment Received",
  details_pending: "Details",
  documents_pending: "Documents",
  under_review: "Review",
  under_process: "Processing",
  completed: "Completed",
};

export function JourneyTimeline({ current }: { current: string }) {
  const idx = APPLICATION_STATUSES.indexOf(current as never);
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
    >
      <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--admin-fg-muted)" }}>
        Journey
      </div>
      <ol className="flex items-center gap-0 overflow-x-auto">
        {APPLICATION_STATUSES.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          const color = done
            ? "var(--admin-success)"
            : active
            ? "var(--admin-primary)"
            : "var(--admin-border)";
          return (
            <li key={s} className="flex items-center min-w-0">
              <div className="flex flex-col items-center gap-1.5 min-w-[88px]">
                <div
                  className="size-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                  style={{
                    background: done || active ? color : "var(--admin-surface-2)",
                    color: done || active ? "#fff" : "var(--admin-fg-muted)",
                    border: `1px solid ${color}`,
                  }}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <div
                  className="text-[10px] text-center leading-tight"
                  style={{
                    color: active ? "var(--admin-fg)" : "var(--admin-fg-muted)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {LABELS[s] ?? s}
                </div>
              </div>
              {i < APPLICATION_STATUSES.length - 1 && (
                <div
                  className="h-px w-8 flex-shrink-0"
                  style={{ background: i < idx ? "var(--admin-success)" : "var(--admin-border)" }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
