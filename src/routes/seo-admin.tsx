import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllSeoPages,
  upsertSeoPage,
  deleteSeoPage,
  checkIsAdmin,
  getSitemapPageManagerData,
  submitAllPagesToSitemap,
  type SeoPage,
  type SitemapPageItem,
} from "@/lib/seo-pages.functions";
import { CheckCircle2, ShieldAlert, Sparkles, Send, Globe, RefreshCw, Filter, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/seo-admin")({
  head: () => ({
    meta: [
      { title: "SEO Pages & Sitemap Manager — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SeoAdminPage,
});

type FormState = {
  id?: string;
  slug: string;
  label: string;
  enabled: boolean;
  sort_order: number;
};

const EMPTY: FormState = { slug: "", label: "", enabled: true, sort_order: 0 };

function SeoAdminPage() {
  const navigate = useNavigate();
  const list = useServerFn(listAllSeoPages);
  const getSitemapPages = useServerFn(getSitemapPageManagerData);
  const submitAllSitemap = useServerFn(submitAllPagesToSitemap);
  const upsert = useServerFn(upsertSeoPage);
  const remove = useServerFn(deleteSeoPage);
  const checkAdmin = useServerFn(checkIsAdmin);

  const [status, setStatus] = useState<"checking" | "ready" | "unauth" | "forbidden">(
    "checking",
  );
  const [activeTab, setActiveTab] = useState<"sitemap" | "crud">("sitemap");
  const [pages, setPages] = useState<SeoPage[]>([]);
  const [sitemapItems, setSitemapItems] = useState<SitemapPageItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [submittingSitemap, setSubmittingSitemap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");

  const refresh = async () => {
    try {
      const [dbData, smData] = await Promise.all([
        list().catch(() => []),
        getSitemapPages().catch(() => []),
      ]);
      setPages(dbData);
      setSitemapItems(smData);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) setStatus("unauth");
        return;
      }
      try {
        const res = await checkAdmin();
        if (cancelled) return;
        if (!res.isAdmin) {
          setStatus("forbidden");
          return;
        }
        await refresh();
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("forbidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBulkSubmitSitemap = async () => {
    setSubmittingSitemap(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await submitAllSitemap();
      setSuccessMsg(`Successfully synced & submitted ${res.submitted} Contentful pages to sitemap!`);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Failed to submit pages to sitemap");
    } finally {
      setSubmittingSitemap(false);
    }
  };

  const handleToggleSitemapPage = async (item: SitemapPageItem) => {
    setBusy(true);
    try {
      const cleanSlug = item.slug.replace(/^\/+/, "");
      await upsert({
        data: {
          id: item.source === "Database SEO Page" ? item.id : undefined,
          slug: cleanSlug,
          label: item.label,
          enabled: !item.inSitemap,
          sort_order: 10,
        },
      });
      setSuccessMsg(`Updated sitemap inclusion for ${item.slug}`);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update page");
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking") {
    return <div className="mx-auto max-w-4xl px-4 py-12 text-sm text-gray-500">Checking access…</div>;
  }
  if (status === "unauth") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-sm">
        <p className="font-semibold text-gray-800">You need to sign in as an admin.</p>
        <Link to="/admin-login" className="mt-2 inline-block text-brand-navy underline font-medium">
          Go to admin login →
        </Link>
      </div>
    );
  }
  if (status === "forbidden") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-sm">
        <p className="text-red-600 font-semibold">Your account does not have admin permissions.</p>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/admin-login" });
          }}
          className="mt-3 rounded bg-brand-navy px-4 py-2 text-white text-xs font-semibold"
        >
          Sign out
        </button>
      </div>
    );
  }

  const filteredSitemapItems = sitemapItems.filter((item) => {
    const matchesQuery =
      !filter ||
      item.slug.toLowerCase().includes(filter.toLowerCase()) ||
      item.label.toLowerCase().includes(filter.toLowerCase());
    const matchesSource = sourceFilter === "ALL" || item.source === sourceFilter;
    return matchesQuery && matchesSource;
  });

  const totalPagesCount = sitemapItems.length;
  const inSitemapCount = sitemapItems.filter((i) => i.inSitemap).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white border-b border-slate-800">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold tracking-tight">Sitemap &amp; Page Indexing Manager</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Manage 1-to-1 page indexing for sitemap.xml. Internal routes (/admin, /payment, /.well-known) are strictly hidden and excluded.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkSubmitSitemap}
              disabled={submittingSitemap}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text.xs text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {submittingSitemap ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Submit All Contentful Pages to Sitemap
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Alerts */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Protection Security Banner */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Sensitive Paths Protected</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Routes like <code className="bg-slate-100 px-1 py-0.5 rounded">/admin</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">/payment</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">/.well-known</code>, and <code className="bg-slate-100 px-1 py-0.5 rounded">/mcp</code> return 404 to public bots and are automatically excluded from sitemap.xml.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="text-center px-3 py-1.5 rounded-lg bg-slate-100">
              <span className="block font-bold text-slate-900 text-sm">{totalPagesCount}</span>
              <span className="text-slate-500">Public Pages</span>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="block font-bold text-emerald-900 text-sm">{inSitemapCount}</span>
              <span className="text-emerald-700">In Sitemap</span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center border-b border-slate-200 gap-6">
          <button
            onClick={() => setActiveTab("sitemap")}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "sitemap"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Sitemap Pages List ({sitemapItems.length})
          </button>
          <button
            onClick={() => setActiveTab("crud")}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "crud"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Add Custom SEO Page Slug
          </button>
        </div>

        {activeTab === "sitemap" && (
          <div className="space-y-4">
            {/* Search & Source Filter */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="w-full sm:w-80 relative">
                <input
                  type="text"
                  placeholder="Search page slug or title..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="ALL">All Sources</option>
                  <option value="Contentful CMS">Contentful CMS</option>
                  <option value="Database SEO Page">Database SEO Page</option>
                  <option value="Static Route">Static Route</option>
                </select>

                <button
                  onClick={refresh}
                  className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
                  title="Refresh list"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Sitemap Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Page Title / Slug</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Last Modified</th>
                    <th className="px-4 py-3">Sitemap Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSitemapItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No pages match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredSitemapItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{item.label}</div>
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                            <span>{item.slug}</span>
                            <a
                              href={item.slug}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-slate-700"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              item.source === "Contentful CMS"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : item.source === "Database SEO Page"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-gray-100 text-gray-700 border border-gray-200"
                            }`}
                          >
                            {item.source}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-500">{item.lastmod}</td>

                        <td className="px-4 py-3">
                          {item.inSitemap ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Included in Sitemap
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Excluded
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleToggleSitemapPage(item)}
                            disabled={busy}
                            className={`px-3 py-1 rounded text-xs font-semibold transition ${
                              item.inSitemap
                                ? "bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-800"
                                : "bg-emerald-600 text-white hover:bg-emerald-500"
                            }`}
                          >
                            {item.inSitemap ? "Exclude" : "Include"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "crud" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add or Edit Custom SEO Page Slug</h3>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                try {
                  await upsert({
                    data: {
                      id: form.id,
                      slug: form.slug,
                      label: form.label,
                      enabled: form.enabled,
                      sort_order: form.sort_order,
                    },
                  });
                  setForm(EMPTY);
                  setSuccessMsg("Custom SEO page saved successfully.");
                  await refresh();
                } catch (err: any) {
                  setError(err.message || "Failed to save page");
                } finally {
                  setBusy(false);
                }
              }}
              className="space-y-4 max-w-xl"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Page Slug (URL Path)</label>
                <input
                  type="text"
                  placeholder="e.g. udyam-registration-certificate-download"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:border-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Page Label / Title</label>
                <input
                  type="text"
                  placeholder="e.g. Udyam Registration Certificate Download Guide"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:border-slate-900"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled-check"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <label htmlFor="enabled-check" className="text-xs font-medium text-slate-700">
                  Include in Sitemap &amp; Enable Page
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Save SEO Page
                </button>
                {form.id && (
                  <button
                    type="button"
                    onClick={() => setForm(EMPTY)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
