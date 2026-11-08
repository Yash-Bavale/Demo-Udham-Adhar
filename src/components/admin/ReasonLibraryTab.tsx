import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, Pencil, X } from "lucide-react";
import { listReasons, upsertReason, deleteReason } from "@/lib/crm/workflow-settings.functions";
import { SectionCard } from "@/components/admin/ui";
import { toast } from "sonner";

type Table = "workflow_delay_reasons" | "workflow_closure_reasons";
type View = "customer" | "internal" | "closure";

export function ReasonLibraryTab() {
  const [view, setView] = useState<View>("customer");
  const table: Table = view === "closure" ? "workflow_closure_reasons" : "workflow_delay_reasons";
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {([
          ["customer", "Customer-side Delay"],
          ["internal", "Our-side Delay"],
          ["closure", "Closure Reasons"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className="rounded-md px-3 py-1.5 border"
            style={{
              background: view === id ? "var(--admin-primary)" : "var(--admin-surface)",
              color: view === id ? "#fff" : "var(--admin-fg)",
              borderColor: "var(--admin-border)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ReasonTable table={table} side={view === "closure" ? undefined : view} />
    </div>
  );
}

function ReasonTable({ table, side }: { table: Table; side?: "customer" | "internal" }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listReasons);
  const fnDel = useServerFn(deleteReason);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["reason-library", table],
    queryFn: () => fnList({ data: { table } }),
  });
  const rows = (data?.rows ?? []).filter((r: any) => !side || (r.side ?? "customer") === side);

  const del = useMutation({
    mutationFn: (id: string) => fnDel({ data: { table, id } }),
    onSuccess: () => {
      toast.success("Deactivated");
      qc.invalidateQueries({ queryKey: ["reason-library", table] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <SectionCard
      title={side === "customer" ? "Customer-side Delay Reasons" : side === "internal" ? "Our-side Delay Reasons" : "Closure Reasons"}
      action={
        <button
          onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 border"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
        >
          <Plus className="size-3" /> New
        </button>
      }
    >
      {isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs" style={{ color: "var(--admin-fg-muted)" }}>
              <th className="text-left px-4 py-2">Code</th>
              <th className="text-left px-4 py-2">Label</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-left px-4 py-2">Order</th>
              <th className="text-left px-4 py-2">Active</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--admin-border)" }}>
                <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2">{r.label}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.description || "—"}</td>
                <td className="px-4 py-2 tabular-nums">{r.sort_order}</td>
                <td className="px-4 py-2">{r.is_active ? "Yes" : "No"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => { setEditing(r); setOpen(true); }} className="text-xs inline-flex items-center gap-1 px-2 py-1">
                    <Pencil className="size-3" /> Edit
                  </button>
                  {r.is_active && (
                    <button onClick={() => del.mutate(r.id)} className="text-xs inline-flex items-center gap-1 px-2 py-1 text-rose-600">
                      <Trash2 className="size-3" /> Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No reasons yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
      {open && <ReasonDialog table={table} side={side} initial={editing} onClose={() => setOpen(false)} />}
    </SectionCard>
  );
}

function parseErrorMessage(e: unknown): string {
  if (!(e instanceof Error)) return "Failed to save reason";
  const msg = e.message;
  if (msg.startsWith("[") || msg.startsWith("{")) {
    try {
      const parsed = JSON.parse(msg);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        if (first?.message) {
          const field = Array.isArray(first.path) && first.path.length ? `${first.path.join(".")}: ` : "";
          return `${field}${first.message}`;
        }
      } else if (parsed && typeof parsed === "object" && (parsed as any).message) {
        return (parsed as any).message;
      }
    } catch {
      // Fallback
    }
  }
  return msg;
}

function slugifyCode(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

function ReasonDialog({ table, side, initial, onClose }: { table: Table; side?: "customer" | "internal"; initial: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(upsertReason);
  const [code, setCode] = useState(initial?.code ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 100);
  const [isActive, setIsActive] = useState<boolean>(initial?.is_active ?? true);
  const [isCodeEdited, setIsCodeEdited] = useState(!!initial);

  const handleLabelChange = (val: string) => {
    setLabel(val);
    if (!initial && !isCodeEdited) {
      setCode(slugifyCode(val).replace(/^_+|_+$/g, ""));
    }
  };

  const handleCodeChange = (val: string) => {
    setIsCodeEdited(true);
    setCode(slugifyCode(val));
  };

  const mut = useMutation({
    mutationFn: () => {
      const sanitizedCode = slugifyCode(code || label).replace(/^_+|_+$/g, "");
      return fn({
        data: {
          table,
          id: initial?.id,
          code: sanitizedCode,
          label,
          description: description || null,
          side,
          emailTemplateCode: side === "customer" ? "bhs_e003_customer_delay" : "bhs_e004_our_side_delay",
          sortOrder,
          isActive,
        },
      });
    },
    onSuccess: () => {
      toast.success("Reason saved successfully");
      qc.invalidateQueries({ queryKey: ["reason-library", table] });
      onClose();
    },
    onError: (e) => toast.error(parseErrorMessage(e)),
  });

  const effectiveCode = slugifyCode(code || label).replace(/^_+|_+$/g, "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{initial ? "Edit reason" : "New reason"}</div>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <Labeled label="Label">
            <input
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Invalid PAN Card Details"
              className="w-full rounded-md border bg-background px-2 py-1.5"
            />
          </Labeled>
          <Labeled label="Code (lowercase, digits, underscore only)">
            <input
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              disabled={!!initial}
              placeholder="e.g. invalid_pan_card"
              className="w-full rounded-md border bg-background px-2 py-1.5 disabled:opacity-60 font-mono text-xs"
            />
            {effectiveCode && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Code key: <code className="font-mono text-primary font-medium">{effectiveCode}</code>
              </p>
            )}
          </Labeled>
          <Labeled label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-md border bg-background px-2 py-1.5" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Sort order">
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} className="w-full rounded-md border bg-background px-2 py-1.5" />
            </Labeled>
            <Labeled label="Active">
              <select value={isActive ? "y" : "n"} onChange={(e) => setIsActive(e.target.value === "y")} className="w-full rounded-md border bg-background px-2 py-1.5">
                <option value="y">Yes</option>
                <option value="n">No</option>
              </select>
            </Labeled>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !label.trim() || !effectiveCode}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground inline-flex items-center gap-2 disabled:opacity-50"
          >
            {mut.isPending && <Loader2 className="size-3 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
