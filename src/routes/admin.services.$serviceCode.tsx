import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getServiceConfig,
  saveFormSchema,
  saveWorkflow,
} from "@/lib/crm/service-forms.functions";

export const Route = createFileRoute("/admin/services/$serviceCode")({
  component: ServiceBuilderPage,
});

type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "tel"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "file";

type Field = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string | null;
  help?: string | null;
  options?: { value: string; label: string }[];
  group?: string | null;
};

type DocReq = {
  key: string;
  label: string;
  required: boolean;
  accept: string;
  max_size_mb: number;
  help?: string | null;
};

type Status = {
  key: string;
  label: string;
  description?: string | null;
  color?: string | null;
  is_terminal: boolean;
  sla_hours?: number | null;
};

const DEFAULT_STATUSES: Status[] = [
  { key: "awaiting_payment", label: "Awaiting Payment", color: "amber", is_terminal: false },
  { key: "form_pending", label: "Form Pending", color: "amber", is_terminal: false },
  { key: "documents_pending", label: "Documents Pending", color: "amber", is_terminal: false },
  { key: "under_review", label: "Under Review", color: "blue", is_terminal: false, sla_hours: 24 },
  { key: "processing", label: "Processing", color: "blue", is_terminal: false, sla_hours: 48 },
  { key: "certificate_issued", label: "Certificate Issued", color: "green", is_terminal: true },
];

