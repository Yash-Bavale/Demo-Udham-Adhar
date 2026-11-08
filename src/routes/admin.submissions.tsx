import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listSubmissions } from "@/lib/crm/submissions-admin.functions";

export const Route = createFileRoute("/admin/submissions")({ component: SubmissionsPage });

const STATUS_CHIPS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  needs_changes: "bg-amber-100 text-amber-700",
};

function SubmissionsPage() {
  const listFn = useServerFn(listSubmissions);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin.submissions", status, search],
    queryFn: () => listFn({ data: { status: status || undefined, search: search || undefined, limit: 100 } }),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Service Submissions</h1>
          <p className="text-sm text-slate-500">Review customer intake forms and map them to leads and applications.</p>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-3 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, mobile, email, code…"
          className="flex-1 min-w-[240px] rounded border px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="needs_changes">Needs changes</option>
        </select>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Service</th>
              <th className="px-3 py-2 text-left">Lead / Application</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Submitted</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No submissions found.</td></tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.lead?.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">{r.lead?.mobile ?? ""} · {r.lead?.email ?? ""}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.service_code}</td>
                <td className="px-3 py-2 text-xs">
                  <div>{r.lead?.lead_code ?? "—"}</div>
                  <div className="text-slate-500">{r.application?.application_code ?? "no application"}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIPS[r.status] ?? "bg-slate-100 text-slate-700"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/admin/submissions/$submissionId"
                    params={{ submissionId: r.id }}
                    className="text-blue-700 text-xs hover:underline"
                  >Review →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
