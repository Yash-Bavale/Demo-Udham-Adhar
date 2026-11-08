import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Eye, Download, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getFormSubmissionForLead } from "@/lib/crm/submissions-admin.functions";
import { getDocumentSignedUrl } from "@/lib/onboarding/onboarding.functions";
import { getSchema } from "@/lib/onboarding/schemas";
import { formatIST, formatDateDMY } from "@/lib/datetime";
import { PlantsView } from "./FormSubmissionPanel";

const fmtIST = (iso?: string | null) => formatIST(iso);

function renderCell(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "plants" && typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr) && arr.length) {
        return arr.map((p: any, i: number) => {
          const line = [p.unit_name, p.address_flat, p.address_premises, p.address_village, p.address_road, p.city, p.district, p.state, p.pincode]
            .filter((x) => x && String(x).trim()).join(", ");
          return `#${i + 1}: ${line || "(empty)"}`;
        }).join("\n");
      }
    } catch {}
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateDMY(v);
  return String(v);
}


type SectionGroup = { label: string; fields: { key: string; label: string; type?: string }[] };

function groupFields(serviceCode: string | null): SectionGroup[] {
  if (!serviceCode) return [];
  const schema = getSchema(serviceCode);
  if (!schema) return [];
  const groups: SectionGroup[] = [];
  let current: SectionGroup = { label: "Details", fields: [] };
  for (const f of schema.fields) {
    if (f.type === "section") {
      if (current.fields.length) groups.push(current);
      current = { label: f.label, fields: [] };
    } else {
      current.fields.push({ key: f.key, label: f.label, type: f.type });
    }
  }
  if (current.fields.length) groups.push(current);
  return groups;
}

export function LeadFormSubmissionInline({ leadId }: { leadId: string }) {
  const getFn = useServerFn(getFormSubmissionForLead);
  const urlFn = useServerFn(getDocumentSignedUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.leadFormSubmission", leadId],
    queryFn: () => getFn({ data: { leadId } }),
    staleTime: 60_000,
  });

  const handleOpenDoc = async (id: string, mode: "preview" | "download" = "preview") => {
    try {
      const { url } = await urlFn({ data: { id } });
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = url; a.download = ""; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open document");
    }
  };

  if (isLoading) return <div className="px-4 py-3 text-xs text-slate-500">Loading form…</div>;
  if (!data) return <div className="px-4 py-3 text-xs text-slate-500">No data.</div>;

  const { submission, documents, requiredDocs, serviceCode } = data as any;
  const sections = groupFields(serviceCode);
  const formData: Record<string, any> = submission?.form_data ?? {};
  const renderedKeys = new Set(sections.flatMap((s) => s.fields.map((f) => f.key)));
  const extras = Object.keys(formData).filter((k) => !renderedKeys.has(k));

  const uploadedByType = new Map(documents.map((d: any) => [d.doc_type, d]));
  const missingRequired = (requiredDocs ?? []).filter((r: any) => r.required && !uploadedByType.has(r.key));

  return (
    <div className="border-t bg-slate-50/60" style={{ borderColor: "var(--admin-border)" }}>
      <div className="px-4 py-3 flex items-center gap-2 text-xs">
        <FileText className="size-3.5 text-slate-600" />
        <span className="font-semibold text-slate-700">Form Submission</span>
        {submission ? (
          <>
            <span className={
              "rounded-full px-2 py-0.5 font-medium border " +
              (submission.status === "submitted"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200")
            }>{submission.status}</span>
            <span className="text-slate-500">· {fmtIST(submission.submitted_at ?? submission.updated_at)}</span>
          </>
        ) : (
          <span className="rounded-full px-2 py-0.5 font-medium border bg-slate-100 text-slate-600 border-slate-200">
            not submitted
          </span>
        )}
      </div>

      {submission ? (
        <div className="divide-y bg-white">
          {sections.map((section) => {
            const visible = section.fields.filter((f) => {
              const v = formData[f.key];
              return v !== undefined && v !== null && String(v).trim() !== "";
            });
            if (!visible.length) return null;
            return (
              <div key={section.label} className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  {section.label}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {visible.map((f) => {
                    if (f.type === "plants" || f.key === "plants") {
                      return (
                        <div key={f.key} className="col-span-1 sm:col-span-2">
                          <span className="text-[10px] text-slate-400 block mb-1">{f.label}</span>
                          <PlantsView value={formData[f.key]} />
                        </div>
                      );
                    }
                    return (
                      <div key={f.key} className="flex flex-col min-w-0">
                        <span className="text-[10px] text-slate-400">{f.label}</span>
                        <span className="text-xs text-slate-800 font-medium mt-0.5 break-words whitespace-pre-line">
                          {renderCell(f.key, formData[f.key])}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {extras.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Other</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {extras.map((k) => (
                  <div key={k} className="flex flex-col min-w-0">
                    <span className="text-[10px] text-slate-400">{k.replace(/_/g, " ")}</span>
                    <span className="text-xs text-slate-800 font-medium mt-0.5 break-words whitespace-pre-line">
                      {renderCell(k, formData[k])}
                    </span>

                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs text-amber-800 bg-amber-50 border-t border-amber-200">
          Customer hasn't opened or filled the form yet.
        </div>
      )}

      <div className="px-4 py-3 border-t bg-white" style={{ borderColor: "var(--admin-border)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Documents</p>
          <span className="text-[11px] text-slate-500">
            {requiredDocs.length > 0
              ? `${documents.length} of ${requiredDocs.length} expected`
              : `${documents.length} uploaded`}
          </span>
        </div>
        {requiredDocs.length === 0 && documents.length === 0 && (
          <div className="text-xs text-slate-500">No documents.</div>
        )}
        {requiredDocs.length > 0 && (
          <ul className="space-y-1">
            {requiredDocs.map((req: any) => {
              const u = uploadedByType.get(req.key) as any;
              return (
                <li key={req.key} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {u ? <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" /> : <XCircle className="size-3.5 text-red-400 shrink-0" />}
                    <span className="text-xs text-slate-700 truncate">{req.label}</span>
                    {!req.required && <span className="text-[10px] text-slate-400 shrink-0">(optional)</span>}
                  </div>
                  {u ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-500 truncate max-w-[140px]" title={u.file_name}>{u.file_name}</span>
                      <button onClick={() => handleOpenDoc(u.id, "preview")} className="text-slate-500 hover:text-slate-900" title="Preview"><Eye className="size-3.5" /></button>
                      <button onClick={() => handleOpenDoc(u.id, "download")} className="text-slate-500 hover:text-slate-900" title="Download"><Download className="size-3.5" /></button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">—</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {documents
          .filter((d: any) => !requiredDocs.some((r: any) => r.key === d.doc_type))
          .map((d: any) => (
            <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs text-slate-700 truncate">{d.doc_type.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-slate-400 shrink-0">(extra)</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-slate-500 truncate max-w-[140px]" title={d.file_name}>{d.file_name}</span>
                <button onClick={() => handleOpenDoc(d.id, "preview")} className="text-slate-500 hover:text-slate-900" title="Preview"><Eye className="size-3.5" /></button>
                <button onClick={() => handleOpenDoc(d.id, "download")} className="text-slate-500 hover:text-slate-900" title="Download"><Download className="size-3.5" /></button>
              </div>
            </div>
          ))}
        {missingRequired.length > 0 && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <div><b>{missingRequired.length} missing:</b> {missingRequired.map((m: any) => m.label).join(", ")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
