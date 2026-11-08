import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  Copy,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  listSitemapWebsites,
  getSitemapManagerData,
  setSitemapInclusion,
  checkLiveSitemap,
  type SitemapCheckResult,
} from "@/lib/sitemap/sitemap-admin.functions";

export const Route = createFileRoute("/admin/seo")({ component: SitemapManagerPage });

const SOURCES = ["ALL", "Contentful CMS", "Database SEO Page", "Static Route"] as const;

function SitemapManagerPage() {
  const sitesFn = useServerFn(listSitemapWebsites);
  const dataFn = useServerFn(getSitemapManagerData);
  const toggleFn = useServerFn(setSitemapInclusion);
  const checkFn = useServerFn(checkLiveSitemap);
  const qc = useQueryClient();

  const [websiteId, setWebsiteId] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("ALL");
  const [check, setCheck] = useState<SitemapCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sitesQ = useQuery({ queryKey: ["admin.sitemap.sites"], queryFn: () => sitesFn() });
  const sites = sitesQ.data ?? [];
  const activeId = websiteId || sites[0]?.id || "";
  const activeSite = sites.find((s) => s.id === activeId);

  const pagesQ = useQuery({
    queryKey: ["admin.sitemap.pages", activeId],
    queryFn: () => dataFn({ data: { websiteId: activeId } }),
    enabled: !!activeId,
  });
  const items = pagesQ.data ?? [];

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return items.filter(
      (i) =>
        (source === "ALL" || i.source === source) &&
        (!f || i.slug.includes(f) || i.label.toLowerCase().includes(f)),
    );
  }, [items, filter, source]);

  const includedCount = items.filter((i) => i.included).length;

  async function toggle(slug: string, included: boolean) {
    setError(null);
    try {
      await toggleFn({ data: { websiteId: activeId, slug, included } });
      await qc.invalidateQueries({ queryKey: ["admin.sitemap.pages", activeId] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runCheck() {
    setChecking(true);
    setError(null);
    setCheck(null);
    try {
      setCheck(await checkFn({ data: { websiteId: activeId } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Globe className="size-6" /> Sitemap Manager
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Every page across all websites, with live sitemap checking. Pages published in
            Contentful appear here and in the sitemap automatically.
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["admin.sitemap.pages", activeId] })}
          className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

      {/* Website switcher */}
      <div className="flex flex-wrap gap-2">
        {sites.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setWebsiteId(s.id);
              setCheck(null);
            }}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              s.id === activeId
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            {s.name}
            <span className="opacity-60 ml-1.5 text-xs">{s.domain}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Checker */}
      {activeSite && (
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-slate-100 px-2 py-1 text-xs">
              {activeSite.sitemapUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(activeSite.sitemapUrl)}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-slate-50"
            >
              <Copy className="size-3.5" /> Copy
            </button>
            <a
              href={activeSite.sitemapUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-slate-50"
            >
              <ExternalLink className="size-3.5" /> Open XML
            </a>
            <button
              onClick={runCheck}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-60"
            >
              {checking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Check live sitemap
            </button>
            <span className="text-xs text-slate-500">
              Submit this URL in Google Search Console → Sitemaps.
            </span>
          </div>

          {check && (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-4">
                <Stat label="HTTP" value={String(check.status)} bad={!check.ok} />
                <Stat label="URLs" value={String(check.urlCount)} bad={check.urlCount === 0} />
                <Stat label="Valid XML" value={check.parsed ? "Yes" : "No"} bad={!check.parsed} />
                <Stat
                  label="Missing"
                  value={String(check.missing.length)}
                  bad={check.missing.length > 0}
                />
                <Stat
                  label="Should be excluded"
                  value={String(check.unexpected.length)}
                  bad={check.unexpected.length > 0}
                />
                <Stat
                  label="Wrong host"
                  value={String(check.wrongHost.length)}
                  bad={check.wrongHost.length > 0}
                />
              </div>
              {check.error && (
                <div className="text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> {check.error}
                </div>
              )}
              {!check.error &&
                check.missing.length === 0 &&
                check.unexpected.length === 0 &&
                check.wrongHost.length === 0 && (
                  <div className="text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" /> Live sitemap matches this website
                    exactly.
                  </div>
                )}
              <IssueList title="Missing from live sitemap" items={check.missing} />
              <IssueList title="Listed but excluded here" items={check.unexpected} />
              <IssueList title="URLs on another host" items={check.wrongHost} />
            </div>
          )}
        </div>
      )}

      {/* Page list */}
      <div className="rounded-lg border bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search slug or title…"
            className="rounded border px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as (typeof SOURCES)[number])}
            className="rounded border px-3 py-1.5 text-sm"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All sources" : s}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 ml-auto">
            {items.length} pages · {includedCount} in sitemap ·{" "}
            {items.length - includedCount} excluded
          </span>
        </div>

        {pagesQ.isLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading pages…</div>
        ) : shown.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No pages found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Page</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Last modified</th>
                  <th className="px-3 py-2 text-right">In sitemap</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.slug} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{i.label}</div>
                      <a
                        href={
                          activeSite ? `https://${activeSite.domain}${i.slug}` : i.slug
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-500 hover:underline"
                      >
                        {i.slug}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {i.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{i.lastmod || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={i.included}
                          onChange={(e) => toggle(i.slug, e.target.checked)}
                        />
                        <span className="text-xs text-slate-500">
                          {i.included ? "Included" : "Excluded"}
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`font-semibold ${bad ? "text-red-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500 mb-1">{title}</div>
      <ul className="max-h-48 overflow-y-auto rounded border bg-slate-50 p-2 text-xs space-y-0.5">
        {items.map((p) => (
          <li key={p} className="font-mono">
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
