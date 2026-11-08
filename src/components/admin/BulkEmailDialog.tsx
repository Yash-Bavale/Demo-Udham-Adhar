import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { X, Loader2 } from "lucide-react";
import { bulkEmailLeads, listEnabledTemplates } from "@/lib/crm/leads-bulk.functions";

export function BulkEmailDialog({ ids, onClose, onSent }: { ids: string[]; onClose: () => void; onSent: (result: { queued: number; skipped: number; failed: number }) => void }) {
  const listFn = useServerFn(listEnabledTemplates);
  const sendFn = useServerFn(bulkEmailLeads);
  const { data } = useQuery({ queryKey: ["admin.templates.enabled"], queryFn: () => listFn() });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border shadow-2xl"
        style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--admin-border)" }}>
          <h3 className="text-base font-semibold" style={{ color: "var(--admin-fg)" }}>Send bulk email</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--admin-surface-2)]"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Sending to <span className="font-semibold" style={{ color: "var(--admin-fg)" }}>{ids.length}</span> selected lead(s). Suppressed addresses will be skipped.
          </p>
          <label className="block text-sm font-medium" style={{ color: "var(--admin-fg)" }}>Template</label>
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--admin-surface-2)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
          >
            <option value="">— Select a template —</option>
            {(data?.rows ?? []).map((t) => (
              <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
            ))}
          </select>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "var(--admin-border)" }}>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm border" style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}>Cancel</button>
          <button
            disabled={!code || busy}
            onClick={async () => {
              setBusy(true); setErr(null);
              try {
                const res = await sendFn({ data: { ids, templateCode: code } });
                onSent(res);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2"
            style={{ background: "var(--admin-accent)" }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Queue emails
          </button>
        </div>
      </motion.div>
    </div>
  );
}
