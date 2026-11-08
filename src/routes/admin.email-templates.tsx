import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Pencil, Eye, X, Search, ChevronDown, ChevronRight } from "lucide-react";
import { listEmailTemplates, saveEmailTemplate, toggleEmailTemplate, setEmailTemplateDispatchMode } from "@/lib/emails/emails.functions";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/email-templates")({
  head: () => ({
    meta: [
      { title: "Email Templates — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: EmailTemplatesPage,
});

const VARIABLES = [
  "customer_name","order_number","service_name","invoice_number","invoice_url","form_link",
  "payment_reference","payment_date","order_created_at","invoice_date","consultation_at",
  "customer_email","customer_mobile","service_fee","gst_amount","total_amount",
  "document_checklist","document_name","complaint_number","refund_amount","refund_amount_formatted",
  "refund_status","refund_approval_date_and_time","refund_reference_no","refund_gateway_ref",
  "rejection_reason","executive_name","followup_date","authority_name",
  "authority_reference","expected_update_date","ticket_number","ticket_subject","employee_reply",
  "employee_remarks","closure_reason","closure_date","reason","subject",
];

/** Fixed display order for category rails. */
const CATEGORY_ORDER = [
  "Onboarding & Payment",
  "Fulfillment",
  "Delay & Hold",
  "Closure",
  "Consultation",
  "Support / Tickets",
  "Refunds",
  "Complaints",
  "Internal / Admin",
  "Workflow Automation",
];

type Tpl = {
  id: string;
  code: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  description: string | null;
  variables: string[] | null;
  is_enabled: boolean;
  is_system: boolean;
  updated_at: string;
  last_sent_at: string | null;
  total_sent: number;
  category: string | null;
  flow_id: string | null;
  sr_no: number | null;
  dispatch_mode: "auto" | "manual" | null;
};


function formatIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
      timeZone: "Asia/Kolkata",
    }).formatToParts(d);
    const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  } catch { return "—"; }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function EmailTemplatesPage() {
  const role = useRole();
  const qc = useQueryClient();
  const list = useServerFn(listEmailTemplates);
  const toggleFn = useServerFn(toggleEmailTemplate);
  const { data, isLoading } = useQuery({
    queryKey: ["admin.email-templates"],
    queryFn: () => list({ data: {} as never }),
  });
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [previewing, setPreviewing] = useState<Tpl | null>(null);
  const [disableTarget, setDisableTarget] = useState<Tpl | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const canToggle = role.has("admin") || role.has("super_admin");
  const rows: Tpl[] = (data?.rows as Tpl[] | undefined) ?? [];

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.name, r.subject, r.flow_id ?? "", r.category ?? ""]
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [rows, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Tpl[]>();
    for (const r of filtered) {
      const key = r.category ?? "Workflow Automation";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.sr_no ?? 999) - (b.sr_no ?? 999) || a.code.localeCompare(b.code));
    }
    // Return categories in fixed order, then any custom ones alphabetically.
    const known = CATEGORY_ORDER.filter((c) => map.has(c));
    const extra = [...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return [...known, ...extra].map((c) => ({ category: c, items: map.get(c) ?? [] }));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Email Templates</h1>
          <p className="text-sm text-slate-500">
            Grouped by lifecycle stage. SR numbers match the automation flow (E001–E006).
            Use {"{{variable}}"} placeholders in subjects and bodies.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, name, subject, flow…"
            className="w-full border rounded pl-8 pr-2 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-4">
        {/* Side rail */}
        <aside className="sticky top-4 self-start rounded-md border bg-white p-2 text-sm">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase text-slate-500">Categories</div>
          <nav className="flex flex-col">
            {grouped.map((g) => (
              <a
                key={g.category}
                href={`#cat-${slug(g.category)}`}
                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-slate-100"
              >
                <span className="truncate">{g.category}</span>
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {g.items.length}
                </span>
              </a>
            ))}
          </nav>
        </aside>

        {/* Sections */}
        <div className="space-y-6">
          {isLoading && (
            <div className="rounded-md border bg-white px-4 py-8 text-center text-sm text-slate-500">Loading…</div>
          )}
          {!isLoading && grouped.length === 0 && (
            <div className="rounded-md border bg-white px-4 py-8 text-center text-sm text-slate-500">
              No templates match "{search}".
            </div>
          )}
          {grouped.map((g) => {
            const open = !collapsed[g.category];
            return (
              <section key={g.category} id={`cat-${slug(g.category)}`} className="rounded-md border bg-white">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g.category]: open }))}
                  className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    {open ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
                    <h2 className="text-sm font-semibold text-slate-800">{g.category}</h2>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{g.items.length}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {g.items.filter((t) => t.is_enabled).length} enabled
                  </span>
                </button>
                {open && (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="w-10 text-left px-3 py-2 font-medium">SR</th>
                        <th className="w-16 text-left px-2 py-2 font-medium">Flow</th>
                        <th className="text-left px-3 py-2 font-medium">Code</th>
                        <th className="text-left px-3 py-2 font-medium">Name</th>
                        <th className="text-left px-3 py-2 font-medium">Subject</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Dispatch</th>

                        <th className="text-left px-3 py-2 font-medium">Last Sent</th>
                        <th className="text-right px-3 py-2 font-medium">Sent</th>
                        <th className="text-right px-3 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {g.items.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">{t.sr_no ?? "—"}</td>
                          <td className="px-2 py-2">
                            {t.flow_id ? (
                              <span className="rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
                                {t.flow_id}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                          <td className="px-3 py-2">{t.name}</td>
                          <td className="px-3 py-2 text-slate-600 truncate max-w-[22rem]">{t.subject}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={t.is_enabled}
                                disabled={!canToggle}
                                onCheckedChange={async (v) => {
                                  if (!v) { setDisableTarget(t); return; }
                                  try {
                                    await toggleFn({ data: { code: t.code, enabled: true } });
                                    toast.success(`Enabled ${t.name}`);
                                    qc.invalidateQueries({ queryKey: ["admin.email-templates"] });
                                  } catch (e) { toast.error((e as Error).message); }
                                }}
                              />
                              <span className="text-[11px]" style={{ color: t.is_enabled ? "#047857" : "#94a3b8" }}>
                                {t.is_enabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <DispatchToggle
                              tpl={t}
                              disabled={!canToggle}
                              onChanged={() => qc.invalidateQueries({ queryKey: ["admin.email-templates"] })}
                            />
                          </td>
                          <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{formatIST(t.last_sent_at)}</td>
                          <td className="px-3 py-2 text-right text-xs">{t.total_sent ?? 0}</td>

                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => setPreviewing(t)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-100 mr-1"
                            >
                              <Eye className="size-3.5" /> Preview
                            </button>
                            <button
                              onClick={() => setEditing(t)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-100"
                            >
                              <Pencil className="size-3.5" /> Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {editing && <EditorDrawer tpl={editing} onClose={() => setEditing(null)} />}
      {previewing && <PreviewDialog tpl={previewing} onClose={() => setPreviewing(null)} />}
      {disableTarget && (
        <DisableConfirmDialog
          tpl={disableTarget}
          onClose={() => setDisableTarget(null)}
          onConfirmed={() => { setDisableTarget(null); qc.invalidateQueries({ queryKey: ["admin.email-templates"] }); }}
        />
      )}
    </div>
  );
}

function DisableConfirmDialog({ tpl, onClose, onConfirmed }: { tpl: Tpl; onClose: () => void; onConfirmed: () => void }) {
  const toggleFn = useServerFn(toggleEmailTemplate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try {
      await toggleFn({ data: { code: tpl.code, enabled: false, reason: reason || undefined } });
      toast.success(`Disabled ${tpl.name}`);
      onConfirmed();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Disable template?</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Disabling <b>{tpl.name}</b> means <span className="font-mono text-xs">{tpl.code}</span> emails will <b>not</b> be sent.
            Queued items will be skipped silently. Are you sure?
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pausing during MSME portal downtime" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy} style={{ background: "#b91c1c" }}>
            {busy ? "Disabling…" : "Disable Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DispatchToggle({ tpl, disabled, onChanged }: { tpl: Tpl; disabled: boolean; onChanged: () => void }) {
  const setMode = useServerFn(setEmailTemplateDispatchMode);
  const [busy, setBusy] = useState(false);
  const mode: "auto" | "manual" = tpl.dispatch_mode ?? "auto";
  const toggle = async () => {
    if (disabled || busy) return;
    const next = mode === "auto" ? "manual" : "auto";
    setBusy(true);
    try {
      await setMode({ data: { code: tpl.code, dispatch_mode: next } });
      toast.success(`${tpl.name}: ${next === "auto" ? "Automated" : "Manual only"}`);
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const isAuto = mode === "auto";
  return (
    <button
      onClick={toggle}
      disabled={disabled || busy}
      title={isAuto ? "Sent automatically by the system" : "Employee must send manually"}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
        isAuto
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
      } disabled:opacity-50`}
    >
      <span className={`size-1.5 rounded-full ${isAuto ? "bg-emerald-500" : "bg-amber-500"}`} />
      {isAuto ? "Automated" : "Manual"}
    </button>
  );
}


function EditorDrawer({ tpl, onClose }: { tpl: Tpl; onClose: () => void }) {
  const save = useServerFn(saveEmailTemplate);
  const qc = useQueryClient();
  const [name, setName] = useState(tpl.name);
  const [subject, setSubject] = useState(tpl.subject);
  const [bodyHtml, setBodyHtml] = useState(tpl.body_html);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertVar = (v: string) => {
    const el = bodyRef.current;
    const token = `{{${v}}}`;
    if (!el) { setBodyHtml((s) => s + token); return; }
    const start = el.selectionStart ?? bodyHtml.length;
    const end = el.selectionEnd ?? bodyHtml.length;
    const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end);
    setBodyHtml(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          id: tpl.id,
          code: tpl.code,
          name,
          subject,
          body_html: bodyHtml,
          body_text: tpl.body_text ?? null,
          description: tpl.description ?? null,
          variables: tpl.variables ?? [],
          is_enabled: tpl.is_enabled,
        },
      });
      toast.success("Template saved");
      await qc.invalidateQueries({ queryKey: ["admin.email-templates"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative ml-auto h-full w-full max-w-5xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{tpl.code}</span>
              {tpl.sr_no != null && <span className="rounded bg-slate-100 px-1.5 py-0.5">SR {tpl.sr_no}</span>}
              {tpl.flow_id && <span className="rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.5">{tpl.flow_id}</span>}
              {tpl.category && <span className="rounded bg-slate-100 px-1.5 py-0.5">{tpl.category}</span>}
            </div>
            <div className="text-sm font-medium">Edit template</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="size-4" /></button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            <Field label="Template Code">
              <input value={tpl.code} disabled className="w-full border rounded px-2 py-1.5 text-sm font-mono bg-slate-50 text-slate-500" />
            </Field>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Body (HTML)">
              <textarea
                ref={bodyRef}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={20}
                className="w-full border rounded px-2 py-1.5 text-xs font-mono leading-relaxed"
              />
            </Field>
          </div>

          <aside className="w-64 border-l bg-slate-50 p-3 overflow-y-auto">
            <div className="text-xs font-semibold text-slate-700 mb-2">Available variables</div>
            <p className="text-[11px] text-slate-500 mb-3">Click to insert at cursor.</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVar(v)}
                  className="text-[11px] font-mono px-2 py-1 rounded border bg-white hover:bg-slate-100"
                  title={`Insert {{${v}}}`}
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </aside>
        </div>

        <div className="border-t px-4 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded border text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      {children}
    </label>
  );
}

function PreviewDialog({ tpl, onClose }: { tpl: Tpl; onClose: () => void }) {
  const sampleData = useMemo<Record<string, string>>(
    () => ({
      customer_name: "Rahul Sharma",
      order_number: "SMV000123",
      service_name: "New Udyam Registration",
      invoice_number: "BHS-2026-000123",
      invoice_url: "https://example.com/invoice.pdf",
      form_link: "https://example.com/onboarding/UA-2026-000123",
      payment_reference: "pay_abc123",
      payment_date: "06-07-2026 11:03 AM",
      order_created_at: "06-07-2026 11:02 AM",
      invoice_date: "06-07-2026",
      consultation_at: "07-07-2026 04:00 PM",
      customer_email: "rahul@example.com",
      customer_mobile: "+91-9876543210",
      service_fee: "1,299",
      gst_amount: "234",
      total_amount: "1,533",
      document_checklist: "Aadhaar, PAN, Bank Proof",
      document_name: "Udyam Registration Certificate",
      complaint_number: "CMP-000045",
      refund_amount: "1,499",
      refund_reason: "Service not required",
      refund_gateway_ref: "rfnd_abc123xyz",
      rejection_reason: "Service already initiated",
      executive_name: "Anita Verma",
      followup_date: "28 Jun 2026",
      authority_name: "MSME Ministry",
      authority_reference: "REF/2026/00078",
      expected_update_date: "30 Jun 2026",
      ticket_number: "TKT-2026-00012",
      ticket_subject: "Unable to download certificate",
      employee_reply: "We have verified your Aadhaar details and re-submitted the request.",
      employee_remarks: "Reissue certificate after portal downtime.",
      closure_reason: "Customer requested cancellation",
      closure_date: "06-07-2026",
      reason: "Awaiting customer OTP",
      subject: "Unable to download certificate",
    }),
    [],
  );

  const render = (s: string) =>
    s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => sampleData[k] ?? `{{${k}}}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{tpl.code}</span>
              {tpl.sr_no != null && <span className="rounded bg-slate-100 px-1.5 py-0.5">SR {tpl.sr_no}</span>}
              {tpl.flow_id && <span className="rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.5">{tpl.flow_id}</span>}
            </div>
            <div className="text-sm font-medium">{tpl.name}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="size-4" /></button>
        </div>
        <div className="px-4 py-3 border-b bg-slate-50">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Subject</div>
          <div className="text-sm">{render(tpl.subject)}</div>
        </div>
        <div className="flex-1 overflow-hidden p-0">
          <iframe
            title="Email template preview"
            sandbox=""
            srcDoc={render(tpl.body_html)}
            className="w-full h-full min-h-[500px] border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
