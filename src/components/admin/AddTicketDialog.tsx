import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, MailCheck, MailX, Plus, X } from "lucide-react";
import { createTicket, searchCustomerOptions, checkOpenTicketForOrder } from "@/lib/crm/tickets.functions";
import { listStaffForAssignment, searchOrderOptions } from "@/lib/crm/tasks.functions";
import { Link } from "@tanstack/react-router";

type Props = {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  defaultCustomerId?: string | null;
  defaultCustomerLabel?: string | null;
  defaultApplicationId?: string | null;
  defaultApplicationLabel?: string | null;
  triggerLabel?: string;
  onCreated?: (ticketId: string) => void;
};

type FieldErrors = Partial<Record<"subject" | "customerId", string>>;

export function AddTicketDialog({
  open: controlled,
  onOpenChange,
  defaultCustomerId = null,
  defaultCustomerLabel = null,
  defaultApplicationId = null,
  defaultApplicationLabel = null,
  triggerLabel = "New Ticket",
  onCreated,
}: Props) {
  const [internal, setInternal] = useState(false);
  const open = controlled ?? internal;
  const setOpen = (v: boolean) => {
    if (controlled === undefined) setInternal(v);
    onOpenChange?.(v);
  };

  return (
    <>
      {controlled === undefined && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: "var(--admin-accent)", color: "var(--admin-accent-fg)" }}
        >
          <Plus className="size-3.5" />
          {triggerLabel}
        </button>
      )}
      {open && (
        <Body
          onClose={() => setOpen(false)}
          defaultCustomerId={defaultCustomerId}
          defaultCustomerLabel={defaultCustomerLabel}
          defaultApplicationId={defaultApplicationId}
          defaultApplicationLabel={defaultApplicationLabel}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

function Body({
  onClose,
  defaultCustomerId,
  defaultCustomerLabel,
  defaultApplicationId,
  defaultApplicationLabel,
  onCreated,
}: {
  onClose: () => void;
  defaultCustomerId: string | null;
  defaultCustomerLabel: string | null;
  defaultApplicationId: string | null;
  defaultApplicationLabel: string | null;
  onCreated?: (ticketId: string) => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createTicket);
  const custFn = useServerFn(searchCustomerOptions);
  const orderFn = useServerFn(searchOrderOptions);
  const staffFn = useServerFn(listStaffForAssignment);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"urgent" | "high" | "medium" | "low">("medium");
  const [category, setCategory] = useState<"technical" | "order_related" | "suggestion_to_owner">(
    defaultApplicationId ? "order_related" : "technical",
  );
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(defaultCustomerId);
  const [customerLabel, setCustomerLabel] = useState<string | null>(defaultCustomerLabel);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [custQ, setCustQ] = useState("");
  const [orderId, setOrderId] = useState<string | null>(defaultApplicationId);
  const [orderLabel, setOrderLabel] = useState<string | null>(defaultApplicationLabel);
  const [orderQ, setOrderQ] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const checkDupFn = useServerFn(checkOpenTicketForOrder);
  const { data: existingOpen } = useQuery({
    queryKey: ["ticket-dup", orderId],
    queryFn: () => checkDupFn({ data: { applicationId: orderId! } }),
    enabled: !!orderId,
  });

  const { data: staffData } = useQuery({
    queryKey: ["staff-assign"],
    queryFn: () => staffFn(),
    staleTime: 60_000,
  });
  const { data: custOpts } = useQuery({
    queryKey: ["ticket-cust", custQ],
    queryFn: () => custFn({ data: { q: custQ } }),
    enabled: !customerId,
  });
  const { data: orderOpts } = useQuery({
    queryKey: ["ticket-order", orderQ],
    queryFn: () => orderFn({ data: { q: orderQ } }),
    enabled: !orderId,
  });

  const mut = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          subject: subject.trim(),
          description: description.trim() || undefined,
          priority,
          assignedTo: assignedTo || null,
          customerId: customerId!,
          applicationId: orderId,
          allowDuplicate,
          category,
          attachmentUrl: attachmentUrl.trim() || null,
        },
      }),
    onSuccess: (res: any) => {
      if (res?.reused) {
        toast.success(`Reusing existing open ticket ${res.ticket_number}`);
      } else {
        toast.success(`Ticket ${res.ticket_number} created`);
      }
      qc.invalidateQueries({ queryKey: ["tickets-list"] });
      onCreated?.(res.id);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create ticket"),
  });


  function validate() {
    const errs: FieldErrors = {};
    if (subject.trim().length < 3) errs.subject = "Subject is required (min 3 chars).";
    if (!customerId) errs.customerId = "Customer is required.";
    else if (!customerEmail)
      errs.customerId = "This customer has no email on file. Add an email to the customer profile first.";
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
            New Support Ticket
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--admin-surface-2)]">
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4 text-sm">
          <Field label="Customer" required error={errors.customerId}>
            {customerId && customerLabel ? (
              <Chip
                label={customerLabel}
                onClear={() => {
                  setCustomerId(null);
                  setCustomerLabel(null);
                  setCustomerEmail(null);
                  setOrderId(null);
                  setOrderLabel(null);
                }}
              />
            ) : (
              <Combo
                value={custQ}
                onChange={setCustQ}
                placeholder="Search by name, mobile, email"
                options={(custOpts?.rows ?? []).map((r: any) => ({
                  id: r.id,
                  label: `${r.customer_code ?? ""} — ${r.name ?? "—"}`,
                  sub: [r.primary_mobile, r.primary_email].filter(Boolean).join(" · "),
                  meta: { email: r.primary_email ?? null },
                }))}
                onPick={(id, label, meta) => {
                  setCustomerId(id);
                  setCustomerLabel(label);
                  setCustomerEmail((meta?.email ?? null) as string | null);
                }}
              />
            )}
          </Field>

          {/* Locked ticket recipient — the customer's registered email */}
          {customerId && (
            <div
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
              style={{
                borderColor: customerEmail ? "var(--admin-border)" : "rgba(220,38,38,0.4)",
                background: customerEmail ? "var(--admin-surface-2)" : "rgba(220,38,38,0.06)",
                color: customerEmail ? "var(--admin-fg)" : "#b91c1c",
              }}
            >
              {customerEmail ? (
                <MailCheck className="size-3.5" style={{ color: "#15803d" }} />
              ) : (
                <MailX className="size-3.5" />
              )}
              <span className="flex-1">
                <span className="mr-1 uppercase tracking-wide text-[10px]" style={{ color: "var(--admin-fg-muted)" }}>
                  Sends to
                </span>
                <span className="font-medium">
                  {customerEmail ?? "No email on file — please add one to the customer profile."}
                </span>
              </span>
              <Lock className="size-3" style={{ color: "var(--admin-fg-muted)" }} />
            </div>
          )}

          <Field label="Linked Order (optional)">
            {orderId && orderLabel ? (
              <Chip
                label={orderLabel}
                onClear={() => {
                  setOrderId(null);
                  setOrderLabel(null);
                }}
              />
            ) : (
              <Combo
                value={orderQ}
                onChange={setOrderQ}
                placeholder="Search by order code"
                options={(orderOpts?.rows ?? []).map((r: any) => ({
                  id: r.id,
                  label: `${r.application_code} — ${r.service_name ?? ""}`,
                  sub: r.fulfillment_status,
                }))}
                onPick={(id, label) => {
                  setOrderId(id);
                  setOrderLabel(label);
                }}
              />
            )}
          </Field>

          {orderId && existingOpen && (
            <div
              className="rounded-md border p-2.5 text-xs"
              style={{
                borderColor: "rgba(217,119,6,0.4)",
                background: "rgba(217,119,6,0.06)",
                color: "#92400e",
              }}
            >
              <div className="font-medium">
                Open ticket already exists for this order
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Link
                  to="/admin/tickets/$ticketId"
                  params={{ ticketId: (existingOpen as any).id }}
                  onClick={onClose}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium underline"
                  style={{ color: "#b45309" }}
                >
                  {(existingOpen as any).ticket_number} · {(existingOpen as any).subject}
                </Link>
              </div>
              <label className="mt-2 flex items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(e) => setAllowDuplicate(e.target.checked)}
                />
                Create additional ticket anyway (audited)
              </label>
            </div>
          )}


          <Field label="Subject" required error={errors.subject}>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded border bg-transparent px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
              placeholder="Brief summary of the issue"
            />
          </Field>

          <Field label="Category" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="w-full rounded border bg-transparent px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
            >
              <option value="technical">Technical work related help</option>
              <option value="order_related">Order related help</option>
              <option value="suggestion_to_owner">Suggestion / other help to owner</option>
            </select>
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border bg-transparent px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
              placeholder="Describe the problem in detail"
            />
          </Field>

          <Field label="Image / Attachment URL (optional)">
            <input
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              className="w-full rounded border bg-transparent px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
              placeholder="https://…"
              type="url"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded border bg-transparent px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
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
          </div>
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
            disabled={mut.isPending || (!!existingOpen && !allowDuplicate)}
            onClick={() => {
              if (validate()) mut.mutate();
            }}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--admin-accent)", color: "var(--admin-accent-fg)" }}
          >
            {mut.isPending && <Loader2 className="size-3 animate-spin" />}
            {existingOpen && !allowDuplicate ? "Open existing ticket instead" : "Create Ticket"}
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
  options: { id: string; label: string; sub?: string; meta?: Record<string, unknown> }[];
  onPick: (id: string, label: string, meta?: Record<string, unknown>) => void;
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
                onPick(o.id, o.label, o.meta);
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
