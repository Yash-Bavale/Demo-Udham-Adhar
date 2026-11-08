import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Save, Star, StarOff, Trash2 } from "lucide-react";
import { listSavedFilters, createSavedFilter, updateSavedFilter, deleteSavedFilter, type FilterJson } from "@/lib/crm/saved-filters.functions";

export function SavedFiltersMenu({
  currentFilter,
  onApply,
}: {
  currentFilter: FilterJson;
  onApply: (f: FilterJson) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSavedFilters);
  const createFn = useServerFn(createSavedFilter);
  const updateFn = useServerFn(updateSavedFilter);
  const deleteFn = useServerFn(deleteSavedFilter);

  const { data } = useQuery({ queryKey: ["admin.savedFilters"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin.savedFilters"] });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-[var(--admin-surface-2)]"
        style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
      >
        <Bookmark className="size-4" /> Saved views
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 z-30 w-72 rounded-lg border shadow-lg p-2"
          style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
        >
          <div className="max-h-60 overflow-y-auto">
            {(data?.rows ?? []).length === 0 ? (
              <div className="px-3 py-4 text-xs" style={{ color: "var(--admin-fg-muted)" }}>No saved views yet.</div>
            ) : (
              (data?.rows ?? []).map((v) => (
                <div key={v.id} className="flex items-center gap-1 group hover:bg-[var(--admin-surface-2)] rounded">
                  <button
                    onClick={() => { onApply(v.filter_json as FilterJson); setOpen(false); }}
                    className="flex-1 text-left px-3 py-1.5 text-sm truncate"
                    style={{ color: "var(--admin-fg)" }}
                  >
                    {v.is_default && <span className="text-amber-500 mr-1">★</span>}{v.name}
                  </button>
                  <button
                    title={v.is_default ? "Unset default" : "Set default"}
                    onClick={async () => { await updateFn({ data: { id: v.id, is_default: !v.is_default } }); refresh(); }}
                    className="p-1 opacity-0 group-hover:opacity-100"
                  >
                    {v.is_default ? <StarOff className="size-3.5" /> : <Star className="size-3.5" />}
                  </button>
                  <button
                    title="Delete"
                    onClick={async () => { if (confirm(`Delete view "${v.name}"?`)) { await deleteFn({ data: { id: v.id } }); refresh(); } }}
                    className="p-1 opacity-0 group-hover:opacity-100 text-rose-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="border-t pt-2 mt-2 flex gap-1" style={{ borderColor: "var(--admin-border)" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Save current as…"
              className="flex-1 rounded border px-2 py-1 text-sm"
              style={{ background: "var(--admin-surface-2)", borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
            />
            <button
              disabled={!name.trim()}
              onClick={async () => {
                await createFn({ data: { name: name.trim(), filter_json: currentFilter } });
                setName(""); refresh();
              }}
              className="rounded px-2 py-1 text-sm text-white disabled:opacity-40 flex items-center gap-1"
              style={{ background: "var(--admin-accent)" }}
            >
              <Save className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
