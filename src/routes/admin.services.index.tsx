import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState, useEffect } from "react";
import { ExternalLink, Eye, FileText, Settings2, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import { listServices, upsertService, deleteService } from "@/lib/crm/services-admin.functions";
import { listWebsiteTree } from "@/lib/crm/websites-admin.functions";
import { getBuilderSchema } from "@/lib/crm/form-builder.functions";
import { fromBase, fromTotal } from "@/lib/pricing/gst";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/services/")({ component: ServicesPage });

type ServiceForm = {
  id?: string;
  service_code: string;
  service_name: string;
  description?: string | null;
  base_amount: number;
  gst_amount: number;
  total_amount: number;
  is_active: boolean;
  sort_order: number;
  govt_portal_url?: string | null;
  website_id?: string;
  category_id?: string | null;
  expected_processing_days?: number | null;
  journey_key?: string | null;
};

function emptyForm(): ServiceForm {
  return { service_code: "", service_name: "", base_amount: 0, gst_amount: 0, total_amount: 0, is_active: true, sort_order: 0, govt_portal_url: "", category_id: null, expected_processing_days: null, journey_key: "default" };
}

function ServicesPage() {
  const listFn = useServerFn(listServices);
  const treeFn = useServerFn(listWebsiteTree);
  const upsertFn = useServerFn(upsertService);
  const delFn = useServerFn(deleteService);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin.services"], queryFn: () => listFn() });
  const { data: tree } = useQuery({ queryKey: ["admin.websites.tree"], queryFn: () => treeFn() });

  const [form, setForm] = useState<ServiceForm | null>(null);
  const [tab, setTab] = useState<string>("");
  const [previewTarget, setPreviewTarget] = useState<{ code: string; name: string } | null>(null);

  const websites = tree?.websites ?? [];
  const categories = tree?.categories ?? [];
  const websiteById = useMemo(() => Object.fromEntries(websites.map((w) => [w.id, w])), [websites]);
  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const categoriesForForm = useMemo(
    () => categories.filter((c) => c.website_id === form?.website_id),
    [categories, form?.website_id],
  );

  const allRows = data?.rows ?? [];
  const activeTab = tab || websites[0]?.id || "__all__";
  const unassignedCount = allRows.filter((s) => !s.website_id).length;

  const tabs = useMemo(
    () => [
      ...websites.map((w) => ({
        key: w.id,
        label: w.name,
        sub: w.domain,
        count: allRows.filter((s) => s.website_id === w.id).length,
      })),
      ...(unassignedCount > 0
        ? [{ key: "__none__", label: "Unassigned", sub: "no website", count: unassignedCount }]
        : []),
      { key: "__all__", label: "All websites", sub: "", count: allRows.length },
    ],
    [websites, allRows, unassignedCount],
  );

  const visibleRows = useMemo(() => {
    if (activeTab === "__all__") return allRows;
    if (activeTab === "__none__") return allRows.filter((s) => !s.website_id);
    return allRows.filter((s) => s.website_id === activeTab);
  }, [allRows, activeTab]);

  // Group visible rows by category (Uncategorised last)
  const groups = useMemo(() => {
    const map = new Map<string, typeof visibleRows>();
    for (const s of visibleRows) {
      const key = s.category_id ?? "__uncat__";
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    const entries = [...map.entries()].map(([key, rows]) => ({
      key,
      label: key === "__uncat__" ? "Uncategorised" : (categoryById[key]?.name ?? "Uncategorised"),
      rows: [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));
    entries.sort((a, b) =>
      a.key === "__uncat__" ? 1 : b.key === "__uncat__" ? -1 : a.label.localeCompare(b.label),
    );
    return entries;
  }, [visibleRows, categoryById]);

  const colCount = 7;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Services</h1>
        <button
          onClick={() =>
            setForm({
              ...emptyForm(),
              website_id:
                activeTab === "__all__" || activeTab === "__none__" ? websites[0]?.id : activeTab,
            })
          }
          className="rounded bg-slate-900 text-white px-3.5 py-2 text-sm font-medium hover:bg-slate-800 transition-colors shadow-xs"
        >
          + New Service
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const on = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg border px-3 py-1.5 text-left text-sm transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              <span className="font-medium">{t.label}</span>
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${on ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{t.count}</span>
              {t.sub && (
                <span className={`block text-[11px] ${on ? "text-white/70" : "text-slate-400"}`}>{t.sub}</span>
              )}
            </button>
          );
        })}
      </div>

      {form && (
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Input label="Service code" value={form.service_code} onChange={(v) => setForm({ ...form, service_code: v })} />
            <Input label="Service name" value={form.service_name} onChange={(v) => setForm({ ...form, service_name: v })} />
            <Select
              label="Website"
              value={form.website_id ?? ""}
              onChange={(v) => setForm({ ...form, website_id: v || undefined, category_id: null })}
              options={[{ value: "", label: "— select —" }, ...websites.map((w) => ({ value: w.id, label: `${w.name} (${w.domain})` }))]}
            />
            <Select
              label="Category (optional)"
              value={form.category_id ?? ""}
              onChange={(v) => setForm({ ...form, category_id: v || null })}
              options={[{ value: "", label: "— none —" }, ...categoriesForForm.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Input
              label="Total (₹ inclusive of 18% GST)"
              type="number"
              value={String(form.total_amount)}
              onChange={(v) => {
                const { base, gst, total } = fromTotal(Number(v));
                setForm({ ...form, total_amount: total, base_amount: base, gst_amount: gst });
              }}
            />
            <Input
              label="Base (₹) — auto from total"
              type="number"
              value={String(form.base_amount)}
              onChange={(v) => {
                const { base, gst, total } = fromBase(Number(v));
                setForm({ ...form, base_amount: base, gst_amount: gst, total_amount: total });
              }}
            />
            <Input label="GST 18% (₹) — auto" type="number" value={String(form.gst_amount)} onChange={() => {}} />
            <Input label="Govt Portal URL" value={form.govt_portal_url ?? ""} onChange={(v) => setForm({ ...form, govt_portal_url: v })} />
            <Input label="Sort order" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) })} />
            <Input
              label="Expected processing days"
              type="number"
              value={form.expected_processing_days == null ? "" : String(form.expected_processing_days)}
              onChange={(v) => setForm({ ...form, expected_processing_days: v === "" ? null : Number(v) })}
            />
            <Input
              label="Journey key"
              value={form.journey_key ?? "default"}
              onChange={(v) => setForm({ ...form, journey_key: v || "default" })}
            />
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await upsertFn({ data: form as never });
                  await qc.invalidateQueries({ queryKey: ["admin.services"] });
                  setForm(null);
                  toast.success("Service saved");
                } catch (e) {
                  toast.error("Save failed: " + (e as Error).message);
                }
              }}
              className="rounded bg-slate-900 text-white px-4 py-2 text-sm font-medium"
            >
              Save
            </button>
            <button onClick={() => setForm(null)} className="rounded border px-4 py-2 text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-x-auto shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase text-slate-500 border-b">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Name</th>
              <th className="px-3 py-2.5 text-right font-semibold">Base (₹)</th>
              <th className="px-3 py-2.5 text-right font-semibold">GST 18%</th>
              <th className="px-3 py-2.5 text-right font-semibold">Total (₹)</th>
              <th className="px-3 py-2.5 text-center font-semibold">Sort</th>
              <th className="px-3 py-2.5 text-center font-semibold">Active</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-slate-500">
                  <div className="inline-flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin text-slate-600" /> Loading services…
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && visibleRows.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-8 text-center text-slate-500">No services for this website yet.</td></tr>
            )}
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr className="bg-slate-100/60 border-t border-b">
                  <td colSpan={colCount} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {g.label} <span className="font-normal text-slate-400">({g.rows.length})</span>
                  </td>
                </tr>
                {g.rows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900">{s.service_name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {s.website_id && websiteById[s.website_id] && (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 font-medium">
                            {websiteById[s.website_id].domain}
                          </span>
                        )}
                        {s.category_id && categoryById[s.category_id] && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 font-medium">
                            {categoryById[s.category_id].name}
                          </span>
                        )}
                        {s.govt_portal_url && (
                          <a
                            href={s.govt_portal_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5"
                          >
                            <ExternalLink className="size-3" /> Govt Portal
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Inline Editable Base Amount with Edit & Confirm */}
                    <td className="px-3 py-2.5 text-right">
                      <InlineBasePriceCell
                        service={s as ServiceForm}
                        onSave={async (newBase) => {
                          const { base, gst, total } = fromBase(newBase);
                          try {
                            await upsertFn({ data: { ...(s as ServiceForm), base_amount: base, gst_amount: gst, total_amount: total } as never });
                            await qc.invalidateQueries({ queryKey: ["admin.services"] });
                            toast.success(`Updated base price to ₹${base.toFixed(2)} (Total: ₹${total.toFixed(2)})`);
                          } catch (err) {
                            toast.error((err as Error).message);
                            throw err;
                          }
                        }}
                      />
                    </td>

                    <td className="px-3 py-2.5 text-right text-slate-600 font-mono text-xs">
                      ₹{Number(s.gst_amount).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900 font-mono text-xs">
                      ₹{Number(s.total_amount).toFixed(2)}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        defaultValue={s.sort_order ?? 0}
                        onBlur={async (e) => {
                          const next = Number(e.target.value);
                          if (next === (s.sort_order ?? 0)) return;
                          try {
                            await upsertFn({ data: { ...(s as ServiceForm), sort_order: next } as never });
                            await qc.invalidateQueries({ queryKey: ["admin.services"] });
                            toast.success("Sort order updated");
                          } catch (err) { toast.error((err as Error).message); }
                        }}
                        className="w-14 rounded border border-slate-300 px-2 py-1 text-xs text-center font-medium"
                      />
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={async () => {
                          try {
                            await upsertFn({ data: { ...(s as ServiceForm), is_active: !s.is_active } as never });
                            await qc.invalidateQueries({ queryKey: ["admin.services"] });
                            toast.success(s.is_active ? "Service deactivated" : "Service activated");
                          } catch (e) { toast.error((e as Error).message); }
                        }}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${s.is_active ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"}`}
                        title={s.is_active ? "Click to deactivate" : "Click to activate"}
                      >
                        <span className={`size-1.5 rounded-full ${s.is_active ? "bg-emerald-600" : "bg-slate-400"}`} />
                        {s.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>

                    {/* Modern Action Buttons */}
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewTarget({ code: s.service_code, name: s.service_name })}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors shadow-2xs"
                          title="Preview customer application form"
                        >
                          <Eye className="size-3.5" /> Preview Form
                        </button>
                        <Link
                          to="/admin/services/forms/$serviceCode"
                          params={{ serviceCode: s.service_code }}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition-colors shadow-2xs"
                          title="Edit form fields & schema"
                        >
                          <FileText className="size-3.5" /> Edit Form
                        </Link>
                        <Link
                          to="/admin/services/$serviceCode"
                          params={{ serviceCode: s.service_code }}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors shadow-2xs"
                          title="Configure service settings"
                        >
                          <Settings2 className="size-3.5" /> Configure
                        </Link>
                        <button
                          type="button"
                          onClick={() => setForm(s as ServiceForm)}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors shadow-2xs"
                          title="Edit service details"
                        >
                          <Pencil className="size-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Delete service "${s.service_name}"?`)) return;
                            try {
                              await delFn({ data: { id: s.id } });
                              await qc.invalidateQueries({ queryKey: ["admin.services"] });
                              toast.success("Service deleted");
                            } catch (err) {
                              toast.error((err as Error).message);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition-colors shadow-2xs"
                          title="Delete service"
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Interactive Form Preview Modal */}
      {previewTarget && (
        <FormPreviewModal
          serviceCode={previewTarget.code}
          serviceName={previewTarget.name}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}

function FormPreviewModal({
  serviceCode,
  serviceName,
  onClose,
}: {
  serviceCode: string;
  serviceName: string;
  onClose: () => void;
}) {
  const getSchemaFn = useServerFn(getBuilderSchema);
  const { data, isLoading } = useQuery({
    queryKey: ["admin.services.form-builder", serviceCode],
    queryFn: () => getSchemaFn({ data: { service_code: serviceCode } }),
  });

  const activeRow = data?.active;
  // schema is nested: activeRow.schema.sections (builder format) or flat activeRow.schema.fields
  const rawSchema = (activeRow?.schema ?? {}) as {
    sections?: Array<{ key: string; label: string; description?: string; fields: any[] }>;
    fields?: any[];
  };
  const sections: Array<{ key: string; label: string; description?: string; fields: any[] }> =
    rawSchema.sections?.length
      ? rawSchema.sections
      : rawSchema.fields?.length
        ? [{ key: "default", label: "Details", fields: rawSchema.fields }]
        : [];
  const documents: Array<{ key: string; label: string; required?: boolean; help?: string }> =
    (activeRow?.documents as any[]) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="shrink-0 px-5 py-4 border-b bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center size-9 rounded-full bg-indigo-100 text-indigo-700 shrink-0">
              <Eye className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Form Preview — {serviceName}</DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-mono">
                Code: {serviceCode} ({sections.length} section{sections.length === 1 ? "" : "s"}, {documents.length} doc{documents.length === 1 ? "" : "s"})
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6 bg-slate-50/50">
          {isLoading ? (
            <div className="grid place-items-center h-48 text-sm text-slate-500">
              <Loader2 className="size-5 animate-spin text-indigo-600 mb-2" />
              Loading form schema preview…
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              No sections configured for this form.
            </div>
          ) : (
            <>
              {sections.map((sec, idx) => (
                <div key={sec.key || idx} className="rounded-xl border bg-white p-5 shadow-2xs space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                      <span className="grid place-items-center size-5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">
                        {idx + 1}
                      </span>
                      {sec.label}
                    </h3>
                    {sec.description && (
                      <p className="text-xs text-slate-500 mt-1">{sec.description}</p>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {sec.fields.map((f) => (
                      <div key={f.key} className={f.type === "textarea" || f.type === "nic" || f.type === "plants" ? "md:col-span-2" : ""}>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {f.label} {f.required && <span className="text-rose-500">*</span>}
                        </label>
                        {f.type === "select" ? (
                          <select disabled className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                            <option>{f.placeholder || "Select option…"}</option>
                            {f.options?.map((o: string) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : f.type === "textarea" ? (
                          <textarea
                            disabled
                            rows={2}
                            placeholder={f.placeholder || f.help || "Enter details…"}
                            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                          />
                        ) : (
                          <input
                            type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                            disabled
                            placeholder={f.placeholder || f.help || `Enter ${f.label.toLowerCase()}…`}
                            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                          />
                        )}
                        {f.help && <p className="text-[11px] text-slate-400 mt-0.5">{f.help}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {documents.length > 0 && (
                <div className="rounded-xl border bg-white p-5 shadow-2xs space-y-3">
                  <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2 border-b pb-2">
                    Required Documents ({documents.length})
                  </h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    {documents.map((d) => (
                      <div key={d.key} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 flex items-start gap-2 text-xs">
                        <FileText className="size-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-slate-900">
                            {d.label} {d.required && <span className="text-rose-500">*</span>}
                          </div>
                          {d.help && <div className="text-[11px] text-slate-500 mt-0.5">{d.help}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 px-5 py-3 border-t bg-slate-50 flex items-center justify-between">
          <Link
            to="/admin/services/forms/$serviceCode"
            params={{ serviceCode }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <Settings2 className="size-3.5" /> Edit this form in Builder →
          </Link>
          <Button variant="outline" size="sm" onClick={onClose}>Close Preview</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border px-3 py-2" />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border px-3 py-2 bg-white">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function InlineBasePriceCell({
  service,
  onSave,
}: {
  service: ServiceForm;
  onSave: (newBase: number) => Promise<void>;
}) {
  const currentBase = Number(service.base_amount ?? 0);
  const [value, setValue] = useState(String(currentBase));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(String(currentBase));
  }, [currentBase]);

  const numericValue = Number(value);
  const isChanged =
    !isNaN(numericValue) &&
    numericValue >= 0 &&
    numericValue !== currentBase;

  async function handleConfirm() {
    if (!isChanged || saving) return;
    setSaving(true);
    try {
      await onSave(numericValue);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(String(currentBase));
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <span className="text-xs text-slate-400 font-mono">₹</span>
      <div className="relative flex items-center gap-1">
        <input
          type="number"
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onWheel={(e) => (e.target as HTMLElement).blur()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleConfirm();
            } else if (e.key === "Escape") {
              handleCancel();
            }
          }}
          disabled={saving}
          className={`w-24 rounded border px-2 py-1 text-sm font-semibold text-right transition-colors focus:outline-none ${
            isChanged
              ? "border-amber-500 bg-amber-50/70 text-amber-900 focus:ring-2 focus:ring-amber-500/40"
              : "border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          }`}
          title="Type new Base Price — click Confirm or press Enter to save"
        />

        {isChanged && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs transition-colors disabled:opacity-50"
              title="Confirm price change"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3.5" />}
              Confirm
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
              title="Cancel changes"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
