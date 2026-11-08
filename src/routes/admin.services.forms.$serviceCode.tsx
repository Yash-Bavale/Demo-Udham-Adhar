import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Eye, Save, History,
  Type, Mail, Phone, Hash, Calendar, ChevronDown, AlignLeft, Layers,
  Building2, FileText, Search, Copy, X, CheckCircle2, Settings2, MapPin, StickyNote, CheckSquare,
  Upload, Loader2,
} from "lucide-react";
import {
  getBuilderSchema,
  getBuilderSchemaVersion,
  saveBuilderSchema,
  listCopyableForms,
  type BuilderSaveInput,
} from "@/lib/crm/form-builder.functions";
import { getSchema as getFallbackSchema, withSectionHeadings } from "@/lib/onboarding/schemas";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export const Route = createFileRoute("/admin/services/forms/$serviceCode")({
  head: () => ({ meta: [
    { title: "Service Form Builder — Business Help Services" },
    { name: "description", content: "Configure service application questions and document requirements." },
    { property: "og:title", content: "Service Form Builder — Business Help Services" },
    { property: "og:description", content: "Configure service application questions and document requirements." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: FormBuilderPage,
});

type Field = BuilderSaveInput["sections"][number]["fields"][number];
type Section = BuilderSaveInput["sections"][number];
type Doc = BuilderSaveInput["documents"][number];

const FIELD_META: Record<Field["type"], { label: string; icon: typeof Type; hint: string }> = {
  text:     { label: "Short text",   icon: Type,      hint: "Single-line text input" },
  email:    { label: "Email",        icon: Mail,      hint: "Validated email address" },
  tel:      { label: "Phone",        icon: Phone,     hint: "Indian 10-digit mobile" },
  number:   { label: "Number",       icon: Hash,      hint: "Numeric input" },
  date:     { label: "Date",         icon: Calendar,  hint: "Date picker" },
  select:   { label: "Dropdown",     icon: ChevronDown, hint: "Choose one from a list" },
  textarea: { label: "Long text",    icon: AlignLeft, hint: "Multi-line notes" },
  nic:      { label: "NIC code",     icon: Layers,    hint: "Business activity NIC picker" },
  plants:   { label: "Plants/Units", icon: Building2, hint: "Repeating plants section" },
  section:  { label: "Section",      icon: FileText,  hint: "Group a set of fields" },
  state:    { label: "State",        icon: MapPin,    hint: "Indian state dropdown" },
  district: { label: "District",     icon: MapPin,    hint: "District dropdown linked to state" },
  note:     { label: "Note",         icon: StickyNote, hint: "Staff internal note (hidden from customer)" },
  checkbox: { label: "Checkbox",     icon: CheckSquare, hint: "Tick box (Yes when ticked)" },
};

const FIELD_TYPES = Object.keys(FIELD_META) as Field["type"][];

const NEW_FIELD: Record<Field["type"], () => Field> = {
  text:     () => ({ key: newKey("field"),   label: "New text field", type: "text" }),
  email:    () => ({ key: newKey("email"),   label: "Email",          type: "email" }),
  tel:      () => ({ key: newKey("mobile"),  label: "Mobile",         type: "tel", pattern: "^[6-9]\\d{9}$" }),
  number:   () => ({ key: newKey("number"),  label: "Number",         type: "number" }),
  date:     () => ({ key: newKey("date"),    label: "Date",           type: "date" }),
  select:   () => ({ key: newKey("select"),  label: "Select",         type: "select", options: ["Option 1", "Option 2"] }),
  textarea: () => ({ key: newKey("notes"),   label: "Notes",          type: "textarea" }),
  nic:      () => ({ key: "nic_5_digit", label: "NIC 5 Digit Code", type: "nic", nicDigits: 5, activityFrom: "major_activity" }),
  plants:   () => ({ key: newKey("plants"),  label: "Plants / Units", type: "plants" }),
  section:  () => ({ key: newKey("section"), label: "Section header", type: "section" }),
  state:    () => ({ key: "state",           label: "State",          type: "state" }),
  district: () => ({ key: "district",        label: "District",       type: "district" }),
  note:     () => ({ key: newKey("note"),    label: "Staff Note",     type: "note", help: "Internal note text for staff" }),
  checkbox: () => ({ key: newKey("check"),   label: "Checkbox",       type: "checkbox" }),
};

function newKey(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 7)}`;
}
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "field";
}

function FormBuilderPage() {
  const { serviceCode } = Route.useParams();
  const loadFn = useServerFn(getBuilderSchema);
  const saveFn = useServerFn(saveBuilderSchema);
  const loadVersionFn = useServerFn(getBuilderSchemaVersion);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["builder", serviceCode],
    queryFn: () => loadFn({ data: { service_code: serviceCode } }),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sampleFormUrl, setSampleFormUrl] = useState("");
  const [sampleFormLabel, setSampleFormLabel] = useState("");
  const [enableMerge, setEnableMerge] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [activeSection, setActiveSection] = useState(0);
  const [selected, setSelected] = useState<{ s: number; f: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [tab, setTab] = useState<"fields" | "documents">("fields");
  const [paletteQuery, setPaletteQuery] = useState("");

  useEffect(() => {
    if (!data) return;
    const active = data.active;
    if (active) {
      setTitle(active.title || "");
      setDescription(active.description || "");
      setDocuments(Array.isArray(active.documents) ? (active.documents as Doc[]) : []);
      const schemaAny = active.schema as { sections?: Section[]; fields?: Field[]; meta?: { sample_form_url?: string | null; sample_form_label?: string | null } } | null;
      setSampleFormUrl(schemaAny?.meta?.sample_form_url ?? "");
      setSampleFormLabel(schemaAny?.meta?.sample_form_label ?? "");
      setEnableMerge(!!(schemaAny?.meta as { enable_document_merge?: boolean } | undefined)?.enable_document_merge);
      if (schemaAny?.sections?.length) setSections(schemaAny.sections);
      else if (schemaAny?.fields?.length) setSections(flatFieldsToSections(schemaAny.fields));
      else setSections([{ key: "default", label: "Details", fields: [] }]);
    } else {
      const fb = getFallbackSchema(serviceCode);
      setTitle(fb.title);
      setDescription(fb.description);
      setSampleFormUrl(fb.sample_form_url ?? "");
      setSampleFormLabel(fb.sample_form_label ?? "");
      setEnableMerge(false);
      setDocuments(fb.documents.map((d) => ({ key: d.key, label: d.label, required: d.required, help: d.help, sample_url: d.sample_url, sample_label: d.sample_label })));
      setSections(flatFieldsToSections(fb.fields as unknown as Field[]));
    }
    setActiveSection(0);
  }, [data, serviceCode]);

  const previewSchema = useMemo(() => {
    const fields = withSectionHeadings(sections);
    return {
      title,
      description,
      fields: fields as unknown as ReturnType<typeof getFallbackSchema>["fields"],
      documents: documents as unknown as ReturnType<typeof getFallbackSchema>["documents"],
      sample_form_url: sampleFormUrl || undefined,
      sample_form_label: sampleFormLabel || undefined,
    };
  }, [sections, documents, title, description, sampleFormUrl, sampleFormLabel]);

  const totalFields = useMemo(() => sections.reduce((n, s) => n + s.fields.length, 0), [sections]);
  const currentSection = sections[activeSection];
  const activeField: Field | null =
    selected && sections[selected.s]?.fields[selected.f] ? sections[selected.s].fields[selected.f] : null;

  const filteredPalette = useMemo(
    () => FIELD_TYPES.filter((t) => {
      const m = FIELD_META[t];
      const q = paletteQuery.toLowerCase();
      return !q || m.label.toLowerCase().includes(q) || t.includes(q);
    }),
    [paletteQuery],
  );

  function updateField(patch: Partial<Field>) {
    if (!selected) return;
    setSections((prev) => {
      const copy = prev.map((s) => ({ ...s, fields: [...s.fields] }));
      copy[selected.s].fields[selected.f] = { ...copy[selected.s].fields[selected.f], ...patch };
      if ("visibleIf" in patch && /^nic_[245]_digit$/.test(copy[selected.s].fields[selected.f].key)) {
        copy[selected.s].fields = copy[selected.s].fields.map((field) =>
          /^nic_[245]_digit$/.test(field.key) ? { ...field, visibleIf: patch.visibleIf } : field,
        );
      }
      return copy;
    });
  }
  function moveField(s: number, f: number, dir: -1 | 1) {
    setSections((prev) => {
      const copy = prev.map((sec) => ({ ...sec, fields: [...sec.fields] }));
      const arr = copy[s].fields;
      const j = f + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[f], arr[j]] = [arr[j], arr[f]];
      return copy;
    });
    if (selected?.s === s && selected.f === f) setSelected({ s, f: f + dir });
  }
  function duplicateField(s: number, f: number) {
    setSections((prev) => {
      const copy = prev.map((sec) => ({ ...sec, fields: [...sec.fields] }));
      const src = copy[s].fields[f];
      copy[s].fields.splice(f + 1, 0, { ...src, key: newKey(src.type) });
      return copy;
    });
  }
  function deleteField(s: number, f: number) {
    setSections((prev) => {
      const copy = prev.map((sec) => ({ ...sec, fields: [...sec.fields] }));
      copy[s].fields.splice(f, 1);
      return copy;
    });
    setSelected(null);
  }
  function addField(s: number, type: Field["type"]) {
    if (type === "section") { addSection(); return; }
    if (type === "nic" && sections.some((section) => section.fields.some((field) => /^nic_[245]_digit$/.test(field.key)))) {
      toast.error("This form already has a NIC activity section.");
      return;
    }
    setSections((prev) => {
      const copy = prev.map((sec) => ({ ...sec, fields: [...sec.fields] }));
      if (type === "nic") {
        copy[s].fields.push(
          { key: "nic_2_digit", label: "NIC 2 Digit Code", type: "nic", nicDigits: 2, activityFrom: "major_activity", required: true },
          { key: "nic_4_digit", label: "NIC 4 Digit Code", type: "nic", nicDigits: 4, activityFrom: "major_activity", required: true },
          { ...NEW_FIELD.nic(), required: true },
        );
      } else copy[s].fields.push(NEW_FIELD[type]());
      return copy;
    });
    setTimeout(() => {
      setSelected({ s, f: sections[s]?.fields.length ?? 0 });
    }, 0);
  }
  function addSection() {
    setSections((prev) => {
      const next = [...prev, { key: `sec_${prev.length + 1}`, label: `New Section ${prev.length + 1}`, fields: [] }];
      setActiveSection(next.length - 1);
      return next;
    });
  }
  function moveSection(s: number, dir: -1 | 1) {
    setSections((prev) => {
      const j = s + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[s], copy[j]] = [copy[j], copy[s]];
      return copy;
    });
    if (activeSection === s) setActiveSection(s + dir);
  }
  function deleteSection(s: number) {
    if (!confirm("Delete this section and all its fields?")) return;
    setSections((prev) => prev.filter((_, i) => i !== s));
    setSelected(null);
    setActiveSection((idx) => Math.max(0, idx - (idx >= s ? 1 : 0)));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await saveFn({
        data: {
          service_code: serviceCode,
          title,
          description,
          sections,
          documents,
          sample_form_url: sampleFormUrl || undefined,
          sample_form_label: sampleFormLabel || undefined,
          enable_document_merge: enableMerge,
        },
      });
      await refetch();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function restoreVersion(id: string) {
    if (!confirm("Load this version into the editor? Save afterwards to publish it as a new version.")) return;
    const { row } = await loadVersionFn({ data: { id } });
    if (!row) return;
    setTitle(row.title || "");
    setDescription(row.description || "");
    setDocuments(Array.isArray(row.documents) ? (row.documents as Doc[]) : []);
    const schemaAny = row.schema as { sections?: Section[]; fields?: Field[]; meta?: { sample_form_url?: string | null; sample_form_label?: string | null } } | null;
    setSampleFormUrl(schemaAny?.meta?.sample_form_url ?? "");
    setSampleFormLabel(schemaAny?.meta?.sample_form_label ?? "");
    setEnableMerge(!!(schemaAny?.meta as { enable_document_merge?: boolean } | undefined)?.enable_document_merge);
    if (schemaAny?.sections?.length) setSections(schemaAny.sections);
    else if (schemaAny?.fields?.length) setSections(flatFieldsToSections(schemaAny.fields));
    setShowHistory(false);
    setActiveSection(0);
  }

  function applyCopy(rawSections: Section[], newDocs: Doc[], mode: "append" | "replace") {
    if (mode === "replace") {
      setSections(rawSections.length ? rawSections : [{ key: "default", label: "Details", fields: [] }]);
      setDocuments(newDocs);
      setActiveSection(0);
    } else {
      setSections((prev) => [...prev, ...rawSections]);
      setDocuments((prev) => {
        const keys = new Set(prev.map((d) => d.key));
        const filtered = newDocs.filter((d) => !keys.has(d.key));
        return [...prev, ...filtered];
      });
    }
    setSelected(null);
    setShowCopy(false);
  }

  if (isLoading) return <div className="p-8 text-slate-500">Loading form builder…</div>;

  return (
    <div className="-m-4 md:-m-6 min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center gap-3">
          <Link to="/admin/services" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="size-4" /> Services
          </Link>
          <span className="text-slate-300">/</span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Form Builder</div>
            <div className="font-semibold text-slate-900 truncate">{data?.service?.service_name ?? serviceCode}</div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 pr-2">
            <span className="inline-flex items-center gap-1"><Layers className="size-3.5" /> {sections.length} sections</span>
            <span className="inline-flex items-center gap-1"><Type className="size-3.5" /> {totalFields} fields</span>
            <span className="inline-flex items-center gap-1"><FileText className="size-3.5" /> {documents.length} docs</span>
          </div>
          <button onClick={() => setShowCopy(true)} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
            <Copy className="size-4" /> Copy from service
          </button>
          <button onClick={() => setShowHistory(true)} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
            <History className="size-4" /> History
            <span className="ml-1 rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{data?.versions.length ?? 0}</span>
          </button>
          <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
            <Eye className="size-4" /> Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50 shadow-sm"
          >
            {savedFlash ? <CheckCircle2 className="size-4 text-emerald-300" /> : <Save className="size-4" />}
            {saving ? "Publishing…" : savedFlash ? "Published" : "Publish version"}
          </button>
        </div>
        {saveError && (
          <div className="border-t bg-rose-50 px-4 md:px-6 py-2 text-sm text-rose-700 flex items-center gap-2">
            <X className="size-4" /> {saveError}
          </div>
        )}
      </div>

      {/* Main layout */}
      <div className="mx-auto max-w-[1600px] px-4 md:px-6 py-5 grid grid-cols-1 xl:grid-cols-[260px_1fr_340px] gap-5">
        {/* Left: sections + palette */}
        <aside className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="px-3 py-2.5 border-b flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</div>
              <button onClick={addSection} className="text-xs inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700">
                <Plus className="size-3.5" /> Add
              </button>
            </div>
            <div className="p-2 space-y-1 max-h-[40vh] overflow-y-auto">
              {sections.map((sec, i) => {
                const isActive = i === activeSection;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveSection(i)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 text-sm flex items-center gap-2 border ${
                      isActive ? "border-indigo-200 bg-indigo-50 text-indigo-900" : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center size-5 rounded text-[11px] font-semibold ${isActive ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{sec.label || "Untitled section"}</span>
                    <span className="text-[11px] text-slate-400">{sec.fields.length}</span>
                  </button>
                );
              })}
              {sections.length === 0 && (
                <div className="text-xs text-slate-400 px-2 py-4 text-center">No sections yet</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm">
            <div className="px-3 py-2.5 border-b">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Add field</div>
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder="Search field types…"
                  className="w-full rounded-md border pl-7 pr-2 py-1.5 text-xs"
                />
              </div>
            </div>
            <div className="p-2 grid grid-cols-2 gap-1.5">
              {filteredPalette.map((t) => {
                const meta = FIELD_META[t];
                const Icon = meta.icon;
                const disabled = t !== "section" && sections.length === 0;
                return (
                  <button
                    key={t}
                    onClick={() => addField(activeSection, t)}
                    disabled={disabled}
                    title={meta.hint}
                    className="group rounded-lg border bg-white hover:border-indigo-300 hover:bg-indigo-50/60 px-2 py-2 text-left disabled:opacity-40 transition-colors"
                  >
                    <Icon className="size-4 text-slate-500 group-hover:text-indigo-600" />
                    <div className="mt-1 text-[11px] font-medium text-slate-700 truncate">{meta.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center: form meta + canvas */}
        <div className="space-y-5 min-w-0">
          {/* Form meta */}
          <div className="rounded-xl border bg-white shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Settings2 className="size-4" /> Form details
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Form title"
              className="w-full text-xl font-semibold border-0 border-b border-transparent focus:border-slate-300 focus:ring-0 px-0 py-1 outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description shown to customers…"
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
            />
            <div className="grid md:grid-cols-[1fr_220px] gap-2 pt-2 border-t">
              <div className="block">
                <div className="text-[11px] font-medium text-slate-600 mb-1">
                  Sample form file — shown to customer as a download button
                </div>
                <SampleFormPicker
                  serviceCode={serviceCode}
                  value={sampleFormUrl}
                  onChange={setSampleFormUrl}
                />
              </div>
              <label className="block">
                <div className="text-[11px] font-medium text-slate-600 mb-1">Button label (optional)</div>
                <input
                  value={sampleFormLabel}
                  onChange={(e) => setSampleFormLabel(e.target.value)}
                  placeholder="Download sample form"
                  className="w-full rounded-md border px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>
            <label className="flex items-start gap-2 pt-2 border-t cursor-pointer">
              <input
                type="checkbox"
                checked={enableMerge}
                onChange={(e) => setEnableMerge(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Enable Customer Document Merge</span>
                <span className="block text-[11px] text-slate-500">
                  Staff see a "Merge PDF" button on the order to combine the customer's uploaded documents into one PDF.
                </span>
              </span>
            </label>
          </div>


          {/* Tabs */}
          <div className="flex items-center gap-1 border-b">
            <TabBtn active={tab === "fields"} onClick={() => setTab("fields")}>
              Fields <span className="ml-1.5 text-[11px] text-slate-500">{totalFields}</span>
            </TabBtn>
            <TabBtn active={tab === "documents"} onClick={() => setTab("documents")}>
              Documents <span className="ml-1.5 text-[11px] text-slate-500">{documents.length}</span>
            </TabBtn>
          </div>

          {tab === "fields" && currentSection && (
            <div className="rounded-xl border bg-white shadow-sm">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-white">
                <span className="inline-flex items-center justify-center size-6 rounded-md bg-indigo-600 text-white text-xs font-semibold">
                  {activeSection + 1}
                </span>
                <input
                  value={currentSection.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSections((prev) => prev.map((s, i) => (i === activeSection ? { ...s, label: val } : s)));
                  }}
                  className="flex-1 rounded-md border bg-white px-3 py-1.5 text-sm font-medium"
                />
                <IconBtn onClick={() => moveSection(activeSection, -1)} title="Move section up"><ArrowUp className="size-4" /></IconBtn>
                <IconBtn onClick={() => moveSection(activeSection, 1)} title="Move section down"><ArrowDown className="size-4" /></IconBtn>
                <IconBtn onClick={() => deleteSection(activeSection)} title="Delete section" danger><Trash2 className="size-4" /></IconBtn>
              </div>

              {/* Field list */}
              <div className="p-3 space-y-2">
                {currentSection.fields.map((f, fi) => {
                  const isSel = selected?.s === activeSection && selected.f === fi;
                  const meta = FIELD_META[f.type];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={fi}
                      onClick={() => setSelected({ s: activeSection, f: fi })}
                      className={`group rounded-lg border px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-all ${
                        isSel
                          ? "border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/40"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className={`inline-flex items-center justify-center size-8 rounded-md ${isSel ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {f.label || <span className="text-slate-400 italic">Untitled</span>}
                          </span>
                          {f.required && <span className="text-rose-600 text-xs">required</span>}
                          <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {meta.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">{f.key}</div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconBtn onClick={(e) => { e.stopPropagation(); moveField(activeSection, fi, -1); }} title="Move up"><ArrowUp className="size-3.5" /></IconBtn>
                        <IconBtn onClick={(e) => { e.stopPropagation(); moveField(activeSection, fi, 1); }} title="Move down"><ArrowDown className="size-3.5" /></IconBtn>
                        <IconBtn onClick={(e) => { e.stopPropagation(); duplicateField(activeSection, fi); }} title="Duplicate"><Copy className="size-3.5" /></IconBtn>
                        <IconBtn onClick={(e) => { e.stopPropagation(); deleteField(activeSection, fi); }} title="Delete" danger><Trash2 className="size-3.5" /></IconBtn>
                      </div>
                    </div>
                  );
                })}

                {currentSection.fields.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
                    <div className="text-sm font-medium text-slate-700">This section is empty</div>
                    <div className="text-xs text-slate-500 mt-1">Pick a field type from the left palette to add your first field.</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "documents" && (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-white">
                <div className="font-medium text-sm">Required documents</div>
                <button
                  onClick={() => setDocuments((d) => [...d, { key: newKey("doc"), label: "New document", required: false }])}
                  className="inline-flex items-center gap-1 rounded-md border bg-white px-2.5 py-1 text-xs hover:bg-slate-50"
                >
                  <Plus className="size-3.5" /> Add document
                </button>
              </div>
              <div className="p-3 space-y-2">
                {documents.map((d, i) => (
                  <div key={i} className="rounded-lg border bg-white px-3 py-2.5 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        value={d.label}
                        onChange={(e) => setDocuments((docs) => docs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        placeholder="Document label"
                        className="col-span-12 md:col-span-5 rounded-md border px-2 py-1.5 text-sm"
                      />
                      <input
                        value={d.key}
                        onChange={(e) => setDocuments((docs) => docs.map((x, j) => j === i ? { ...x, key: slugify(e.target.value) } : x))}
                        placeholder="key"
                        className="col-span-6 md:col-span-3 rounded-md border px-2 py-1.5 text-sm font-mono"
                      />
                      <label className="col-span-4 md:col-span-2 text-xs flex items-center gap-1.5">
                        <input type="checkbox" checked={!!d.required} onChange={(e) => setDocuments((docs) => docs.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} />
                        Required
                      </label>
                      <button onClick={() => setDocuments((docs) => docs.filter((_, j) => j !== i))} className="col-span-2 text-rose-600 text-xs hover:underline text-right">Remove</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-2">
                      <div>
                        <div className="text-[11px] font-medium text-slate-600 mb-1">
                          Fillable sample — customer downloads, fills & re-uploads
                        </div>
                        <SampleFormPicker
                          serviceCode={`${serviceCode}/docs`}
                          value={d.sample_url ?? ""}
                          onChange={(v) => setDocuments((docs) => docs.map((x, j) => j === i ? { ...x, sample_url: v || undefined } : x))}
                        />
                      </div>
                      <label className="block">
                        <div className="text-[11px] font-medium text-slate-600 mb-1">Download button label</div>
                        <input
                          value={d.sample_label ?? ""}
                          onChange={(e) => setDocuments((docs) => docs.map((x, j) => j === i ? { ...x, sample_label: e.target.value || undefined } : x))}
                          placeholder="Download template"
                          className="w-full rounded-md border px-2 py-1.5 text-xs"
                        />
                      </label>
                    </div>
                    <input
                      value={d.help ?? ""}
                      onChange={(e) => setDocuments((docs) => docs.map((x, j) => j === i ? { ...x, help: e.target.value || undefined } : x))}
                      placeholder="Help text shown under the document (optional)"
                      className="w-full rounded-md border px-2 py-1.5 text-xs"
                    />
                  </div>
                ))}
                {documents.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    No documents required for this form.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: settings panel */}
        <aside className="xl:sticky xl:top-[76px] xl:self-start">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Settings2 className="size-4 text-slate-500" />
              <div className="text-sm font-semibold text-slate-800">Field settings</div>
            </div>
            <div className="p-4">
              {!activeField && (
                <div className="text-center py-10">
                  <div className="mx-auto size-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Settings2 className="size-5 text-slate-400" />
                  </div>
                  <div className="text-sm text-slate-600 font-medium">Nothing selected</div>
                  <div className="text-xs text-slate-400 mt-1">Click a field to edit its properties.</div>
                </div>
              )}
              {activeField && (
                <div className="space-y-4">
                  <Tf label="Label" value={activeField.label} onChange={(v) => updateField({ label: v })} />
                  <Tf label="Key (data)" mono value={activeField.key} onChange={(v) => updateField({ key: slugify(v) })} />
                  <label className="block text-sm">
                    <div className="text-xs font-medium text-slate-600 mb-1">Type</div>
                    <select
                      value={activeField.type}
                      onChange={(e) => updateField({ type: e.target.value as Field["type"] })}
                      className="w-full rounded-md border bg-white px-2.5 py-1.5 text-sm"
                    >
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_META[t].label}</option>)}
                    </select>
                  </label>
                  {activeField.type !== "section" && activeField.type !== "plants" && activeField.type !== "note" && (
                    <label className="flex items-center gap-2 text-sm rounded-md border bg-slate-50 px-2.5 py-2">
                      <input type="checkbox" checked={!!activeField.required} onChange={(e) => updateField({ required: e.target.checked })} />
                      <span className="font-medium text-slate-700">Required</span>
                    </label>
                  )}
                  {activeField.type === "note" && (
                    <label className="block text-sm">
                      <div className="text-xs font-medium text-slate-600 mb-1">Note Content (shown to staff only)</div>
                      <textarea
                        rows={4}
                        value={activeField.help ?? activeField.default ?? ""}
                        onChange={(e) => updateField({ help: e.target.value || undefined, default: e.target.value || undefined })}
                        placeholder="Type internal note text for employees here..."
                        className="w-full rounded-md border px-2.5 py-1.5 text-sm"
                      />
                    </label>
                  )}
                  {["text", "email", "tel", "number", "textarea"].includes(activeField.type) && (
                    <>
                      <Tf label="Placeholder" value={activeField.placeholder ?? ""} onChange={(v) => updateField({ placeholder: v || undefined })} />
                      <Tf label="Max length" value={String(activeField.maxLength ?? "")} onChange={(v) => updateField({ maxLength: v ? Number(v) : undefined })} />
                      <Tf label="Regex pattern" value={activeField.pattern ?? ""} mono onChange={(v) => updateField({ pattern: v || undefined })} />
                    </>
                  )}
                  {activeField.type === "select" && (
                    <OptionsEditor
                      key={activeField.key}
                      options={activeField.options ?? []}
                      onChange={(options) => updateField({ options })}
                    />
                  )}
                  {activeField.type === "nic" && (
                    <>
                      <label className="block text-sm">
                        <div className="text-xs font-medium text-slate-600 mb-1">NIC digits</div>
                        <select
                          value={activeField.nicDigits ?? 5}
                          onChange={(e) => updateField({ nicDigits: Number(e.target.value) as 2 | 4 | 5 })}
                          className="w-full rounded-md border bg-white px-2.5 py-1.5 text-sm"
                        >
                          <option value={2}>2</option>
                          <option value={4}>4</option>
                          <option value={5}>5</option>
                        </select>
                      </label>
                      <Tf label="Activity source key" mono value={activeField.activityFrom ?? ""} onChange={(v) => updateField({ activityFrom: v || undefined })} />
                    </>
                  )}
                  {activeField.type !== "section" && activeField.type !== "note" && (
                    <ShowWhenEditor
                      field={activeField}
                      allFields={sections.flatMap((s) => s.fields)}
                      onChange={(visibleIf) => updateField({ visibleIf })}
                    />
                  )}
                  {activeField.type !== "note" && (
                    <>
                      <Tf label="Default value" value={activeField.default ?? ""} onChange={(v) => updateField({ default: v || undefined })} />
                      <Tf label="Help text" value={activeField.help ?? ""} onChange={(v) => updateField({ help: v || undefined })} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Preview slide-over — full customer-side view (read-only) */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowPreview(false)}>
          <div className="flex-1 bg-black/40" />
          <div className="w-full max-w-4xl bg-slate-50 h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 border-b bg-white px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold">Customer-side preview · read-only</div>
                <div className="font-semibold text-slate-900">{title || "Untitled form"}</div>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-2 rounded-md hover:bg-slate-100 text-slate-500">
                <X className="size-4" />
              </button>
            </div>
            <div className="mx-auto max-w-3xl px-5 py-6 space-y-5">
              {/* Sample form download banner */}
              {sampleFormUrl && (
                <a
                  href={sampleFormUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 hover:bg-indigo-100 transition"
                >
                  <div className="size-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <FileText className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-indigo-900">
                      {sampleFormLabel || "Download sample form"}
                    </div>
                    <div className="text-xs text-indigo-700/80 truncate">
                      Reference copy of the entire application form.
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-indigo-700">Download →</span>
                </a>
              )}

              {/* Form header */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-xs p-5">
                <div className="text-lg font-bold text-slate-900">{title || "Untitled form"}</div>
                {description && <div className="text-sm text-slate-600 mt-1">{description}</div>}
              </div>

              {/* Form fields with separated & highlighted sections */}
              <div className="pointer-events-none opacity-95 select-none" aria-hidden="false">
                <OnboardingForm
                  schema={previewSchema}
                  initial={{}}
                  busy={false}
                  onSubmit={async () => { /* preview only */ }}
                />
              </div>

              {/* Documents step preview (read-only) */}
              {documents.length > 0 && (
                <div className="rounded-xl border bg-white shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Upload documents</div>
                      <div className="text-xs text-slate-500">Customer sees this on the next step.</div>
                    </div>
                    <span className="text-[11px] uppercase font-semibold text-slate-400">Step 2</span>
                  </div>
                  <div className="space-y-2">
                    {documents.map((d) => (
                      <div key={d.key} className="rounded-lg border bg-slate-50/50 px-3 py-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-9 rounded-lg bg-white border flex items-center justify-center shrink-0">
                              <FileText className="size-4 text-slate-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {d.label}
                                {d.required && <span className="text-rose-600"> *</span>}
                              </div>
                              {d.help && <div className="text-xs text-slate-500 truncate">{d.help}</div>}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border bg-white px-3 py-1 text-slate-500">
                            <Upload className="size-3.5" /> Upload
                          </span>
                        </div>
                        {d.sample_url && (
                          <a
                            href={d.sample_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
                          >
                            <FileText className="size-3.5" />
                            {d.sample_label || "Download template"}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400">
                    Customers download the template above, fill & sign it, then re-upload here as PDF / JPG / PNG (max 5 MB).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowHistory(false)}>
          <div className="flex-1 bg-black/40" />
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 border-b bg-white px-5 py-3 flex items-center justify-between">
              <div className="font-semibold text-slate-900">Version history</div>
              <button onClick={() => setShowHistory(false)} className="p-2 rounded-md hover:bg-slate-100 text-slate-500">
                <X className="size-4" />
              </button>
            </div>
            <div className="divide-y">
              {data?.versions.map((v) => (
                <div key={v.id} className="p-4 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <span>Version {v.version}</span>
                      {v.is_active && <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5"><CheckCircle2 className="size-3" /> Active</span>}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{v.title}</div>
                    <div className="text-[11px] text-slate-400">{new Date(v.updated_at).toLocaleString()}</div>
                  </div>
                  <button onClick={() => restoreVersion(v.id)} className="text-xs rounded-md border bg-white px-2.5 py-1.5 hover:bg-slate-50">Load</button>
                </div>
              ))}
              {(!data?.versions || data.versions.length === 0) && (
                <div className="p-8 text-center text-sm text-slate-500">No previous versions yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCopy && (
        <CopyFromServiceDialog
          serviceCode={serviceCode}
          onClose={() => setShowCopy(false)}
          onApply={applyCopy}
        />
      )}
    </div>
  );
}

function CopyFromServiceDialog({
  serviceCode,
  onClose,
  onApply,
}: {
  serviceCode: string;
  onClose: () => void;
  onApply: (sections: Section[], docs: Doc[], mode: "append" | "replace") => void;
}) {
  const listFn = useServerFn(listCopyableForms);
  const { data, isLoading } = useQuery({
    queryKey: ["copyable-forms", serviceCode],
    queryFn: () => listFn({ data: { exclude_service_code: serviceCode } }),
  });
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [includeDocs, setIncludeDocs] = useState(true);

  const picked = data?.rows.find((r) => r.service_code === pickedCode) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Copy from another service</div>
            <div className="font-semibold text-slate-900">Reuse sections & documents</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 grid md:grid-cols-[240px_1fr] gap-4">
          <div className="rounded-lg border bg-slate-50/50 overflow-y-auto max-h-[55vh]">
            {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <div className="p-4 text-sm text-slate-500">No other services have a published form yet.</div>
            )}
            {(data?.rows ?? []).map((r) => (
              <button
                key={r.service_code}
                onClick={() => setPickedCode(r.service_code)}
                className={`w-full text-left px-3 py-2 border-b text-sm ${pickedCode === r.service_code ? "bg-indigo-50 text-indigo-900" : "hover:bg-white"}`}
              >
                <div className="font-medium truncate">{r.title}</div>
                <div className="text-[11px] text-slate-500 font-mono">{r.service_code}</div>
              </button>
            ))}
          </div>
          <div className="min-w-0 space-y-3">
            {!picked && <div className="text-sm text-slate-500">Pick a service on the left to preview its sections.</div>}
            {picked && (
              <>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Sections ({picked.sections.length})</div>
                  <ul className="rounded-lg border divide-y bg-white">
                    {picked.sections.map((s) => (
                      <li key={s.key} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                        <span className="truncate">{s.label}</span>
                        <span className="text-[11px] text-slate-500 shrink-0">{s.fieldCount} fields</span>
                      </li>
                    ))}
                    {picked.sections.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No sections</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Documents ({picked.documents.length})</div>
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={includeDocs} onChange={(e) => setIncludeDocs(e.target.checked)} />
                    Include documents
                  </label>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Mode</div>
                  <div className="flex gap-2 text-sm">
                    <label className={`flex-1 rounded-lg border px-3 py-2 cursor-pointer ${mode === "append" ? "border-indigo-500 bg-indigo-50" : "hover:bg-slate-50"}`}>
                      <input type="radio" className="hidden" checked={mode === "append"} onChange={() => setMode("append")} />
                      <div className="font-medium">Append</div>
                      <div className="text-[11px] text-slate-500">Add these sections after existing ones.</div>
                    </label>
                    <label className={`flex-1 rounded-lg border px-3 py-2 cursor-pointer ${mode === "replace" ? "border-rose-500 bg-rose-50" : "hover:bg-slate-50"}`}>
                      <input type="radio" className="hidden" checked={mode === "replace"} onChange={() => setMode("replace")} />
                      <div className="font-medium">Replace</div>
                      <div className="text-[11px] text-slate-500">Wipe current form and use these instead.</div>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="border-t px-5 py-3 flex items-center justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Cancel</button>
          <button
            disabled={!picked}
            onClick={() => picked && onApply(picked.rawSections as unknown as Section[], (includeDocs ? picked.documents : []) as unknown as Doc[], mode)}
            className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-slate-800"
          >
            {mode === "replace" ? "Replace form" : "Append to form"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children, onClick, title, danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${danger ? "text-slate-500 hover:bg-rose-50 hover:text-rose-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
    >
      {children}
    </button>
  );
}

function flatFieldsToSections(fields: Field[]): Section[] {
  const secs: Section[] = [];
  let current: Section | null = null;
  for (const f of fields) {
    if (f.type === "section") {
      current = { key: f.key, label: f.label, fields: [] };
      secs.push(current);
    } else {
      if (!current) {
        current = { key: "default", label: "Details", fields: [] };
        secs.push(current);
      }
      current.fields.push(f);
    }
  }
  return secs.length ? secs : [{ key: "default", label: "Details", fields }];
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  // Local raw text so Enter/new lines and in-progress typing aren't stripped
  // by the parse-then-join round trip on every keystroke.
  const [text, setText] = useState(options.join("\n"));
  return (
    <label className="block text-sm">
      <div className="text-xs font-medium text-slate-600 mb-1">Options (one per line)</div>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          onChange(v.split("\n").map((s) => s.trim()).filter(Boolean));
        }}
        className="w-full rounded-md border px-2.5 py-1.5 text-sm font-mono"
      />
    </label>
  );
}

function ShowWhenEditor({
  field,
  allFields,
  onChange,
}: {
  field: Field;
  allFields: Field[];
  onChange: (v: Field["visibleIf"]) => void;
}) {
  const parents = allFields.filter(
    (f) => f.key !== field.key && (f.type === "select" || f.type === "checkbox"),
  );
  const rule = field.visibleIf;
  const parent = parents.find((p) => p.key === rule?.key);
  const values = parent?.type === "checkbox" ? ["Yes"] : parent?.options ?? [];
  return (
    <div className="rounded-md border bg-slate-50 p-2.5 space-y-2">
      <div className="text-xs font-medium text-slate-600">Show only when</div>
      <select
        value={rule?.key ?? ""}
        onChange={(e) => {
          const key = e.target.value;
          if (!key) return onChange(undefined);
          const p = parents.find((x) => x.key === key);
          const first = p?.type === "checkbox" ? "Yes" : p?.options?.[0] ?? "";
          onChange({ key, equals: first });
        }}
        className="w-full rounded-md border bg-white px-2.5 py-1.5 text-sm"
      >
        <option value="">Always show</option>
        {parents.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
      {rule?.key && (
        <select
          value={rule.equals}
          onChange={(e) => onChange({ key: rule.key, equals: e.target.value })}
          className="w-full rounded-md border bg-white px-2.5 py-1.5 text-sm"
        >
          {values.map((v) => (
            <option key={v} value={v}>{parent?.type === "checkbox" ? "is ticked" : `is "${v}"`}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function Tf({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <label className="block text-sm">
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border px-2.5 py-1.5 text-sm ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function SampleFormPicker({
  serviceCode,
  value,
  onChange,
}: {
  serviceCode: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploaded = value.startsWith("/api/public/form-asset/");
  const fileName = isUploaded ? decodeURIComponent(value.split("/").pop() || "") : "";

  async function handleFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File too large (max 15 MB).");
      return;
    }
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${serviceCode}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage
        .from("form-assets")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      onChange(`/api/public/form-asset/${path}`);
      toast.success("Sample form uploaded.");
    } catch (e) {
      toast.error((e as Error).message || "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {value ? "Replace file" : "Upload file"}
        </button>
        {value && (
          <>
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-600 hover:underline truncate max-w-[220px]"
              title={value}
            >
              {isUploaded ? fileName : "View current"}
            </a>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-slate-500 hover:text-rose-600"
            >
              Remove
            </button>
          </>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        Upload PDF, DOC, or image (max 15 MB). Customers see a download button on the form.
      </p>
    </div>
  );
}

