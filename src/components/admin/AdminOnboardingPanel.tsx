import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, ExternalLink, Loader2 } from "lucide-react";
import {
  listOnboardingForLead,
  getDocumentSignedUrl,
  setDocumentStatus,
} from "@/lib/onboarding/onboarding.functions";
import { getSchema } from "@/lib/onboarding/schemas";
import { formatIST, formatDateDMY } from "@/lib/datetime";

function renderValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "plants" && typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr) && arr.length) {
        return arr
          .map((p: any, i: number) => {
            const line = [p.unit_name, p.address_flat, p.address_premises, p.address_village, p.address_road, p.city, p.district, p.state, p.pincode]
              .filter((x) => x && String(x).trim()).join(", ");
            return `#${i + 1}: ${line || "(empty)"}`;
          })
          .join("\n");
      }
    } catch {}
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateDMY(v);
  return String(v);
}


export function AdminOnboardingPanel({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOnboardingForLead);
  const urlFn = useServerFn(getDocumentSignedUrl);
  const statusFn = useServerFn(setDocumentStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.onboarding", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  if (isLoading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (!data) return null;

  const sub = data.submission;
  const docs = data.documents;
  const schema = sub ? getSchema(sub.service_code) : null;
  const labels = new Map(schema?.fields.map((f) => [f.key, f.label]) ?? []);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-white">
        <div className="px-4 py-2 border-b text-sm font-semibold flex items-center justify-between">
          <span>Onboarding submission</span>
          {sub && (
            <span
              className={
                "text-xs rounded-full px-2 py-0.5 " +
                (sub.status === "submitted"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200")
              }
            >
              {sub.status}
            </span>
          )}
        </div>
        <div className="p-4">
          {!sub ? (
            <div className="text-sm text-slate-500">Customer hasn't started onboarding yet.</div>
          ) : (
            <>
              <div className="text-xs text-slate-500 mb-2">
                Service: <span className="font-mono">{sub.service_code}</span>
                {sub.submitted_at && (
                  <> · Submitted {formatIST(sub.submitted_at)}</>
                )}
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {Object.entries((sub.form_data ?? {}) as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{labels.get(k) ?? k.replace(/_/g, " ")}</dt>
                    <dd className="font-medium break-words text-slate-900 mt-0.5 whitespace-pre-line">{renderValue(k, v) || "—"}</dd>

                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="px-4 py-2 border-b text-sm font-semibold">
          Documents ({docs.length})
        </div>
        <div className="p-4">
          {docs.length === 0 ? (
            <div className="text-sm text-slate-500">No documents uploaded yet.</div>
          ) : (
            <ul className="divide-y">
              {docs.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  onOpen={async () => {
                    const res = await urlFn({ data: { id: d.id } });
                    window.open(res.url, "_blank", "noopener");
                  }}
                  onStatus={async (status, remarks) => {
                    await statusFn({ data: { id: d.id, status, remarks: remarks ?? null } });
                    await qc.invalidateQueries({ queryKey: ["admin.onboarding", leadId] });
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

type DocItem = {
  id: string;
  doc_type: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  remarks: string | null;
  uploaded_at: string;
};

function DocRow({
  doc,
  onOpen,
  onStatus,
}: {
  doc: DocItem;
  onOpen: () => Promise<void>;
  onStatus: (status: "pending" | "verified" | "rejected", remarks?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState(doc.remarks ?? "");

  const Icon =
    doc.status === "verified" ? CheckCircle2 : doc.status === "rejected" ? XCircle : Clock;
  const iconCls =
    doc.status === "verified"
      ? "text-emerald-600"
      : doc.status === "rejected"
      ? "text-red-600"
      : "text-amber-600";

  async function act(s: "pending" | "verified" | "rejected") {
    setBusy(true);
    try {
      await onStatus(s, remarks.trim() || undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{doc.doc_type}</div>
            <div className="text-xs text-slate-500 truncate">
              {doc.file_name} · {(doc.size_bytes / 1024).toFixed(0)} KB
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1 text-xs rounded border px-2.5 py-1 hover:bg-slate-50"
          >
            <ExternalLink className="w-3 h-3" /> Open
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Remarks (shown to customer)"
          className="flex-1 min-w-[200px] rounded border px-2 py-1 text-xs"
        />
        <button
          disabled={busy}
          onClick={() => act("verified")}
          className="text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Verify"}
        </button>
        <button
          disabled={busy}
          onClick={() => act("rejected")}
          className="text-xs rounded bg-red-600 hover:bg-red-700 text-white px-3 py-1 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          disabled={busy}
          onClick={() => act("pending")}
          className="text-xs rounded border px-3 py-1 disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </li>
  );
}