function ServiceBuilderPage() {
  const { serviceCode } = Route.useParams();
  const getFn = useServerFn(getServiceConfig);
  const saveFormFn = useServerFn(saveFormSchema);
  const saveWfFn = useServerFn(saveWorkflow);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.service-config", serviceCode],
    queryFn: () => getFn({ data: { service_code: serviceCode } }),
  });

  const [tab, setTab] = useState<"form" | "documents" | "workflow">("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [docs, setDocs] = useState<DocReq[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [wfName, setWfName] = useState("");
  const [wfRole, setWfRole] = useState<string>("operations");

  useEffect(() => {
    if (!data) return;
    const fs = data.formSchema as
      | { title?: string; description?: string; schema?: { fields?: Field[] }; documents?: DocReq[] }
      | null;
    setTitle(fs?.title ?? data.service?.service_name ?? "");
    setDescription(fs?.description ?? "");
    setFields(fs?.schema?.fields ?? []);
    setDocs(fs?.documents ?? []);

    const wf = data.workflow as
      | {
          display_name?: string;
          default_assignee_role?: string;
          application_statuses?: Status[];
        }
      | null;
    setWfName(wf?.display_name ?? data.service?.service_name ?? "");
    setWfRole(wf?.default_assignee_role ?? "operations");
    setStatuses(wf?.application_statuses?.length ? wf.application_statuses : DEFAULT_STATUSES);
  }, [data]);

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading service…</div>;
  if (!data?.service) return <div className="p-8 text-sm text-red-600">Service not found.</div>;

  async function publishForm() {
    try {
      const res = await saveFormFn({
        data: {
          service_code: serviceCode,
          title: title || data!.service!.service_name,
          description: description || null,
          is_active: true,
          schema: { fields },
          documents: docs,
        },
      });
      toast.success(`Form published (v${res.version})`);
      qc.invalidateQueries({ queryKey: ["admin.service-config", serviceCode] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function publishWorkflow() {
    try {
      await saveWfFn({
        data: {
          service_code: serviceCode,
          display_name: wfName,
          default_assignee_role: wfRole || null,
          is_active: true,
          application_statuses: statuses,
        },
      });
      toast.success("Workflow saved");
      qc.invalidateQueries({ queryKey: ["admin.service-config", serviceCode] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin/services" className="text-xs text-slate-500 hover:underline">
            ← All services
          </Link>
          <h1 className="text-2xl font-semibold mt-1">{data.service.service_name}</h1>
          <p className="text-xs font-mono text-slate-500">{serviceCode}</p>
        </div>
        <div className="flex gap-2">
          {tab !== "workflow" && (
            <button
              onClick={publishForm}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Publish Form (new version)
            </button>
          )}
          {tab === "workflow" && (
            <button
              onClick={publishWorkflow}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Save Workflow
            </button>
          )}
        </div>
      </div>

      <div className="border-b flex gap-6 text-sm">
        {(["form", "documents", "workflow"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 capitalize ${tab === t ? "border-b-2 border-slate-900 font-semibold" : "text-slate-500"}`}
          >
            {t === "form" ? "Form Fields" : t === "documents" ? "Documents" : "Workflow"}
          </button>
        ))}
      </div>

      {tab === "form" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4 grid md:grid-cols-2 gap-3">
            <TextInput label="Form title" value={title} onChange={setTitle} />
            <TextInput label="Description (optional)" value={description} onChange={setDescription} />
          </div>

          <div className="space-y-3">
            {fields.map((f, idx) => (
              <FieldEditor
                key={idx}
                field={f}
                onChange={(nf) => setFields(fields.map((x, i) => (i === idx ? nf : x)))}
                onRemove={() => setFields(fields.filter((_, i) => i !== idx))}
                onMove={(dir) => {
                  const j = idx + dir;
                  if (j < 0 || j >= fields.length) return;
                  const copy = [...fields];
                  [copy[idx], copy[j]] = [copy[j], copy[idx]];
                  setFields(copy);
                }}
              />
            ))}
            <button
              onClick={() =>
                setFields([
                  ...fields,
                  {
                    key: `field_${fields.length + 1}`,
                    label: "New field",
                    type: "text",
                    required: false,
                  },
                ])
              }
              className="rounded-lg border-2 border-dashed w-full py-3 text-sm text-slate-600 hover:bg-slate-50"
            >
              + Add field
            </button>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-3">
          {docs.map((d, idx) => (
            <DocumentEditor
              key={idx}
              doc={d}
              onChange={(nd) => setDocs(docs.map((x, i) => (i === idx ? nd : x)))}
              onRemove={() => setDocs(docs.filter((_, i) => i !== idx))}
            />
          ))}
          <button
            onClick={() =>
              setDocs([
                ...docs,
                {
                  key: `doc_${docs.length + 1}`,
                  label: "New document",
                  required: true,
                  accept: "image/*,application/pdf",
                  max_size_mb: 5,
                },
              ])
            }
            className="rounded-lg border-2 border-dashed w-full py-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            + Add document requirement
          </button>
        </div>
      )}

      {tab === "workflow" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4 grid md:grid-cols-2 gap-3">
            <TextInput label="Workflow name" value={wfName} onChange={setWfName} />
            <label className="block text-sm">
              <div className="text-xs text-slate-500 mb-1">Default assignee role</div>
              <select
                value={wfRole}
                onChange={(e) => setWfRole(e.target.value)}
                className="w-full rounded border px-3 py-2"
              >
                <option value="operations">Operations</option>
                <option value="support">Support</option>
                <option value="accounts">Accounts</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            {statuses.map((s, idx) => (
              <StatusEditor
                key={idx}
                step={s}
                index={idx}
                onChange={(ns) => setStatuses(statuses.map((x, i) => (i === idx ? ns : x)))}
                onRemove={() => setStatuses(statuses.filter((_, i) => i !== idx))}
                onMove={(dir) => {
                  const j = idx + dir;
                  if (j < 0 || j >= statuses.length) return;
                  const copy = [...statuses];
                  [copy[idx], copy[j]] = [copy[j], copy[idx]];
                  setStatuses(copy);
                }}
              />
            ))}
            <button
              onClick={() =>
                setStatuses([
                  ...statuses,
                  {
                    key: `status_${statuses.length + 1}`,
                    label: "New status",
                    is_terminal: false,
                  },
                ])
              }
              className="rounded-lg border-2 border-dashed w-full py-3 text-sm text-slate-600 hover:bg-slate-50"
            >
              + Add workflow step
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
    </label>
  );
}

function FieldEditor({
  field,
  onChange,
  onRemove,
  onMove,
}: {
  field: Field;
  onChange: (f: Field) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const needsOptions = field.type === "select" || field.type === "radio";
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex gap-2">
          <button onClick={() => onMove(-1)} className="text-xs text-slate-500 hover:text-slate-900">↑</button>
          <button onClick={() => onMove(1)} className="text-xs text-slate-500 hover:text-slate-900">↓</button>
        </div>
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline">Remove</button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <TextInput label="Field key" value={field.key} onChange={(v) => onChange({ ...field, key: v })} />
        <TextInput label="Label" value={field.label} onChange={(v) => onChange({ ...field, label: v })} />
        <label className="block text-sm">
          <div className="text-xs text-slate-500 mb-1">Type</div>
          <select
            value={field.type}
            onChange={(e) => onChange({ ...field, type: e.target.value as FieldType })}
            className="w-full rounded border px-3 py-2"
          >
            {(["text","textarea","number","email","tel","date","select","radio","checkbox","file"] as FieldType[]).map(
              (t) => <option key={t} value={t}>{t}</option>,
            )}
          </select>
        </label>
        <TextInput label="Placeholder" value={field.placeholder ?? ""} onChange={(v) => onChange({ ...field, placeholder: v })} />
        <TextInput label="Help text" value={field.help ?? ""} onChange={(v) => onChange({ ...field, help: v })} />
        <TextInput label="Group / section" value={field.group ?? ""} onChange={(v) => onChange({ ...field, group: v })} />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
        Required
      </label>
      {needsOptions && (
        <div className="border-t pt-3">
          <div className="text-xs text-slate-500 mb-2">Options</div>
          <div className="space-y-2">
            {(field.options ?? []).map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 rounded border px-2 py-1 text-sm"
                  placeholder="value"
                  value={opt.value}
                  onChange={(e) => {
                    const next = [...(field.options ?? [])];
                    next[i] = { ...next[i], value: e.target.value };
                    onChange({ ...field, options: next });
                  }}
                />
                <input
                  className="flex-1 rounded border px-2 py-1 text-sm"
                  placeholder="label"
                  value={opt.label}
                  onChange={(e) => {
                    const next = [...(field.options ?? [])];
                    next[i] = { ...next[i], label: e.target.value };
                    onChange({ ...field, options: next });
                  }}
                />
                <button
                  onClick={() => onChange({ ...field, options: (field.options ?? []).filter((_, j) => j !== i) })}
                  className="text-xs text-red-600"
                >×</button>
              </div>
            ))}
            <button
              onClick={() => onChange({ ...field, options: [...(field.options ?? []), { value: "", label: "" }] })}
              className="text-xs text-slate-600 hover:underline"
            >+ Add option</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentEditor({
  doc,
  onChange,
  onRemove,
}: {
  doc: DocReq;
  onChange: (d: DocReq) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline">Remove</button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <TextInput label="Document key" value={doc.key} onChange={(v) => onChange({ ...doc, key: v })} />
        <TextInput label="Label" value={doc.label} onChange={(v) => onChange({ ...doc, label: v })} />
        <TextInput label="Accepted types" value={doc.accept} onChange={(v) => onChange({ ...doc, accept: v })} />
        <TextInput
          label="Max size (MB)"
          type="number"
          value={String(doc.max_size_mb)}
          onChange={(v) => onChange({ ...doc, max_size_mb: Number(v) || 5 })}
        />
        <TextInput label="Help text" value={doc.help ?? ""} onChange={(v) => onChange({ ...doc, help: v })} />
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={doc.required} onChange={(e) => onChange({ ...doc, required: e.target.checked })} />
          Required
        </label>
      </div>
    </div>
  );
}

function StatusEditor({
  step,
  index,
  onChange,
  onRemove,
  onMove,
}: {
  step: Status;
  index: number;
  onChange: (s: Status) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex justify-between">
        <div className="text-xs text-slate-500">Step {index + 1}</div>
        <div className="flex gap-2">
          <button onClick={() => onMove(-1)} className="text-xs text-slate-500 hover:text-slate-900">↑</button>
          <button onClick={() => onMove(1)} className="text-xs text-slate-500 hover:text-slate-900">↓</button>
          <button onClick={onRemove} className="text-xs text-red-600 hover:underline">Remove</button>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <TextInput label="Status key" value={step.key} onChange={(v) => onChange({ ...step, key: v })} />
        <TextInput label="Label" value={step.label} onChange={(v) => onChange({ ...step, label: v })} />
        <label className="block text-sm">
          <div className="text-xs text-slate-500 mb-1">Color</div>
          <select
            value={step.color ?? ""}
            onChange={(e) => onChange({ ...step, color: e.target.value || null })}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">(none)</option>
            <option value="amber">Amber</option>
            <option value="blue">Blue</option>
            <option value="green">Green</option>
            <option value="red">Red</option>
            <option value="slate">Slate</option>
          </select>
        </label>
        <TextInput
          label="SLA hours"
          type="number"
          value={step.sla_hours == null ? "" : String(step.sla_hours)}
          onChange={(v) => onChange({ ...step, sla_hours: v === "" ? null : Number(v) })}
        />
        <TextInput label="Description" value={step.description ?? ""} onChange={(v) => onChange({ ...step, description: v })} />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={step.is_terminal}
            onChange={(e) => onChange({ ...step, is_terminal: e.target.checked })}
          />
          Terminal step
        </label>
      </div>
    </div>
  );
}
