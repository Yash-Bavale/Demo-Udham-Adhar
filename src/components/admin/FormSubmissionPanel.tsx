import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { mintCustomerLink } from "@/lib/security/customer-access.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Mail,
  Eye,
  Download,
  Loader2,
  FileText,
  AlertTriangle,
  StickyNote,
  ExternalLink,
  Layers,
} from "lucide-react";
import { CallButton } from "@/components/admin/telephony/CallButton";
import { MergeDocumentsDialog } from "@/components/admin/MergeDocumentsDialog";
import {
  getFormSubmissionForApplication,
  resendFormLink,
} from "@/lib/crm/submissions-admin.functions";
import { getDocumentSignedUrl } from "@/lib/onboarding/onboarding.functions";
import { getSchema, isFieldVisible } from "@/lib/onboarding/schemas";
import { parseNicActivities, promoteNicActivities } from "@/lib/onboarding/nic-fill";
import { Button } from "@/components/ui/button";
import { formatIST, formatDateDMY } from "@/lib/datetime";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { formatMobile55 } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";

// Sensitive numbers (Aadhaar, bank account) are shown in full to staff —
// masking was removed per business decision so operations can verify values.
type PlantItem = {
  unit_name?: string;
  address_flat?: string;
  address_premises?: string;
  address_village?: string;
  address_block?: string;
  address_road?: string;
  city?: string;
  pincode?: string;
  state?: string;
  district?: string;
};

export function parsePlantsData(raw: unknown): PlantItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as PlantItem[];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === "object" && parsed !== null) return [parsed];
      } catch {}
    }
  }
  return [];
}

