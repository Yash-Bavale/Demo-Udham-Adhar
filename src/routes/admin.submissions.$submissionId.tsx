import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getSubmission, updateSubmissionStatus } from "@/lib/crm/submissions-admin.functions";

export const Route = createFileRoute("/admin/submissions/$submissionId")({
  component: SubmissionDetailPage,
});

type FieldDef = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  validation?: { min?: number; max?: number; pattern?: string };
  group?: string | null;
};

type DocDef = {
  key: string;
  label: string;
  required?: boolean;
};

function validateField(field: FieldDef, value: unknown): { ok: boolean; reason?: string } {
  if (field.required && (value == null || value === "" || (Array.isArray(value) && value.length === 0))) {
    return { ok: false, reason: "Required field is empty" };
  }
  if (value == null || value === "") return { ok: true };
  if (field.type === "email" && typeof value === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: false, reason: "Invalid email format" };
  }
  if (field.type === "tel" && typeof value === "string" && !/^[+\d][\d\s\-()]{6,}$/.test(value)) {
    return { ok: false, reason: "Invalid phone number" };
  }
  if (field.type === "number") {
    const n = Number(value);
    if (Number.isNaN(n)) return { ok: false, reason: "Not a number" };
    if (field.validation?.min != null && n < field.validation.min) return { ok: false, reason: `Min ${field.validation.min}` };
    if (field.validation?.max != null && n > field.validation.max) return { ok: false, reason: `Max ${field.validation.max}` };
  }
  if (field.validation?.pattern && typeof value === "string") {
    try {
      if (!new RegExp(field.validation.pattern).test(value)) return { ok: false, reason: "Pattern mismatch" };
    } catch {}
  }
  return { ok: true };
}

