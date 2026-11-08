import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Download, History, Search, X, ExternalLink } from "lucide-react";
import { SectionCard, TableSkeleton, FilterChip, StatusBadge } from "@/components/admin/ui";
import {
  listAllDocuments,
  getDocumentSignedUrl,
  getDocumentVersions,
  type DocRow,
} from "@/lib/crm/documents-admin.functions";

export const Route = createFileRoute("/admin/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async () => {
    // Lazy import keeps the auth SDK out of the bundle public visitors download.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/admin-login" });
    const { data: rows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const roles = (rows ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      throw redirect({ to: "/admin/my-work" });
    }
  },
  component: DocumentsPage,
});

function fileIcon(mime: string) {
  if (mime?.startsWith("image/")) return <ImageIcon className="size-4" />;
  return <FileText className="size-4" />;
}

function DocumentsPage() {
  const listFn = useServerFn(listAllDocuments);
  const [docType, setDocType] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin.documents", { docType, status, q }],
    queryFn: () => listFn({ data: { docType, status, q } }),
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];
  const docTypes = data?.docTypes ?? [];
  const counts = useMemo(() => {
    const c = { all: rows.length, approved: 0, pending: 0, rejected: 0 };
    rows.forEach((r) => {
      if (r.status === "approved") c.approved++;
      else if (r.status === "rejected") c.rejected++;
      else c.pending++;
    });
    return c;
  }, [rows]);

  const [previewDoc, setPreviewDoc] = useState<DocRow | null>(null);
  const [versionsFor, setVersionsFor] = useState<DocRow | null>(null);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--admin-fg)" }}>
          Document Management
        </h1>
        <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
          Every customer document, across every order. Preview, download, audit versions.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={!status} onClick={() => setStatus(undefined)}>
          All ({counts.all})
        </FilterChip>
        <FilterChip active={status === "approved"} onClick={() => setStatus("approved")}>
          Approved ({counts.approved})
        </FilterChip>
        <FilterChip active={status === "pending"} onClick={() => setStatus("pending")}>
          Pending ({counts.pending})
        </FilterChip>
        <FilterChip active={status === "rejected"} onClick={() => setStatus("rejected")}>
          Rejected ({counts.rejected})
        </FilterChip>
      </div>


      <SectionCard>
        <div className="p-4 flex flex-wrap items-center gap-3 border-b" style={{ borderColor: "var(--admin-border)" }}>
          <div
            className="flex items-center gap-2 rounded-md border px-3 h-9 flex-1 min-w-[240px] max-w-md"
            style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface-2)" }}
          >
            <Search className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search file, customer, lead, order…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={docType ?? ""}
            onChange={(e) => setDocType(e.target.value || undefined)}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            style={{ borderColor: "var(--admin-border)" }}
          >
            <option value="">All document types</option>
            {docTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            No documents match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "var(--admin-surface-2)" }}>
                <tr className="text-left" style={{ color: "var(--admin-fg-muted)" }}>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">Document</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">Type</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">Customer</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">Order</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">Uploaded</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide">Status</th>
                  <th className="py-2.5 px-4 font-medium text-[11px] uppercase tracking-wide text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-t"
                    style={{
                      borderColor: "var(--admin-border)",
                      background: i % 2 ? "var(--admin-surface-2)" : "transparent",
                    }}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="shrink-0 rounded-md p-1.5"
                          style={{ background: "var(--admin-surface)", color: "var(--admin-primary)" }}
                        >
                          {fileIcon(r.mime_type)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium" style={{ color: "var(--admin-fg)" }}>
                            {r.file_name}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
                            v{r.version} · {r.mime_type}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">{r.doc_type}</td>
                    <td className="py-2.5 px-4">
                      <div className="truncate max-w-[180px]">{r.customer_name ?? r.lead_name ?? "—"}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs">{r.application_code ?? "—"}</td>
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap" style={{ color: "var(--admin-fg-muted)" }}>
                      {new Date(r.uploaded_at).toLocaleDateString("en-IN")}
                    </td>
                    <td className="py-2.5 px-4"><StatusBadge status={r.status} /></td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPreviewDoc(r)}
                          className="rounded-md p-1.5 hover:bg-[var(--admin-surface)]"
                          title="Preview"
                        >
                          <ExternalLink className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setVersionsFor(r)}
                          className="rounded-md p-1.5 hover:bg-[var(--admin-surface)]"
                          title="Version history"
                        >
                          <History className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {previewDoc && <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      {versionsFor && <VersionsModal doc={versionsFor} onClose={() => setVersionsFor(null)} />}
    </div>
  );
}

function PreviewModal({ doc, onClose }: { doc: DocRow; onClose: () => void }) {
  const signFn = useServerFn(getDocumentSignedUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["doc-signed", doc.file_path],
    queryFn: () => signFn({ data: { path: doc.file_path } }),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[85vh] rounded-lg flex flex-col"
        style={{ background: "var(--admin-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium" style={{ color: "var(--admin-fg)" }}>
              {doc.file_name}
            </div>
            <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
              {doc.doc_type} · v{doc.version} · {doc.customer_name ?? doc.lead_name ?? "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.url && (
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                download={doc.file_name}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: "var(--admin-border)" }}
              >
                <Download className="size-3" /> Download
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-[var(--admin-surface-2)]"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto" style={{ background: "var(--admin-bg)" }}>
          {isLoading || !data?.url ? (
            <div className="p-10 text-center text-sm" style={{ color: "var(--admin-fg-muted)" }}>
              Loading preview…
            </div>
          ) : doc.mime_type?.startsWith("image/") ? (
            <img src={data.url} alt={doc.file_name} className="mx-auto max-h-full" />
          ) : (
            <iframe src={data.url} title={doc.file_name} className="w-full h-full" />
          )}
        </div>
      </div>
    </div>
  );
}

function VersionsModal({ doc, onClose }: { doc: DocRow; onClose: () => void }) {
  const fn = useServerFn(getDocumentVersions);
  const signFn = useServerFn(getDocumentSignedUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["doc-versions", doc.doc_type, doc.lead_id],
    queryFn: () => fn({ data: { docType: doc.doc_type, leadId: doc.lead_id } }),
  });

  async function openVersion(path: string) {
    const { url } = await signFn({ data: { path } });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg"
        style={{ background: "var(--admin-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--admin-border)" }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--admin-fg)" }}>
              Version history — {doc.doc_type}
            </div>
            <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
              {doc.customer_name ?? doc.lead_name ?? "—"}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[var(--admin-surface-2)]" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <TableSkeleton rows={3} cols={3} />
          ) : (data?.versions ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--admin-fg-muted)" }}>
              No versions found.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--admin-border)" }}>
              {data!.versions.map((v: any) => (
                <li key={v.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-[11px] font-mono">v{v.version}</span>
                      <span className="truncate" style={{ color: "var(--admin-fg)" }}>{v.file_name}</span>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--admin-fg-muted)" }}>
                      Uploaded {new Date(v.uploaded_at).toLocaleString("en-IN")}
                      {v.verified_at && ` · verified ${new Date(v.verified_at).toLocaleDateString("en-IN")}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={v.status} />
                    <button
                      onClick={() => openVersion(v.file_path)}
                      className="rounded-md border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--admin-border)" }}
                    >
                      Open
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
