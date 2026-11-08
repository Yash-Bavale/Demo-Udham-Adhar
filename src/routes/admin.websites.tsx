import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Globe,
  Plus,
  Pencil,
  Trash2,
  FolderPlus,
  Folder,
  Briefcase,
  ExternalLink,
} from "lucide-react";
import {
  listWebsiteTree,
  upsertWebsite,
  deleteWebsite,
  upsertServiceCategory,
  deleteServiceCategory,
} from "@/lib/crm/websites-admin.functions";

export const Route = createFileRoute("/admin/websites")({ component: WebsitesPage });

type WebsiteForm = {
  id?: string;
  name: string;
  domain: string;
  description?: string | null;
  is_active: boolean;
  allow_admin: boolean;
  sort_order: number;
  contentful_space_id?: string | null;
  contentful_delivery_token_secret?: "CONTENTFUL_API_KEY" | "CONTENTFUL_API_KEY_1" | "CONTENTFUL_API_KEY_2" | null;
  sanity_project_id?: string | null;
  sanity_dataset?: string | null;
};
type CategoryForm = { id?: string; website_id: string; name: string; is_active: boolean; sort_order: number };

function emptyWebsite(): WebsiteForm {
  return {
    name: "",
    domain: "",
    description: "",
    is_active: true,
    allow_admin: true,
    sort_order: 0,
    contentful_space_id: "",
    contentful_delivery_token_secret: "CONTENTFUL_API_KEY",
    sanity_project_id: "",
    sanity_dataset: "",
  };
}


function emptyCategory(website_id: string): CategoryForm {
  return { website_id, name: "", is_active: true, sort_order: 0 };
}

