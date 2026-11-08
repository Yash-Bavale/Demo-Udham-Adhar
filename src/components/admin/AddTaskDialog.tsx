import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Loader2 } from "lucide-react";
import {
  createTask,
  listStaffForAssignment,
  searchLeadOptions,
  searchOrderOptions,
} from "@/lib/crm/tasks.functions";

type Props = {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  defaultLeadId?: string | null;
  defaultApplicationId?: string | null;
  triggerLabel?: string;
  triggerClassName?: string;
  onCreated?: () => void;
};

type FieldErrors = Partial<Record<"title" | "dueAt" | "leadId", string>>;

export function AddTaskDialog({
  open: controlled,
  onOpenChange,
  defaultLeadId = null,
  defaultApplicationId = null,
  triggerLabel = "Add Task",
  triggerClassName,
  onCreated,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (controlled === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };

  return (
    <>
      {controlled === undefined && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            triggerClassName ??
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
          }
          style={{
            background: "var(--admin-accent)",
            color: "var(--admin-accent-fg)",
          }}
        >
          <Plus className="size-3.5" />
          {triggerLabel}
        </button>
      )}
      {open && (
        <DialogBody
          onClose={() => setOpen(false)}
          defaultLeadId={defaultLeadId}
          defaultApplicationId={defaultApplicationId}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

function DialogBody({
  onClose,
  defaultLeadId,
  defaultApplicationId,
  onCreated,
}: {
  onClose: () => void;
  defaultLeadId: string | null;
  defaultApplicationId: string | null;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createTask);
  const staffFn = useServerFn(listStaffForAssignment);
  const leadFn = useServerFn(searchLeadOptions);
  const orderFn = useServerFn(searchOrderOptions);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>(defaultDue());
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [leadQuery, setLeadQuery] = useState("");
  const [leadId, setLeadId] = useState<string | null>(defaultLeadId);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderId, setOrderId] = useState<string | null>(defaultApplicationId);
  const [errors, setErrors] = useState<FieldErrors>({});

  const { data: staffData } = useQuery({
    queryKey: ["staff-assign"],
    queryFn: () => staffFn(),
    staleTime: 60_000,
  });
  const { data: leadOpts } = useQuery({
    queryKey: ["task-lead-search", leadQuery],
    queryFn: () => leadFn({ data: { q: leadQuery } }),
  });
  const { data: orderOpts } = useQuery({
    queryKey: ["task-order-search", orderQuery, leadId],
    queryFn: () => orderFn({ data: { q: orderQuery, leadId: leadId ?? undefined } }),
  });

  const selectedLead = useMemo(
    () => leadOpts?.rows.find((r: any) => r.id === leadId) ?? null,
    [leadOpts, leadId]
  );
  const selectedOrder = useMemo(
    () => orderOpts?.rows.find((r: any) => r.id === orderId) ?? null,
    [orderOpts, orderId]
  );

  const mut = useMutation({
    mutationFn: async () => {
      return createFn({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          assignedTo: assignedTo || null,
          dueAt: new Date(dueAt).toISOString(),
          priority,
          leadId: leadId ?? null,
          applicationId: orderId ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Task created");
      qc.invalidateQueries({ queryKey: ["tasks-board"] });
      onCreated?.();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create task"),
  });

  function validate(): boolean {
    const errs: FieldErrors = {};
    if (title.trim().length < 2) errs.title = "Title is required (min 2 chars).";
    if (!dueAt) errs.dueAt = "Due date is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border shadow-lg"
        style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <h3 className="text-sm font-medium" style={{ color: "var(--admin-fg)" }}>
            New Task
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--admin-surface-2)]">
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4 text-sm">
          <Field label="Title" error={errors.title} required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border bg-transparent px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
              placeholder="Call back to confirm details"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded border bg-transparent px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign To">
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded border bg-transparent px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
              >
                <option value="">Unassigned</option>
                {(staffData?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded border bg-transparent px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
          </div>

          <Field label="Due Date & Time" error={errors.dueAt} required>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full rounded border bg-transparent px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
            />
          </Field>

          <Field label="Link to Lead (optional)">
            {selectedLead ? (
              <Chip
                label={`${(selectedLead as any).lead_code} — ${(selectedLead as any).name ?? "—"}`}
                onClear={() => {
                  setLeadId(null);
                  setOrderId(null);
                }}
              />
            ) : (
              <Combo
                value={leadQuery}
                onChange={setLeadQuery}
                placeholder="Search by name, mobile, or lead code"
                options={(leadOpts?.rows ?? []).map((r: any) => ({
                  id: r.id,
                  label: `${r.lead_code} — ${r.name ?? "—"}`,
                  sub: [r.mobile, r.service].filter(Boolean).join(" · "),
                }))}
                onPick={(id) => {
                  setLeadId(id);
                  setOrderId(null);
                }}
              />
            )}
          </Field>

          <Field label="Link to Order (optional)">
            {selectedOrder ? (
              <Chip
                label={`${(selectedOrder as any).application_code} — ${(selectedOrder as any).service_name ?? "—"}`}
                onClear={() => setOrderId(null)}
              />
            ) : (
              <Combo
                value={orderQuery}
                onChange={setOrderQuery}
                placeholder="Search by order code"
                options={(orderOpts?.rows ?? []).map((r: any) => ({
                  id: r.id,
                  label: `${r.application_code} — ${r.service_name ?? "—"}`,
                  sub: r.fulfillment_status,
                }))}
                onPick={(id) => setOrderId(id)}
              />
            )}
          </Field>
        </div>

        <footer
          className="flex items-center justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs font-medium"
            style={{ color: "var(--admin-fg-muted)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mut.isPending}
            onClick={() => {
              if (validate()) mut.mutate();
            }}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--admin-accent)", color: "var(--admin-accent-fg)" }}
          >
            {mut.isPending && <Loader2 className="size-3 animate-spin" />}
            Create Task
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span
        className="text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--admin-fg-muted)" }}
      >
        {label}
        {required && <span style={{ color: "var(--admin-danger)" }}> *</span>}
      </span>
      {children}
      {error && (
        <span className="block text-[11px]" style={{ color: "var(--admin-danger)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div
      className="flex items-center justify-between rounded border px-2.5 py-1.5 text-xs"
      style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }}
    >
      <span style={{ color: "var(--admin-fg)" }}>{label}</span>
      <button
        type="button"
        onClick={onClear}
        className="rounded p-0.5 hover:bg-[var(--admin-surface)]"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function Combo({
  value,
  onChange,
  placeholder,
  options,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { id: string; label: string; sub?: string }[];
  onPick: (id: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className="w-full rounded border bg-transparent px-2.5 py-1.5 text-sm"
        style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
      />
      {focused && options.length > 0 && (
        <div
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border shadow-lg"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(o.id);
                onChange("");
              }}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--admin-surface-2)]"
            >
              <div style={{ color: "var(--admin-fg)" }}>{o.label}</div>
              {o.sub && (
                <div className="text-[10px]" style={{ color: "var(--admin-fg-muted)" }}>
                  {o.sub}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function defaultDue(): string {
  const d = new Date();
  d.setHours(d.getHours() + 24, 0, 0, 0);
  // datetime-local needs YYYY-MM-DDTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
