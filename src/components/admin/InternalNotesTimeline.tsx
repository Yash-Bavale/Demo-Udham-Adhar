import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, User2 } from "lucide-react";
import { getOrderNotes, addOrderNote } from "@/lib/crm/orders.functions";

function fmt(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { dateStyle: "medium" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function InternalNotesTimeline({ applicationId }: { applicationId: string }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getOrderNotes);
  const addFn = useServerFn(addOrderNote);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.order.notes", applicationId],
    queryFn: () => fetchFn({ data: { applicationId } }),
  });

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await addFn({ data: { applicationId, note: text.trim() } });
      setText("");
      toast.success("Note added");
      qc.invalidateQueries({ queryKey: ["admin.order.notes", applicationId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--admin-fg-muted)" }}>
          Internal Notes Timeline
        </div>
        <span className="text-[10px]" style={{ color: "var(--admin-fg-muted)" }}>
          {items.length} entries
        </span>
      </div>

      <div className="flex gap-2 mb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an internal note…"
          rows={2}
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 resize-none"
          style={{
            background: "var(--admin-surface-2)",
            borderColor: "var(--admin-border)",
            color: "var(--admin-fg)",
          }}
        />
        <button
          onClick={submit}
          disabled={submitting || !text.trim()}
          className="self-end rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
          style={{ background: "var(--admin-primary)", color: "#fff" }}
        >
          Add Note
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs italic" style={{ color: "var(--admin-fg-muted)" }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="text-xs italic py-6 text-center" style={{ color: "var(--admin-fg-muted)" }}>
          No notes yet. The audit trail will appear here.
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((it: any) => {
            const t = fmt(it.at);
            const isAuto = it.kind === "auto";
            return (
              <li
                key={it.id}
                className="flex gap-3 pb-3 border-b last:border-0"
                style={{ borderColor: "var(--admin-border)" }}
              >
                <div
                  className="size-7 shrink-0 rounded-full flex items-center justify-center mt-0.5"
                  style={{
                    background: isAuto ? "var(--admin-surface-2)" : "var(--admin-primary)",
                    color: isAuto ? "var(--admin-fg-muted)" : "#fff",
                  }}
                >
                  {isAuto ? <Sparkles className="w-3.5 h-3.5" /> : <User2 className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                    <span>{t.date}</span>
                    <span>•</span>
                    <span>{t.time}</span>
                    <span>•</span>
                    <span className="font-medium" style={{ color: "var(--admin-fg)" }}>
                      {it.author}
                    </span>
                    {isAuto && (
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}
                      >
                        Auto
                      </span>
                    )}
                  </div>
                  <div className="text-sm mt-1" style={{ color: "var(--admin-fg)" }}>
                    {it.text}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
