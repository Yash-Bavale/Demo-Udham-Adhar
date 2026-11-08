import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  listCannedResponses,
  createCannedResponse,
  updateCannedResponse,
  deleteCannedResponse,
  type CannedResponse,
} from "@/lib/tickets/canned-responses.functions";
import { SectionCard } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/canned-responses")({
  head: () => ({
    meta: [
      { title: "Canned Responses — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CannedResponsesPage,
});

function CannedResponsesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCannedResponses);
  const createFn = useServerFn(createCannedResponse);
  const updateFn = useServerFn(updateCannedResponse);
  const deleteFn = useServerFn(deleteCannedResponse);

  const { data, isLoading } = useQuery({
    queryKey: ["canned-responses", "all"],
    queryFn: () => listFn({ data: { activeOnly: false } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["canned-responses"] });

  const createMut = useMutation({
    mutationFn: (payload: { title: string; body: string; category?: string }) =>
      createFn({ data: { ...payload, sort_order: 0, is_active: true } }),
    onSuccess: () => {
      toast.success("Canned response added");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--admin-fg)" }}>
          Canned Responses
        </h1>
        <p className="text-xs" style={{ color: "var(--admin-fg-muted)" }}>
          Reusable reply snippets available on every ticket.
        </p>
      </div>

      <SectionCard title="Add new">
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="rounded border px-2 py-1.5 text-sm"
            style={{ background: "var(--admin-surface-2)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
            placeholder="Title (e.g. Payment received)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1.5 text-sm"
            style={{ background: "var(--admin-surface-2)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <button
            onClick={() => {
              if (!title.trim() || !body.trim()) return;
              createMut.mutate(
                { title: title.trim(), body: body.trim(), category: category.trim() || undefined },
                {
                  onSuccess: () => {
                    setTitle("");
                    setBody("");
                    setCategory("");
                  },
                }
              );
            }}
            disabled={createMut.isPending || !title.trim() || !body.trim()}
            className="inline-flex items-center justify-center gap-1 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--admin-accent)", color: "var(--admin-accent-fg)" }}
          >
            {createMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Add
          </button>
        </div>
        <textarea
          rows={4}
          className="mt-2 w-full rounded border px-2 py-1.5 text-sm"
          style={{ background: "var(--admin-surface-2)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
          placeholder="Body — this is the reply text staff can insert."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </SectionCard>

      <SectionCard title={`All (${data?.length ?? 0})`}>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            <Loader2 className="size-3 animate-spin" /> Loading…
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            No canned responses yet.
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((c) => (
              <Row key={c.id} row={c} onSaved={invalidate} updateFn={updateFn} deleteFn={deleteFn} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Row({
  row,
  onSaved,
  updateFn,
  deleteFn,
}: {
  row: CannedResponse;
  onSaved: () => void;
  updateFn: ReturnType<typeof useServerFn<typeof updateCannedResponse>>;
  deleteFn: ReturnType<typeof useServerFn<typeof deleteCannedResponse>>;
}) {
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [category, setCategory] = useState(row.category ?? "");
  const [active, setActive] = useState(row.is_active);

  const updateMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: { id: row.id, title, body, category: category || null, is_active: active },
      }),
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: row.id } }),
    onSuccess: () => {
      toast.success("Deleted");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded border p-3" style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }}>
      <div className="grid gap-2 md:grid-cols-3">
        <input
          className="rounded border px-2 py-1.5 text-sm md:col-span-2"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1.5 text-sm"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
        />
      </div>
      <textarea
        rows={3}
        className="mt-2 w-full rounded border px-2 py-1.5 text-sm"
        style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--admin-fg-muted)" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            style={{ borderColor: "var(--admin-border)", color: "#b91c1c" }}
          >
            <Trash2 className="size-3" /> Delete
          </button>
          <button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending}
            className="rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--admin-accent)", color: "var(--admin-accent-fg)" }}
          >
            {updateMut.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
