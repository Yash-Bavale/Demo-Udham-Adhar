import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  FileCheck2,
  Check,
  X,
  RotateCcw,
  Download,
  Loader2,
  ChevronRight,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import {
  listReviewDocuments,
  getDocumentSignedUrl,
  approveDocument,
  rejectDocument,
  type ReviewDoc,
} from "@/lib/crm/document-review.functions";
import { requestDocumentReupload } from "@/lib/crm/onboarding-admin.functions";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

export const Route = createFileRoute("/admin/review")({
  head: () => ({
    meta: [
      { title: "Document Review — Udyam Ops OS" },
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
  component: DocumentReviewPage,
});

type StatusFilter = "pending" | "approved" | "rejected" | "re_upload_requested";

function DocumentReviewPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const fetchList = useServerFn(listReviewDocuments);
  const { data, refetch, isLoading } = useQuery<{ rows: ReviewDoc[] }>({
    queryKey: ["review", "docs", status],
    queryFn: () => fetchList({ data: { status, limit: 100 } }),
  });
  useRealtimeTable("documents", () => refetch());

  const rows = data?.rows ?? [];

  // Auto-select first row on data change
  useEffect(() => {
    if (rows.length === 0) setSelectedId(null);
    else if (!selectedId || !rows.find((r) => r.id === selectedId)) setSelectedId(rows[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, selectedId]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const approve = useServerFn(approveDocument);
  const reject = useServerFn(rejectDocument);
  const reupload = useServerFn(requestDocumentReupload);

  const approveMut = useMutation({
    mutationFn: (id: string) => approve({ data: { documentId: id, comment: comment || undefined } }),
    onSuccess: () => {
      toast.success("Document approved");
      setComment("");
      qc.invalidateQueries({ queryKey: ["review", "docs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => {
      if (!comment.trim()) throw new Error("Reason is required to reject");
      return reject({ data: { documentId: id, reason: comment } });
    },
    onSuccess: () => {
      toast.success("Document rejected");
      setComment("");
      qc.invalidateQueries({ queryKey: ["review", "docs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reject"),
  });

  const reuploadMut = useMutation({
    mutationFn: (id: string) => reupload({ data: { documentId: id, reason: comment || undefined } }),
    onSuccess: () => {
      toast.success("Re-upload requested — email queued");
      setComment("");
      qc.invalidateQueries({ queryKey: ["review", "docs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to request re-upload"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--admin-fg)" }}>
            Document Review
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--admin-fg-muted)" }}>
            Three-pane reviewer · approve, reject, or request re-upload.
          </p>
        </div>
        <div
          className="flex items-center gap-1 rounded-lg border p-1"
          style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
        >
          <Filter className="w-3.5 h-3.5 ml-1.5" style={{ color: "var(--admin-fg-muted)" }} />
          {(["pending", "re_upload_requested", "approved", "rejected"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors"
              style={{
                background: status === s ? "var(--admin-surface-2)" : "transparent",
                color: status === s ? "var(--admin-fg)" : "var(--admin-fg-muted)",
              }}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-3 h-[calc(100vh-200px)] min-h-[560px]">
        {/* QUEUE */}
        <aside
          className="rounded-xl border overflow-hidden flex flex-col"
          style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
        >
          <header
            className="px-3 py-2 border-b flex items-center justify-between"
            style={{ borderColor: "var(--admin-border)" }}
          >
            <span className="text-xs font-semibold" style={{ color: "var(--admin-fg)" }}>
              Queue ({rows.length})
            </span>
            {isLoading && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--admin-fg-muted)" }} />}
          </header>
          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="p-8 text-center text-xs" style={{ color: "var(--admin-fg-muted)" }}>
                <FileCheck2 className="w-5 h-5 mx-auto mb-2 opacity-50" />
                Nothing in this queue.
              </div>
            ) : (
              <ul>
                {rows.map((d) => {
                  const active = d.id === selectedId;
                  return (
                    <li key={d.id}>
                      <button
                        onClick={() => setSelectedId(d.id)}
                        className="w-full text-left px-3 py-2 border-b transition-colors"
                        style={{
                          background: active ? "var(--admin-surface-2)" : "transparent",
                          borderColor: "var(--admin-border)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: "var(--admin-surface-2)", color: "var(--admin-fg-muted)" }}
                          >
                            {d.doc_type}
                          </span>
                          <span className="ml-auto text-[10px]" style={{ color: "var(--admin-fg-muted)" }}>
                            {formatRelative(d.uploaded_at)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs font-medium truncate" style={{ color: "var(--admin-fg)" }}>
                          {d.lead?.name ?? "—"}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: "var(--admin-fg-muted)" }}>
                          {d.file_name}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* VIEWER */}
        <main
          className="rounded-xl border overflow-hidden flex flex-col"
          style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
        >
          {selected ? (
            <DocumentViewer key={selected.id} doc={selected} />
          ) : (
            <div
              className="flex-1 grid place-items-center text-sm"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              Select a document to review.
            </div>
          )}
        </main>

        {/* INSPECTOR */}
        <aside
          className="rounded-xl border overflow-hidden flex flex-col"
          style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
        >
          {selected ? (
            <div className="flex flex-col h-full">
              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--admin-fg-muted)" }}>
                    Document
                  </div>
                  <div className="text-sm font-semibold mt-0.5 break-all" style={{ color: "var(--admin-fg)" }}>
                    {selected.doc_type}
                  </div>
                  <div className="text-[11px] mt-0.5 break-all" style={{ color: "var(--admin-fg-muted)" }}>
                    {selected.file_name} · v{selected.version}
                  </div>
                </div>
                <Field label="Status" value={selected.status.replace(/_/g, " ")} />
                <Field label="Uploaded" value={fmtDate(selected.uploaded_at)} />
                {selected.verified_at && <Field label="Verified" value={fmtDate(selected.verified_at)} />}
                {selected.verification_comment && (
                  <Field label="Comment" value={selected.verification_comment} />
                )}
                {selected.lead && (
                  <Field
                    label="Lead"
                    valueNode={
                      <Link
                        to="/admin/leads/$leadId"
                        params={{ leadId: selected.lead.id }}
                        className="inline-flex items-center gap-1 hover:underline"
                        style={{ color: "var(--admin-accent)" }}
                      >
                        {selected.lead.name} <ChevronRight className="w-3 h-3" />
                      </Link>
                    }
                  />
                )}
                {selected.application_id && (
                  <Field
                    label="Application"
                    valueNode={
                      <Link
                        to="/admin/applications/$applicationId"
                        params={{ applicationId: selected.application_id }}
                        className="inline-flex items-center gap-1 hover:underline"
                        style={{ color: "var(--admin-accent)" }}
                      >
                        Open command center <ChevronRight className="w-3 h-3" />
                      </Link>
                    }
                  />
                )}

                <div className="pt-2">
                  <label
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--admin-fg-muted)" }}
                  >
                    Comment / reason
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    placeholder="Optional for approve · required for reject"
                    className="mt-1 w-full text-xs rounded-md border p-2 outline-none focus:ring-1"
                    style={{
                      background: "var(--admin-bg)",
                      borderColor: "var(--admin-border)",
                      color: "var(--admin-fg)",
                    }}
                  />
                </div>
              </div>

              <footer
                className="p-3 border-t grid grid-cols-3 gap-2"
                style={{ borderColor: "var(--admin-border)" }}
              >
                <ActionButton
                  onClick={() => approveMut.mutate(selected.id)}
                  busy={approveMut.isPending}
                  icon={Check}
                  label="Approve"
                  tone="success"
                />
                <ActionButton
                  onClick={() => rejectMut.mutate(selected.id)}
                  busy={rejectMut.isPending}
                  icon={X}
                  label="Reject"
                  tone="danger"
                />
                <ActionButton
                  onClick={() => reuploadMut.mutate(selected.id)}
                  busy={reuploadMut.isPending}
                  icon={RotateCcw}
                  label="Re-upload"
                  tone="warn"
                />
              </footer>
            </div>
          ) : (
            <div
              className="flex-1 grid place-items-center text-xs"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              No selection
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------ viewer ------------ */

function DocumentViewer({ doc }: { doc: ReviewDoc }) {
  const getUrl = useServerFn(getDocumentSignedUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["review", "doc-url", doc.id],
    queryFn: () => getUrl({ data: { documentId: doc.id } }),
    staleTime: 60_000 * 5,
  });

  const isImage = doc.mime_type?.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <div className="flex flex-col h-full">
      <header
        className="px-4 py-2 border-b flex items-center justify-between gap-2"
        style={{ borderColor: "var(--admin-border)" }}
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: "var(--admin-fg)" }}>
            {doc.file_name}
          </div>
          <div className="text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>
            {doc.mime_type} · {(doc.size_bytes / 1024).toFixed(1)} KB
          </div>
        </div>
        {data?.url && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            download={doc.file_name}
            className="inline-flex items-center gap-1 text-[11px] rounded-md border px-2 py-1 hover:bg-[var(--admin-surface-2)]"
            style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
          >
            <Download className="w-3 h-3" /> Download
          </a>
        )}
      </header>
      <div className="flex-1 overflow-auto" style={{ background: "var(--admin-bg)" }}>
        {isLoading || !data?.url ? (
          <div
            className="h-full grid place-items-center text-xs"
            style={{ color: "var(--admin-fg-muted)" }}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : isPdf ? (
          <iframe src={data.url} title={doc.file_name} className="w-full h-full bg-white" />
        ) : isImage ? (
          <div className="h-full grid place-items-center p-4">
            <img src={data.url} alt={doc.file_name} className="max-w-full max-h-full object-contain" />
          </div>
        ) : (
          <div
            className="h-full grid place-items-center text-xs p-6 text-center"
            style={{ color: "var(--admin-fg-muted)" }}
          >
            Preview unavailable for this file type. Use Download to inspect.
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------ bits ------------ */

function Field({
  label, value, valueNode,
}: { label: string; value?: string; valueNode?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--admin-fg-muted)" }}>
        {label}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--admin-fg)" }}>
        {valueNode ?? value ?? "—"}
      </div>
    </div>
  );
}

function ActionButton({
  onClick, busy, icon: Icon, label, tone,
}: {
  onClick: () => void;
  busy: boolean;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  tone: "success" | "danger" | "warn";
}) {
  const color =
    tone === "success" ? "var(--admin-success)" : tone === "danger" ? "var(--admin-danger)" : "var(--admin-warn)";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center justify-center gap-1.5 text-xs font-medium rounded-md border py-2 disabled:opacity-50 hover:bg-[var(--admin-surface-2)] transition-colors"
      style={{ borderColor: "var(--admin-border)", color }}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