function WebsitesPage() {
  const listFn = useServerFn(listWebsiteTree);
  const upsertWebFn = useServerFn(upsertWebsite);
  const delWebFn = useServerFn(deleteWebsite);
  const upsertCatFn = useServerFn(upsertServiceCategory);
  const delCatFn = useServerFn(deleteServiceCategory);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.websites.tree"],
    queryFn: () => listFn(),
  });

  const [webForm, setWebForm] = useState<WebsiteForm | null>(null);
  const [catForm, setCatForm] = useState<CategoryForm | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const websites = data?.websites ?? [];
  const categories = data?.categories ?? [];
  const services = data?.services ?? [];

  const byWebsite = useMemo(() => {
    const m: Record<string, { categories: typeof categories; unassigned: typeof services; svcByCat: Record<string, typeof services> }> = {};
    for (const w of websites) {
      m[w.id] = { categories: [], unassigned: [], svcByCat: {} };
    }
    for (const c of categories) {
      m[c.website_id]?.categories.push(c);
      if (m[c.website_id]) m[c.website_id].svcByCat[c.id] = [];
    }
    for (const s of services) {
      const bucket = m[s.website_id];
      if (!bucket) continue;
      if (s.category_id && bucket.svcByCat[s.category_id]) bucket.svcByCat[s.category_id].push(s);
      else bucket.unassigned.push(s);
    }
    return m;
  }, [websites, categories, services]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["admin.websites.tree"] });
    await qc.invalidateQueries({ queryKey: ["admin.services"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Globe className="size-6" /> Websites</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage domains, service categories, and the services under each.</p>
        </div>
        <button
          onClick={() => setWebForm(emptyWebsite())}
          className="inline-flex items-center gap-1.5 rounded bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
        >
          <Plus className="size-4" /> New Website
        </button>
      </div>

      {webForm && (
        <FormCard title={webForm.id ? "Edit website" : "Add website"} onCancel={() => setWebForm(null)}>
          <div className="grid md:grid-cols-2 gap-3">
            <Input label="Name" value={webForm.name} onChange={(v) => setWebForm({ ...webForm, name: v })} placeholder="Udyam Adhar" />
            <Input label="Domain (no https://, no www.)" value={webForm.domain} onChange={(v) => setWebForm({ ...webForm, domain: v })} placeholder="example.in" />
            <Input label="Sort order" type="number" value={String(webForm.sort_order)} onChange={(v) => setWebForm({ ...webForm, sort_order: Number(v) || 0 })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={webForm.is_active} onChange={(e) => setWebForm({ ...webForm, is_active: e.target.checked })} />
              Active
            </label>
            <label className="flex items-start gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={webForm.allow_admin}
                onChange={(e) => setWebForm({ ...webForm, allow_admin: e.target.checked })}
              />
              <span>
                Allow staff panel on this domain
                <span className="block text-xs text-slate-500">
                  Off = /admin and /admin-login return 404 on this domain. Keep it off for
                  public-facing brand sites.
                </span>
              </span>
            </label>
            <label className="block text-sm md:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Description (optional)</div>
              <textarea
                value={webForm.description ?? ""}
                onChange={(e) => setWebForm({ ...webForm, description: e.target.value })}
                rows={2}
                placeholder="Short internal note about this website"
                className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </label>

            <div className="md:col-span-2 border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Contentful (per-site CMS)
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Input
                  label="Contentful Space ID"
                  value={webForm.contentful_space_id ?? ""}
                  onChange={(v) => setWebForm({ ...webForm, contentful_space_id: v })}
                  placeholder="Leave blank to use the project default"
                />
                <label className="block text-sm">
                  <div className="text-xs text-slate-500 mb-1">Delivery token secret</div>
                  <select
                    value={webForm.contentful_delivery_token_secret ?? "CONTENTFUL_API_KEY"}
                    onChange={(e) =>
                      setWebForm({
                        ...webForm,
                        contentful_delivery_token_secret: e.target.value as WebsiteForm["contentful_delivery_token_secret"],
                      })
                    }
                    className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="CONTENTFUL_API_KEY">CONTENTFUL_API_KEY (default connection)</option>
                    <option value="CONTENTFUL_API_KEY_1">CONTENTFUL_API_KEY_1 (second connection)</option>
                    <option value="CONTENTFUL_API_KEY_2">CONTENTFUL_API_KEY_2 (third connection)</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="md:col-span-2 border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Sanity (live CMS)
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Input
                  label="Sanity Project ID"
                  value={webForm.sanity_project_id ?? ""}
                  onChange={(v) => setWebForm({ ...webForm, sanity_project_id: v })}
                  placeholder="519jq1ws"
                />
                <Input
                  label="Sanity Dataset"
                  value={webForm.sanity_dataset ?? ""}
                  onChange={(v) => setWebForm({ ...webForm, sanity_dataset: v })}
                  placeholder="production"
                />
              </div>
            </div>
          </div>



          <div className="flex gap-2 pt-2">
            <button
              onClick={async () => {
                try {
                  await upsertWebFn({ data: webForm as never });
                  await refresh();
                  setWebForm(null);
                } catch (e) { alert((e as Error).message); }
              }}
              className="rounded bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
            >Save</button>
            <button onClick={() => setWebForm(null)} className="rounded border px-4 py-2 text-sm">Cancel</button>
          </div>
        </FormCard>
      )}

      {catForm && (
        <FormCard title={catForm.id ? "Edit category" : "Add category"} onCancel={() => setCatForm(null)}>
          <div className="grid md:grid-cols-2 gap-3">
            <Input label="Category name" value={catForm.name} onChange={(v) => setCatForm({ ...catForm, name: v })} placeholder="Udyam / GST / FSSAI…" />
            <Input label="Sort order" type="number" value={String(catForm.sort_order)} onChange={(v) => setCatForm({ ...catForm, sort_order: Number(v) || 0 })} />
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" checked={catForm.is_active} onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={async () => {
                try {
                  await upsertCatFn({ data: catForm as never });
                  await refresh();
                  setCatForm(null);
                } catch (e) { alert((e as Error).message); }
              }}
              className="rounded bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
            >Save</button>
            <button onClick={() => setCatForm(null)} className="rounded border px-4 py-2 text-sm">Cancel</button>
          </div>
        </FormCard>
      )}

      {isLoading && <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500">Loading…</div>}

      {!isLoading && websites.length === 0 && (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-slate-500">
          No websites yet. Click <span className="font-medium">+ New Website</span> to add one.
        </div>
      )}

      <div className="space-y-2">
        {websites.map((w) => {
          const bucket = byWebsite[w.id];
          const isOpen = expanded[w.id] ?? true;
          const totalServices = (bucket?.unassigned.length ?? 0) + Object.values(bucket?.svcByCat ?? {}).reduce((a, b) => a + b.length, 0);
          return (
            <div key={w.id} className="rounded-lg border bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [w.id]: !isOpen }))}
                  className="p-1 hover:bg-slate-200 rounded"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <Globe className="size-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{w.name}</span>
                    <a
                      href={`https://${w.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5"
                    >
                      {w.domain} <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <div className="text-xs text-slate-500">
                    {bucket?.categories.length ?? 0} categories · {totalServices} services
                  </div>
                </div>
                <StatusPill active={w.is_active} />
                <button
                  onClick={() => setCatForm(emptyCategory(w.id))}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-white"
                  title="Add category"
                >
                  <FolderPlus className="size-3.5" /> Category
                </button>
                <Link
                  to="/admin/website-content/$websiteId"
                  params={{ websiteId: w.id }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-200"
                  title="Edit site content (nav, footer, homepage)"
                >
                  Content
                </Link>
                <button

                  onClick={() => setWebForm({ id: w.id, name: w.name, domain: w.domain, description: (w as any).description ?? "", is_active: w.is_active, allow_admin: (w as any).allow_admin ?? true, sort_order: w.sort_order, contentful_space_id: (w as any).contentful_space_id ?? "", contentful_delivery_token_secret: (w as any).contentful_delivery_token_secret ?? "CONTENTFUL_API_KEY", sanity_project_id: (w as any).sanity_project_id ?? "", sanity_dataset: (w as any).sanity_dataset ?? "" })}
                  className="p-1.5 hover:bg-slate-200 rounded"
                  title="Edit website"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete website "${w.name}"? Only allowed when no services are attached.`)) return;
                    try {
                      await delWebFn({ data: { id: w.id } });
                      await refresh();
                    } catch (e) { alert((e as Error).message); }
                  }}
                  className="p-1.5 hover:bg-red-100 text-red-700 rounded"
                  title="Delete website"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {isOpen && (
                <div className="px-3 py-3 space-y-3">
                  {bucket?.categories.map((c) => (
                    <div key={c.id} className="rounded border">
                      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/60 border-b">
                        <Folder className="size-4 text-amber-500" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{c.name}</div>
                          <div className="text-[11px] text-slate-500">{bucket.svcByCat[c.id]?.length ?? 0} services</div>
                        </div>
                        <StatusPill active={c.is_active} />
                        <button
                          onClick={() => setCatForm({ id: c.id, website_id: c.website_id, name: c.name, is_active: c.is_active, sort_order: c.sort_order })}
                          className="p-1 hover:bg-slate-200 rounded"
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete category "${c.name}"? Services will be unlinked (not deleted).`)) return;
                            try {
                              await delCatFn({ data: { id: c.id } });
                              await refresh();
                            } catch (e) { alert((e as Error).message); }
                          }}
                          className="p-1 hover:bg-red-100 text-red-700 rounded"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <ServiceList services={bucket.svcByCat[c.id] ?? []} />
                    </div>
                  ))}

                  {(bucket?.unassigned.length ?? 0) > 0 && (
                    <div className="rounded border border-dashed">
                      <div className="px-3 py-2 bg-slate-50/40 border-b text-xs uppercase tracking-wide text-slate-500">
                        Uncategorised services
                      </div>
                      <ServiceList services={bucket?.unassigned ?? []} />
                    </div>
                  )}

                  {(bucket?.categories.length ?? 0) === 0 && (bucket?.unassigned.length ?? 0) === 0 && (
                    <div className="text-center text-sm text-slate-500 py-4">
                      No categories or services yet.{" "}
                      <Link to="/admin/services" className="text-indigo-600 hover:underline">Add a service →</Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ServiceList({ services }: { services: Array<{ id: string; service_code: string; service_name: string; is_active: boolean; total_amount: number }> }) {
  if (services.length === 0) {
    return <div className="px-3 py-3 text-xs text-slate-400 italic">No services in this category.</div>;
  }
  return (
    <ul className="divide-y">
      {services.map((s) => (
        <li key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
          <Briefcase className="size-3.5 text-slate-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{s.service_name}</div>
            <div className="text-[11px] text-slate-500 font-mono">{s.service_code}</div>
          </div>
          <div className="text-xs text-slate-600">₹{Number(s.total_amount).toFixed(0)}</div>
          <StatusPill active={s.is_active} />
          <Link
            to="/admin/services/$serviceCode"
            params={{ serviceCode: s.service_code }}
            className="text-xs text-emerald-700 hover:underline"
          >Configure</Link>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
        active
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : "bg-slate-100 text-slate-600 border-slate-200"
      }`}
    >
      <span className={`size-1.5 rounded-full ${active ? "bg-emerald-600" : "bg-slate-400"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function FormCard({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700">Close</button>
      </div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      />
    </label>
  );
}