function SubmissionDetailPage() {
  const { submissionId } = Route.useParams();
  const getFn = useServerFn(getSubmission);
  const updateFn = useServerFn(updateSubmissionStatus);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.submission", submissionId],
    queryFn: () => getFn({ data: { id: submissionId } }),
  });

  const [note, setNote] = useState("");

  const fields: FieldDef[] = useMemo(
    () => ((data?.formSchema as any)?.schema?.fields ?? []) as FieldDef[],
    [data],
  );
  const docDefs: DocDef[] = useMemo(
    () => ((data?.formSchema as any)?.documents ?? []) as DocDef[],
    [data],
  );
  const formData: Record<string, unknown> = (data?.submission as any)?.form_data ?? {};
  const documents = data?.documents ?? [];

  const validation = useMemo(() => {
    if (!fields.length) return [];
    return fields.map((f) => ({ field: f, value: formData[f.key], result: validateField(f, formData[f.key]) }));
  }, [fields, formData]);

  const failedCount = validation.filter((v) => !v.result.ok).length;
  const filledCount = validation.filter((v) => v.value != null && v.value !== "").length;

  const docStatus = useMemo(() => {
    return docDefs.map((d) => {
      const uploaded = documents.find((doc: any) => doc.doc_type === d.key);
      return { def: d, uploaded };
    });
  }, [docDefs, documents]);

  const workflow = data?.workflow as any;
  const currentStatus = data?.application?.application_status ?? data?.lead?.status ?? "—";
  const steps: { key: string; label: string; color?: string }[] = workflow?.application_statuses ?? [];
  const currentIdx = steps.findIndex((s) => s.key === currentStatus);

  async function review(status: "approved" | "rejected" | "needs_changes") {
    try {
      await updateFn({ data: { id: submissionId, status, notes: note || undefined } });
      toast.success(`Marked ${status.replace("_", " ")}`);
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin.submission", submissionId] });
      qc.invalidateQueries({ queryKey: ["admin.submissions"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading submission…</div>;
  if (!data) return <div className="p-8 text-sm text-red-600">Submission not found.</div>;

  const lead = data.lead as any;
  const customer = data.customer as any;
  const application = data.application as any;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/submissions" className="text-xs text-slate-500 hover:underline">
          ← All submissions
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{lead?.name ?? "Unknown customer"}</h1>
            <p className="text-sm text-slate-500">
              {data.submission.service_code} · {lead?.mobile ?? ""} · {lead?.email ?? ""}
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-slate-900 text-white px-3 py-1 text-xs font-medium">
            {data.submission.status}
          </span>
        </div>
      </div>

      {/* Identity strip */}
      <div className="grid md:grid-cols-3 gap-3">
        <Card title="Customer">
          {customer ? (
            <Link to="/admin/customers/$customerId" params={{ customerId: customer.id }} className="block hover:bg-slate-50 -m-2 p-2 rounded">
              <div className="font-mono text-xs text-emerald-700">{customer.customer_code}</div>
              <div className="text-sm font-medium mt-1">{customer.name}</div>
              <div className="text-xs text-slate-500 mt-1">
                {customer.total_applications} apps · ₹{Number(customer.lifetime_value).toLocaleString()}
              </div>
            </Link>
          ) : (
            <div className="text-xs text-slate-400">Not linked</div>
          )}
        </Card>
        <Card title="Lead">
          {lead ? (
            <Link to="/admin/leads/$leadId" params={{ leadId: lead.id }} className="block hover:bg-slate-50 -m-2 p-2 rounded">
              <div className="font-mono text-xs text-blue-700">{lead.lead_code}</div>
              <div className="text-sm mt-1">{lead.service}</div>
              <div className="text-xs text-slate-500 mt-1">{lead.status}</div>
            </Link>
          ) : (
            <div className="text-xs text-slate-400">No lead</div>
          )}
        </Card>
        <Card title="Application">
          {application ? (
            <Link to="/admin/applications/$applicationId" params={{ applicationId: application.id }} className="block hover:bg-slate-50 -m-2 p-2 rounded">
              <div className="font-mono text-xs text-purple-700">{application.application_code}</div>
              <div className="text-sm mt-1">{application.application_status}</div>
              <div className="text-xs text-slate-500 mt-1">
                form: {application.form_status} · docs: {application.document_status}
              </div>
            </Link>
          ) : (
            <div className="text-xs text-slate-400">No application yet</div>
          )}
        </Card>
      </div>

      {/* Workflow progress */}
      {steps.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Workflow</div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {steps.map((s, i) => {
              const isCurrent = i === currentIdx;
              const isDone = currentIdx >= 0 && i < currentIdx;
              return (
                <div key={s.key} className="flex items-center gap-1 shrink-0">
                  <div
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      isCurrent
                        ? "bg-slate-900 text-white"
                        : isDone
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.label}
                  </div>
                  {i < steps.length - 1 && <div className="w-4 h-px bg-slate-200" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Validation summary */}
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <Stat label="Fields filled" value={`${filledCount} / ${fields.length}`} tone="slate" />
        <Stat label="Validation errors" value={String(failedCount)} tone={failedCount ? "red" : "green"} />
        <Stat
          label="Documents uploaded"
          value={`${documents.length} / ${docDefs.length || "any"}`}
          tone="blue"
        />
      </div>

      {/* Form Field Review */}
      <div className="rounded-lg border bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold">Form responses</h2>
          {fields.length === 0 && <span className="text-xs text-slate-400">No schema configured</span>}
        </div>
        <div className="divide-y">
          {fields.length === 0 &&
            Object.entries(formData).map(([k, v]) => (
              <div key={k} className="px-4 py-3 grid grid-cols-3 gap-3 text-sm">
                <div className="text-slate-500 font-mono text-xs">{k}</div>
                <div className="col-span-2 break-all">{renderValue(v)}</div>
              </div>
            ))}
          {validation.map(({ field, value, result }) => (
            <div key={field.key} className="px-4 py-3 grid grid-cols-12 gap-3 text-sm items-start">
              <div className="col-span-4">
                <div className="font-medium">{field.label}</div>
                <div className="font-mono text-xs text-slate-400">{field.key} · {field.type}{field.required ? " · required" : ""}</div>
              </div>
              <div className="col-span-6 break-all">{renderValue(value)}</div>
              <div className="col-span-2 text-right">
                {result.ok ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">✓ Valid</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-xs" title={result.reason}>
                    ✗ {result.reason}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Documents */}
      <div className="rounded-lg border bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Documents</h2>
        </div>
        <div className="divide-y">
          {docStatus.length === 0 && documents.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No documents uploaded.</div>
          )}
          {docStatus.map(({ def, uploaded }) => (
            <div key={def.key} className="px-4 py-3 grid grid-cols-12 gap-3 text-sm items-center">
              <div className="col-span-4">
                <div className="font-medium">{def.label}</div>
                <div className="font-mono text-xs text-slate-400">{def.key}{def.required ? " · required" : ""}</div>
              </div>
              <div className="col-span-6 text-xs text-slate-600">
                {uploaded ? (
                  <>
                    <div>{uploaded.file_name}</div>
                    <div className="text-slate-400">
                      {(Number(uploaded.size_bytes) / 1024).toFixed(0)} KB · {uploaded.status}
                    </div>
                  </>
                ) : (
                  <span className="text-slate-400">Not uploaded</span>
                )}
              </div>
              <div className="col-span-2 text-right">
                {uploaded ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">✓ Uploaded</span>
                ) : def.required ? (
                  <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-xs">Missing</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-xs">Optional</span>
                )}
              </div>
            </div>
          ))}
          {/* Documents uploaded but not in schema */}
          {documents
            .filter((d: any) => !docDefs.find((dd) => dd.key === d.doc_type))
            .map((d: any) => (
              <div key={d.id} className="px-4 py-3 grid grid-cols-12 gap-3 text-sm items-center bg-amber-50/50">
                <div className="col-span-4">
                  <div className="font-medium">{d.file_name}</div>
                  <div className="font-mono text-xs text-slate-400">{d.doc_type} · unmapped</div>
                </div>
                <div className="col-span-6 text-xs text-slate-600">{(Number(d.size_bytes) / 1024).toFixed(0)} KB · {d.status}</div>
                <div className="col-span-2 text-right">
                  <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs">Extra</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Review actions */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Review decision</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional internal note for activity log…"
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => review("approved")} className="rounded bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700">
            Approve
          </button>
          <button onClick={() => review("needs_changes")} className="rounded bg-amber-500 text-white px-4 py-2 text-sm font-medium hover:bg-amber-600">
            Request Changes
          </button>
          <button onClick={() => review("rejected")} className="rounded bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700">
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function renderValue(v: unknown) {
  if (v == null || v === "") return <span className="text-slate-400">—</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return <pre className="text-xs">{JSON.stringify(v, null, 2)}</pre>;
  return String(v);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "slate" | "red" | "green" | "blue" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-900",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
