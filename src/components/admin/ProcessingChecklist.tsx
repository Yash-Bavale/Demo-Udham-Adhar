import { Check, Circle, Clock } from "lucide-react";

interface Props {
  payments: any[];
  documents: any[];
  application: any;
  /** Whether to hide money/finance figures */
  hideAmount?: boolean;
}

/**
 * Processing Checklist — DERIVED from existing data. No writes.
 * Reflects the operational gates an employee must clear to complete an order.
 */
export function ProcessingChecklist({ payments, documents, application, hideAmount }: Props) {
  const paymentDone = (payments ?? []).some((p) =>
    ["paid", "success", "successful"].includes(String(p.status)),
  );

  const formDone = !!application?.form_submitted_at;
  const fulfillment = application?.fulfillment_status ?? "order_received";
  const docsReceived = fulfillment !== "order_received";
  const verified = ["application_submitted", "under_processing", "completed"].includes(fulfillment);
  const submittedGovt = ["application_submitted", "under_processing", "completed"].includes(fulfillment);
  const processing = ["under_processing", "completed"].includes(fulfillment);
  const certDone = !!application?.certificate_uploaded_at || fulfillment === "completed";
  const completed = fulfillment === "completed";

  const items = [
    { label: "Payment received", done: paymentDone, hidden: hideAmount },
    { label: "Customer form submitted", done: formDone },
    { label: "Documents received", done: docsReceived },
    { label: "Documents verified", done: verified },
    { label: "Submitted to Govt portal", done: submittedGovt },
    { label: "Under processing", done: processing },
    { label: "Certificate uploaded", done: certDone },
    { label: "Customer notified · completed", done: completed },
  ].filter((i) => !i.hidden);

  const completedCount = items.filter((i) => i.done).length;
  const pct = Math.round((completedCount / items.length) * 100);

  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Processing Checklist</h3>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--admin-fg-muted)" }}>
            {completedCount} of {items.length} steps complete
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums" style={{ color: "var(--admin-fg)" }}>
            {pct}%
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full overflow-hidden mb-4" style={{ background: "var(--admin-surface-2)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: completed ? "#10B981" : "#3B82F6" }}
        />
      </div>

      <ul className="space-y-1.5">
        {items.map((it, idx) => {
          const isCurrent = !it.done && items.slice(0, idx).every((p) => p.done);
          return (
            <li key={it.label} className="flex items-center gap-2.5">
              <span
                className="size-5 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: it.done ? "#10B981" : isCurrent ? "#EFF6FF" : "var(--admin-surface-2)",
                  color: it.done ? "#fff" : isCurrent ? "#2563EB" : "var(--admin-fg-subtle)",
                  border: isCurrent && !it.done ? "1.5px solid #93C5FD" : "none",
                }}
              >
                {it.done
                  ? <Check className="size-3" strokeWidth={3} />
                  : isCurrent
                    ? <Clock className="size-3" />
                    : <Circle className="size-2.5" />}
              </span>
              <span
                className="text-[13px]"
                style={{
                  color: it.done
                    ? "var(--admin-fg-muted)"
                    : isCurrent
                      ? "var(--admin-fg)"
                      : "var(--admin-fg-muted)",
                  fontWeight: isCurrent ? 600 : 400,
                  textDecoration: it.done ? "line-through" : "none",
                  textDecorationColor: "var(--admin-fg-subtle)",
                }}
              >
                {it.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