export function PlantsView({ value }: { value: unknown }) {
  const items = parsePlantsData(value);

  if (items.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic py-1">
        No additional plant / unit address added (Main enterprise address used)
      </div>
    );
  }

  return (
    <div className="space-y-4 col-span-1 sm:col-span-2 w-full my-1">
      {items.map((item, idx) => {
        const fields = [
          { label: "Unit / Plant Name", val: item.unit_name },
          { label: "Flat / Door / Block No.", val: item.address_flat },
          { label: "Name of Premises / Building", val: item.address_premises },
          { label: "Village / Town", val: item.address_village },
          { label: "Block", val: item.address_block },
          { label: "Road / Street / Lane", val: item.address_road },
          { label: "City", val: item.city },
          { label: "PIN Code", val: item.pincode },
          { label: "State", val: item.state },
          { label: "District", val: item.district },
        ].filter((f) => f.val && String(f.val).trim() !== "");

        return (
          <div
            key={idx}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Plant / Unit #{idx + 1}
                {item.unit_name ? ` — ${item.unit_name}` : ""}
              </span>
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                Unit Address
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 pt-1">
              {fields.map((f) => (
                <div key={f.label} className="flex flex-col min-w-0">
                  <span className="text-[11px] text-blue-600 font-medium">
                    {f.label}
                  </span>
                  <span className="text-sm text-slate-800 font-semibold mt-0.5 break-words">
                    {f.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function mask(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  // Plants (repeater) come in as a JSON-stringified array.
  if (field === "plants" && typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr) && arr.length) {
        return arr
          .map((p: any, i: number) => {
            const line = [
              p.unit_name,
              p.address_flat,
              p.address_premises,
              p.address_village,
              p.address_road,
              p.city,
              p.district,
              p.state,
              p.pincode,
            ].filter((x) => x && String(x).trim()).join(", ");
            return `#${i + 1}: ${line || "(empty)"}`;
          })
          .join("\n");
      }
    } catch { /* fall through */ }
  }
  // ISO date → DD/MM/YYYY
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateDMY(value);
  }
  const v = String(value);
  return v || "—";
}


type FieldItem = {
  key: string;
  label: string;
  type?: string;
  help?: string;
  default?: string;
  placeholder?: string;
};
type SectionGroup = { label: string; fields: FieldItem[] };

function groupFieldsBySection(serviceCode: string | null, activeSchema?: any): SectionGroup[] {
  let fields: any[] = [];
  let sectionsFromSchema: any[] = [];

  if (activeSchema?.sections?.length) {
    sectionsFromSchema = activeSchema.sections;
  } else {
    const fallback = serviceCode ? getSchema(serviceCode) : null;
    if (fallback?.fields) fields = fallback.fields;
  }

  if (sectionsFromSchema.length) {
    return sectionsFromSchema.map((sec: any) => ({
      label: sec.label || "Details",
      fields: (sec.fields || []).map((f: any) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        help: f.help,
        default: f.default,
        placeholder: f.placeholder,
      })),
    }));
  }

  if (!fields.length) return [];
  const groups: SectionGroup[] = [];
  let current: SectionGroup = { label: "Details", fields: [] };
  for (const f of fields) {
    if (f.type === "section") {
      if (current.fields.length) groups.push(current);
      current = { label: f.label, fields: [] };
    } else {
      current.fields.push({
        key: f.key,
        label: f.label,
        type: f.type,
        help: f.help,
        default: f.default,
        placeholder: f.placeholder,
      });
    }
  }
  if (current.fields.length) groups.push(current);
  return groups;
}

export function FormSubmissionPanel({
  applicationId,
  isLocked = false,
  orderId,
}: {
  applicationId: string;
  isLocked?: boolean;
  /** When provided, sending / resending the form link refreshes the workspace. */
  orderId?: string;
}) {
  const qc = useQueryClient();
  const role = useRole();
  const userPerms = usePermissions();
  const getFn = useServerFn(getFormSubmissionForApplication);
  const resendFn = useServerFn(resendFormLink);
  const urlFn = useServerFn(getDocumentSignedUrl);
  const [resending, setResending] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin.formSubmission", applicationId],
    queryFn: () => getFn({ data: { applicationId } }),
  });

  const isSuperAdmin =
    Boolean((data as any)?.isSuperAdmin) ||
    Boolean((data as any)?.isAdmin) ||
    role.hasAny(["super_admin", "admin", "superadmin", "super"]) ||
    Boolean(userPerms.perms?.isAdmin);

  // Live-refresh whenever the customer's auto-save writes to the draft, or
  // uploads/removes a document for this application. Keeps the panel in sync
  // without a manual refresh.
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin.formSubmission", applicationId] });
  useRealtimeTable("onboarding_submissions", invalidate, {
    filter: `application_id=eq.${applicationId}`,
  });
  useRealtimeTable("documents", invalidate, {
    filter: `application_id=eq.${applicationId}`,
  });

  const handleCopyFormLink = async () => {
    const leadCode = data?.lead?.lead_code;
    if (!leadCode) {
      toast.error("Form link not available (missing lead code)");
      return;
    }
    let formLink: string;
    try {
      formLink = (await mintCustomerLink({ data: { leadCode, kind: "form" } })).url;
    } catch {
      toast.error("Could not create a secure form link");
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(formLink);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = formLink;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      toast.success("Form link copied to clipboard");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to copy form link");
    }
  };

  const handleResend = async () => {
    if (!data?.lead?.id) return;
    if (isLocked) { toast.error("Order is completed — form link is disabled."); return; }
    setResending(true);
    try {
      const res = await resendFn({ data: { leadId: data.lead.id } });
      toast.success(`Form link sent to ${res.email}`);
      qc.invalidateQueries({ queryKey: ["admin.formSubmission", applicationId] });
      if (orderId) qc.invalidateQueries({ queryKey: ["admin.order", orderId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setResending(false);
    }
  };

  const handleOpenDoc = async (id: string, mode: "preview" | "download" = "preview") => {
    try {
      const { url } = await urlFn({ data: { id } });
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open document");
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-slate-500">
        Loading form submission…
      </div>
    );
  }
  if (!data) return null;

  const { submission, documents, requiredDocs, serviceCode, lead, service, activeSchema } = data as any;
  const mergeEnabled = !!activeSchema?.meta?.enable_document_merge;
  const serviceLabel: string =
    (service?.service_name as string) || (lead?.service as string) || serviceCode || "Service";

  const isDraft = !!submission && (submission.status !== "submitted" || !submission.submitted_at);

  // Use the configured custom form when present, so required/visibility rules
  // match exactly what the customer saw. Hidden (branched-away) fields are never required.
  const customFields: any[] = activeSchema?.sections?.length
    ? activeSchema.sections.flatMap((s: any) => s.fields ?? [])
    : [];
  const schemaFields: any[] = customFields.length
    ? customFields
    : (serviceCode ? getSchema(serviceCode)?.fields ?? [] : []);
  const answerValues: Record<string, unknown> = submission?.form_data ?? {};
  const visibleKeys = new Set(
    schemaFields.filter((f: any) => isFieldVisible(f, schemaFields, answerValues)).map((f: any) => f.key),
  );
  const requiredFields = schemaFields.filter(
    (f: any) => f.required && f.type !== "section" && f.type !== "note" && visibleKeys.has(f.key),
  );
  const requiredKeys = new Set(requiredFields.map((f: any) => f.key));
  const isBlank = (v: any) =>
    v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  const missingRequiredFields = submission
    ? requiredFields.filter((f: any) => isBlank((submission.form_data ?? {})[f.key]))
    : requiredFields;

  // Build a "submitted" status pill
  const statusPill = submission ? (
    <span
      className={
        "text-[11px] rounded-full px-2 py-0.5 font-medium border " +
        (isDraft
          ? "bg-amber-100 text-amber-800 border-amber-300"
          : "bg-emerald-50 text-emerald-700 border-emerald-200")
      }
    >
      {isDraft ? "DRAFT — not submitted" : "submitted"}
    </span>
  ) : (
    <span className="text-[11px] rounded-full px-2 py-0.5 font-medium border bg-slate-100 text-slate-600 border-slate-200">
      not submitted
    </span>
  );

  const sections = groupFieldsBySection(serviceCode, activeSchema);
  const formData: Record<string, any> = promoteNicActivities(submission?.form_data ?? {});
  const additionalNicActivities = parseNicActivities(typeof formData.nic_activities === "string" ? formData.nic_activities : "");
  const renderedKeys = new Set(sections.flatMap((s) => s.fields.map((f) => f.key)));
  const extras = Object.keys(formData).filter((k) => {
    if (renderedKeys.has(k) || k === "nic_activities") return false;
    if (k.startsWith("section_")) return false; // UI separator garbage
    const v = formData[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return true;
  });

  // Documents matching
  const uploadedByType = new Map(documents.map((d: any) => [d.doc_type, d]));
  const matchedRequired = requiredDocs.length ? requiredDocs : [];
  const missingRequired = matchedRequired.filter(
    (r: any) => r.required && !uploadedByType.has(r.key),
  );


  return (
    <>
      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: "var(--admin-border, #e5e7eb)" }}>
        {/* Unified header: customer identity + service/state chips + call */}
        <div className="px-5 py-3 border-b bg-gradient-to-r from-indigo-50/50 via-cyan-50/30 to-white flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap text-base md:text-lg">
            <span className="text-slate-500 font-medium">Customer:</span>
            <span className="text-slate-900 font-bold">{lead?.name ?? "—"}</span>
            {lead?.mobile && (
              <>
                <span className="text-slate-300 font-light mx-1">•</span>
                <span className="text-slate-500 font-medium">Mobile:</span>
                <span className="text-slate-900 font-bold font-mono">{formatMobile55(lead.mobile)}</span>
              </>
            )}
            <CallButton
              mobile={lead?.mobile ?? null}
              customerId={(data as any)?.application?.customer_id ?? null}
              leadId={lead?.id ?? null}
              applicationId={applicationId}
              label="Call Customer"
              compact
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lead?.id && isSuperAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyFormLink}
                className="h-8 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50"
                title="Copy customer onboarding form link"
              >
                {copiedLink ? (
                  <Check className="size-3.5 mr-1.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5 mr-1.5" />
                )}
                {copiedLink ? "Copied Form Link" : "Copy Form Link"}
              </Button>
            )}

            {lead?.id && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleResend}
                disabled={resending || isLocked}
                className="h-8 text-xs font-medium"
                title={isLocked ? "Order is completed — form link is disabled" : undefined}
              >
                {resending ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Mail className="size-3.5 mr-1.5" />
                )}
                Send form link on Email
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              disabled={!service?.govt_portal_url}
              className="h-8 text-xs border-indigo-100 text-indigo-700 hover:bg-indigo-50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={service?.govt_portal_url ? "Open the government portal for this service" : "No government portal URL configured"}
              onClick={() => {
                if (service?.govt_portal_url) {
                  window.open(service.govt_portal_url, "_blank", "noopener,noreferrer");
                } else {
                  toast.error("No government portal URL set for this service");
                }
              }}
            >
              <ExternalLink className="size-3.5 mr-1.5" /> Govt. Portal
            </Button>
          </div>
        </div>
        {/* Header */}
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="size-4 text-slate-600 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-base md:text-lg">
                <span className="text-slate-500 font-medium">Service Name:</span>
                <span className="text-slate-900 font-bold break-words">{serviceLabel}</span>
                {lead?.state && (
                  <>
                    <span className="text-slate-300 font-light mx-1">•</span>
                    <span className="text-slate-500 font-medium">State:</span>
                    <span className="text-slate-900 font-bold">{lead.state}</span>
                  </>
                )}
              </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {submission ? (
                isDraft ? (
                  <>Auto-saved draft at {formatIST(submission.updated_at)} — customer has NOT pressed Submit.</>
                ) : (
                  <>Submitted {formatIST(submission.submitted_at ?? submission.updated_at)}</>
                )
              ) : (
                <>Customer hasn't submitted the service form yet.</>
              )}
            </p>

          </div>
          {statusPill}
        </div>

      </div>

      {isLocked && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
          This order is closed (completed or cancelled). The customer form link is disabled and won't be resent.
        </div>
      )}

      {/* Body */}
      {!submission ? (
        <div className="p-5">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            The customer has not opened or filled the onboarding form yet. Use
            <b className="mx-1">Resend form link</b> or share the copy-link with them on WhatsApp.
          </div>
        </div>
      ) : (
        <>
          {isDraft && (
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    Customer started filling this form but did NOT submit it.
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    The values below are an auto-saved draft. Required fields validated only run on
                    final submit, so this draft can be incomplete. Use <b>Resend form link</b> or
                    WhatsApp them the copy-link to get them to complete the form.
                  </p>
                  {missingRequiredFields.length > 0 && (
                    <div className="mt-2 text-xs text-amber-900">
                      <b>{missingRequiredFields.length} required field{missingRequiredFields.length > 1 ? "s" : ""} still empty:</b>{" "}
                      {missingRequiredFields.map((f: any) => f.label).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="divide-y">
            {sections.map((section) => {
              if (!section.fields.length) return null;
              return (
                <div key={section.label} className="px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    {section.label}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    {section.fields.map((f) => {
                      if (schemaFields.length && !visibleKeys.has(f.key) && schemaFields.some((x: any) => x.key === f.key)) return null;
                      if (f.type === "note") {
                        const noteText = (f.help || f.default || f.placeholder || f.label || "").trim();
                        return (
                          <div
                            key={f.key}
                            className="col-span-1 sm:col-span-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/90 via-amber-50/50 to-orange-50/30 p-4 space-y-2.5 shadow-sm my-1"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 font-semibold text-xs text-amber-900 uppercase tracking-wide">
                                <StickyNote className="size-4 text-amber-600 shrink-0" />
                                <span>{f.label || "Internal Staff Note"}</span>
                                <span className="text-[10px] text-amber-800 font-semibold border border-amber-300 bg-amber-100/90 px-2 py-0.5 rounded-md">
                                  Staff Note
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-medium shadow-none"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(noteText);
                                    toast.success("Note copied to clipboard");
                                  } catch {
                                    toast.error("Failed to copy note");
                                  }
                                }}
                              >
                                <Copy className="size-3 mr-1.5" /> Copy Note
                              </Button>
                            </div>
                            <p className="text-xs md:text-sm text-slate-800 font-normal whitespace-pre-line leading-relaxed bg-white/90 p-3 rounded-lg border border-amber-200/80 font-mono">
                              {noteText || "No note content provided."}
                            </p>
                          </div>
                        );
                      }
                      const v = formData[f.key];
                      const required = requiredKeys.has(f.key);
                      const blank = isBlank(v);
                      if (f.type === "plants" || f.key === "plants") {
                        return (
                          <div key={f.key} className="col-span-1 sm:col-span-2">
                            <span className="text-[11px] text-blue-600 select-none font-medium mb-1.5 block">
                              {f.label}
                            </span>
                            <PlantsView value={v} />
                          </div>
                        );
                      }
                      return (
                        <div key={f.key} className="flex flex-col min-w-0">
                          <span className="text-[11px] text-blue-600 select-none font-medium">
                            {f.label}
                            {required && <span className="text-red-500 ml-0.5">*</span>}
                          </span>
                          {required && blank ? (
                            <span className="text-sm font-semibold text-red-600 mt-0.5 inline-flex items-center gap-1">
                              <AlertTriangle className="size-3.5" /> Required — empty
                            </span>
                          ) : (
                            <span className="text-sm text-slate-800 font-medium mt-0.5 break-words whitespace-pre-line">
                              {mask(f.key, v)}
                            </span>
                          )}

                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}



            {additionalNicActivities.length > 0 && (
              <div className="px-5 py-4 border-t">
                <p className="text-[11px] font-semibold uppercase text-slate-500 mb-3">Additional NIC activities</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[550px] text-sm text-left">
                    <thead><tr className="border-b"><th className="p-2">No.</th><th className="p-2">NIC 2 Digit</th><th className="p-2">NIC 4 Digit</th><th className="p-2">NIC 5 Digit</th><th className="p-2">Activity Type</th></tr></thead>
                    <tbody>{additionalNicActivities.map((item, index) => (
                      <tr key={`${item.nic_5_digit}-${index}`} className="border-b last:border-0">
                        <td className="p-2">{index + 2}</td><td className="p-2">{item.nic_2_digit}</td><td className="p-2">{item.nic_4_digit}</td><td className="p-2">{item.nic_5_digit}</td><td className="p-2">{item.activity_type}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            {extras.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Other fields
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {extras.map((k) => (
                    <div key={k} className="flex flex-col min-w-0">
                      <span className="text-[11px] text-blue-600 select-none font-medium">
                        {k.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm text-slate-800 font-medium mt-0.5 break-words">
                        {mask(k, formData[k])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Documents */}
      <div className="px-5 py-4 border-t bg-white">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Documents Uploaded
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {matchedRequired.length > 0
                ? `${documents.length} of ${matchedRequired.length} expected`
                : `${documents.length} uploaded`}
            </span>
            {mergeEnabled && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMergeOpen(true)} disabled={documents.length === 0}>
                <Layers className="size-3.5 mr-1" /> Merge PDF
              </Button>
            )}
          </div>
        </div>
        {mergeEnabled && (
          <MergeDocumentsDialog
            open={mergeOpen}
            onOpenChange={setMergeOpen}
            applicationId={applicationId}
            applicationCode={(data as any)?.application?.application_code ?? null}
            documents={documents.map((d: any) => ({
              id: d.id,
              doc_type: d.doc_type,
              file_name: d.file_name,
              mime_type: d.mime_type,
              label: matchedRequired.find((r: any) => r.key === d.doc_type)?.label ?? String(d.doc_type).replace(/_/g, " "),
            }))}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["admin.formSubmission", applicationId] });
              if (orderId) qc.invalidateQueries({ queryKey: ["admin.order", orderId] });
            }}
          />
        )}

        {matchedRequired.length === 0 && documents.length === 0 && (
          <div className="text-sm text-slate-500">No documents required or uploaded.</div>
        )}

        {matchedRequired.length > 0 && (
          <ul className="space-y-1.5">
            {matchedRequired.map((req: any) => {
              const u = uploadedByType.get(req.key) as any;
              return (
                <li
                  key={req.key}
                  className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {u ? (
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="size-4 text-red-400 shrink-0" />
                    )}
                    <span className="text-sm text-slate-700 truncate">{req.label}</span>
                    {!req.required && (
                      <span className="text-[10px] text-slate-400 shrink-0">(optional)</span>
                    )}
                  </div>
                  {u ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className="text-[11px] text-slate-500 truncate max-w-[160px]"
                        title={u.file_name}
                      >
                        {u.file_name}
                      </span>
                      <button
                        onClick={() => handleOpenDoc(u.id, "preview")}
                        className="text-slate-500 hover:text-slate-900"
                        title="Preview"
                      >
                        <Eye className="size-4" />
                      </button>
                      <button
                        onClick={() => handleOpenDoc(u.id, "download")}
                        className="text-slate-500 hover:text-slate-900"
                        title="Download"
                      >
                        <Download className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400">—</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Show any uploaded docs that aren't in the required list */}
        {documents
          .filter((d: any) => !matchedRequired.some((r: any) => r.key === d.doc_type))
          .map((d: any) => (
            <div
              key={d.id}
              className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                <span className="text-sm text-slate-700 truncate">
                  {d.doc_type.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0">(extra)</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className="text-[11px] text-slate-500 truncate max-w-[160px]"
                  title={d.file_name}
                >
                  {d.file_name}
                </span>
                <button
                  onClick={() => handleOpenDoc(d.id, "preview")}
                  className="text-slate-500 hover:text-slate-900"
                  title="Preview"
                >
                  <Eye className="size-4" />
                </button>
                <button
                  onClick={() => handleOpenDoc(d.id, "download")}
                  className="text-slate-500 hover:text-slate-900"
                  title="Download"
                >
                  <Download className="size-4" />
                </button>
              </div>
            </div>
          ))}

        {missingRequired.length > 0 && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <b>{missingRequired.length} required document(s) still missing:</b>{" "}
              {missingRequired.map((m: any) => m.label).join(", ")}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

