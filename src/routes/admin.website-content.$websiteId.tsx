import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import {
  getWebsiteContent,
  upsertNavItem,
  deleteNavItem,
  upsertContentBlock,
  updateWebsiteContact,
} from "@/lib/crm/site-content-admin.functions";

export const Route = createFileRoute("/admin/website-content/$websiteId")({
  component: WebsiteContentPage,
});

type NavRow = {
  id: string;
  website_id: string;
  nav_group: string;
  label: string;
  path: string;
  open_in_new: boolean;
  is_active: boolean;
  sort_order: number;
};

const BLOCK_HINTS: Record<string, string> = {
  "checkout.disclaimer_footer": '{ "enabled": true }',
  "home.facts": '{ "items": [{ "label": "Label", "value": "Value" }] }',
  "disclaimer.bar": '{ "text": "Disclaimer marquee text" }',
  "footer.address": '{ "text": "Full postal address" }',
  "footer.copyright": '{ "text": "© {{year}} Company. All Rights Reserved." }',
};

const KNOWN_BLOCK_KEYS = Object.keys(BLOCK_HINTS);

function WebsiteContentPage() {
  const { websiteId } = Route.useParams();
  const load = useServerFn(getWebsiteContent);
  const saveNav = useServerFn(upsertNavItem);
  const removeNav = useServerFn(deleteNavItem);
  const saveBlock = useServerFn(upsertContentBlock);
  const saveContact = useServerFn(updateWebsiteContact);
  const qc = useQueryClient();
  const key = ["admin.website.content", websiteId];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { websiteId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>;
  if (!data) return null;

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link to="/admin/websites" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Websites
        </Link>
        <h1 className="text-xl font-semibold">
          Content — {data.website.name} <span className="text-muted-foreground font-normal">({data.website.domain})</span>
        </h1>
      </div>

      <CheckoutToggleCard
        websiteId={websiteId}
        blocks={data.blocks as Array<{ block_key: string; content: unknown; is_active: boolean }>}
        onSave={saveBlock}
        onSaved={refresh}
      />

      <HeaderFooterTextCard
        websiteId={websiteId}
        blocks={data.blocks as Array<{ block_key: string; content: unknown; is_active: boolean }>}
        onSave={saveBlock}
        onSaved={refresh}
      />

      <ContactCard website={data.website} onSave={saveContact} onSaved={refresh} />

      <NavCard
        group="header"
        title="Header navigation"
        websiteId={websiteId}
        rows={(data.nav as NavRow[]).filter((n) => n.nav_group === "header")}
        onSave={saveNav}
        onDelete={removeNav}
        onSaved={refresh}
      />
      <NavCard
        group="footer"
        title="Footer — Useful links"
        websiteId={websiteId}
        rows={(data.nav as NavRow[]).filter((n) => n.nav_group === "footer")}
        onSave={saveNav}
        onDelete={removeNav}
        onSaved={refresh}
      />

      <BlocksCard
        websiteId={websiteId}
        blocks={data.blocks as Array<{ block_key: string; content: unknown; is_active: boolean }>}
        onSave={saveBlock}
        onSaved={refresh}
      />
    </div>
  );
}

function CheckoutToggleCard({
  websiteId,
  blocks,
  onSave,
  onSaved,
}: {
  websiteId: string;
  blocks: Array<{ block_key: string; content: unknown; is_active: boolean }>;
  onSave: (a: { data: { website_id: string; block_key: string; content: unknown; is_active: boolean } }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const existing = blocks.find((b) => b.block_key === "checkout.disclaimer_footer");
  const contentObj = (existing?.content as { enabled?: boolean } | undefined) ?? {};
  const [enabled, setEnabled] = useState(contentObj.enabled ?? true);
  const [busy, setBusy] = useState(false);

  const saveToggle = async (val: boolean) => {
    setEnabled(val);
    setBusy(true);
    try {
      await onSave({
        data: {
          website_id: websiteId,
          block_key: "checkout.disclaimer_footer",
          content: { enabled: val },
          is_active: true,
        },
      });
      onSaved();
    } catch (e: any) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Waiting & Payment Page Display Settings">
      <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
        <div>
          <div className="font-semibold text-sm text-slate-800">
            Show Disclaimer & Footer on Lead Waiting & Payment Pages
          </div>
          <div className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Controls visibility of the Disclaimer Bar and Footer on <code>/apply/</code> summary waiting pages and <code>/payment/</code> pages. Main public pages always display the disclaimer & footer.
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => saveToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            enabled ? "bg-indigo-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </Card>
  );
}

function HeaderFooterTextCard({
  websiteId,
  blocks,
  onSave,
  onSaved,
}: {
  websiteId: string;
  blocks: Array<{ block_key: string; content: unknown; is_active: boolean }>;
  onSave: (a: { data: { website_id: string; block_key: string; content: unknown; is_active: boolean } }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const getBlockVal = (key: string, def: string) => {
    const b = blocks.find((x) => x.block_key === key);
    return ((b?.content as { text?: string })?.text) ?? def;
  };

  const [brandTitle, setBrandTitle] = useState(() => getBlockVal("header.brand_title", "Business Help Services"));
  const [brandSubtitle, setBrandSubtitle] = useState(() => getBlockVal("header.brand_subtitle", "Business Consultancy & Assistance Services"));
  const [centerTitle, setCenterTitle] = useState(() => getBlockVal("header.center_title", "सूक्ष्म, लघु और मध्यम उद्यम पंजीकरण सहायता सेवा"));
  const [centerSubtitle, setCenterSubtitle] = useState(() => getBlockVal("header.center_subtitle", "REGISTRATION ADVISORY FOR MICRO, SMALL & MEDIUM ENTERPRISES"));
  const [footerBrandHeading, setFooterBrandHeading] = useState(() => getBlockVal("footer.brand_heading", "Business Help Services"));
  const [footerContactName, setFooterContactName] = useState(() => getBlockVal("footer.contact_name", "Business Help Services"));

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const saveAll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await Promise.all([
        onSave({ data: { website_id: websiteId, block_key: "header.brand_title", content: { text: brandTitle }, is_active: true } }),
        onSave({ data: { website_id: websiteId, block_key: "header.brand_subtitle", content: { text: brandSubtitle }, is_active: true } }),
        onSave({ data: { website_id: websiteId, block_key: "header.center_title", content: { text: centerTitle }, is_active: true } }),
        onSave({ data: { website_id: websiteId, block_key: "header.center_subtitle", content: { text: centerSubtitle }, is_active: true } }),
        onSave({ data: { website_id: websiteId, block_key: "footer.brand_heading", content: { text: footerBrandHeading }, is_active: true } }),
        onSave({ data: { website_id: websiteId, block_key: "footer.contact_name", content: { text: footerContactName }, is_active: true } }),
      ]);
      setMsg("Header & footer text settings saved successfully!");
      onSaved();
    } catch (e: any) {
      setMsg(e?.message || "Failed to save text settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Header & Footer Dynamic Text Settings">
      <div className="space-y-4">
        <div className="border-b border-slate-200 pb-2 font-semibold text-xs text-slate-500 uppercase tracking-wider">
          Header Brand & Title Texts
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Header Top Left Brand Name</label>
            <input className={inputCls} value={brandTitle} onChange={(e) => setBrandTitle(e.target.value)} placeholder="Business Help Services" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Header Top Left Subtitle</label>
            <input className={inputCls} value={brandSubtitle} onChange={(e) => setBrandSubtitle(e.target.value)} placeholder="Business Consultancy & Assistance Services" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Header Center Title (Hindi / Primary Text)</label>
            <input className={inputCls} value={centerTitle} onChange={(e) => setCenterTitle(e.target.value)} placeholder="सूक्ष्म, लघु और मध्यम उद्यम पंजीकरण सहायता सेवा" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Header Center Subtitle (English Subtext)</label>
            <input className={inputCls} value={centerSubtitle} onChange={(e) => setCenterSubtitle(e.target.value)} placeholder="REGISTRATION ADVISORY FOR MICRO, SMALL & MEDIUM ENTERPRISES" />
          </div>
        </div>

        <div className="border-b border-slate-200 pb-2 pt-2 font-semibold text-xs text-slate-500 uppercase tracking-wider">
          Footer Brand & Contact Section Texts
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Footer Column 1 Heading</label>
            <input className={inputCls} value={footerBrandHeading} onChange={(e) => setFooterBrandHeading(e.target.value)} placeholder="Business Help Services" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Footer Get In Touch Company Name</label>
            <input className={inputCls} value={footerContactName} onChange={(e) => setFooterContactName(e.target.value)} placeholder="Business Help Services" />
          </div>
        </div>

        {msg && <p className="text-xs text-emerald-600 font-medium">{msg}</p>}

        <div className="pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={saveAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
          >
            <Save className="size-3.5" /> {busy ? "Saving…" : "Save Header & Footer Text Settings"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="font-semibold text-sm">{title}</h2>
      </header>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function ContactCard({
  website,
  onSave,
  onSaved,
}: {
  website: Record<string, unknown>;
  onSave: (a: { data: Record<string, unknown> }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    support_email: (website.support_email as string) ?? "",
    support_phone: (website.support_phone as string) ?? "",
    whatsapp_number: (website.whatsapp_number as string) ?? "",
    business_hours: (website.business_hours as string) ?? "",
    postal_address: (website.postal_address as string) ?? "",
    footer_unlock_code: (website.footer_unlock_code as string) ?? "",
    legal_footer_line: (website.legal_footer_line as string) ?? "",
  }));

  useEffect(() => {
    setForm({
      support_email: (website.support_email as string) ?? "",
      support_phone: (website.support_phone as string) ?? "",
      whatsapp_number: (website.whatsapp_number as string) ?? "",
      business_hours: (website.business_hours as string) ?? "",
      postal_address: (website.postal_address as string) ?? "",
      footer_unlock_code: (website.footer_unlock_code as string) ?? "",
      legal_footer_line: (website.legal_footer_line as string) ?? "",
    });
  }, [website]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await onSave({
        data: {
          websiteId: website.id,
          ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()])),
        },
      });
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fields: Array<[keyof typeof form, string]> = [
    ["support_email", "Support email"],
    ["support_phone", "Support phone"],
    ["whatsapp_number", "WhatsApp number"],
    ["business_hours", "Business hours"],
    ["postal_address", "Postal address"],
    ["footer_unlock_code", "Footer SEO-tree unlock code"],
    ["legal_footer_line", "Legal footer line"],
  ];

  return (
    <Card title="Contact & legal">
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(([k, label]) => (
          <label key={k} className="text-sm space-y-1">
            <span className="text-muted-foreground">{label}</span>
            <input
              className={inputCls}
              value={form[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> Save
        </button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </Card>
  );
}

function NavCard({
  group,
  title,
  websiteId,
  rows,
  onSave,
  onDelete,
  onSaved,
}: {
  group: "header" | "footer";
  title: string;
  websiteId: string;
  rows: NavRow[];
  onSave: (a: { data: Record<string, unknown> }) => Promise<unknown>;
  onDelete: (a: { data: { id: string } }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<NavRow[]>(rows);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setDraft(rows), [rows]);

  const patch = (id: string, p: Partial<NavRow>) =>
    setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const persist = async (row: NavRow) => {
    setMsg(null);
    try {
      await onSave({
        data: {
          id: row.id.startsWith("new-") ? undefined : row.id,
          website_id: websiteId,
          nav_group: group,
          label: row.label,
          path: row.path,
          open_in_new: row.open_in_new,
          is_active: row.is_active,
          sort_order: row.sort_order,
        },
      });
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const remove = async (row: NavRow) => {
    if (row.id.startsWith("new-")) {
      setDraft((d) => d.filter((r) => r.id !== row.id));
      return;
    }
    await onDelete({ data: { id: row.id } });
    onSaved();
  };

  const nextOrder = useMemo(() => (draft.length ? Math.max(...draft.map((r) => r.sort_order)) + 10 : 0), [draft]);

  return (
    <Card title={title}>
      <div className="space-y-2">
        {draft.map((r) => (
          <div key={r.id} className="grid gap-2 md:grid-cols-[1fr_1fr_80px_auto_auto_auto] items-center">
            <input className={inputCls} value={r.label} placeholder="Label" onChange={(e) => patch(r.id, { label: e.target.value })} />
            <input className={inputCls} value={r.path} placeholder="/path" onChange={(e) => patch(r.id, { path: e.target.value })} />
            <input
              className={inputCls}
              type="number"
              value={r.sort_order}
              onChange={(e) => patch(r.id, { sort_order: Number(e.target.value) })}
            />
            <label className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={r.is_active} onChange={(e) => patch(r.id, { is_active: e.target.checked })} />
              Active
            </label>
            <button type="button" onClick={() => persist(r)} className="rounded-md border border-border px-2 py-2 text-xs">
              <Save className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => remove(r)} className="rounded-md border border-border px-2 py-2 text-xs text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm"
          onClick={() =>
            setDraft((d) => [
              ...d,
              {
                id: `new-${Date.now()}`,
                website_id: websiteId,
                nav_group: group,
                label: "",
                path: "/",
                open_in_new: false,
                is_active: true,
                sort_order: nextOrder,
              },
            ])
          }
        >
          <Plus className="w-4 h-4" /> Add link
        </button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </Card>
  );
}

function BlocksCard({
  websiteId,
  blocks,
  onSave,
  onSaved,
}: {
  websiteId: string;
  blocks: Array<{ block_key: string; content: unknown; is_active: boolean }>;
  onSave: (a: { data: Record<string, unknown> }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const keys = useMemo(() => {
    const set = new Set<string>(KNOWN_BLOCK_KEYS);
    for (const b of blocks) set.add(b.block_key);
    return [...set];
  }, [blocks]);

  return (
    <Card title="Content blocks">
      <p className="text-xs text-muted-foreground">
        Each block is JSON. Leave a block empty to keep the built-in default from code.
      </p>
      {keys.map((k) => (
        <BlockEditor
          key={k}
          blockKey={k}
          websiteId={websiteId}
          initial={blocks.find((b) => b.block_key === k)?.content}
          onSave={onSave}
          onSaved={onSaved}
        />
      ))}
    </Card>
  );
}

function BlockEditor({
  blockKey,
  websiteId,
  initial,
  onSave,
  onSaved,
}: {
  blockKey: string;
  websiteId: string;
  initial: unknown;
  onSave: (a: { data: Record<string, unknown> }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [text, setText] = useState(() => (initial ? JSON.stringify(initial, null, 2) : ""));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = text.trim() === "" ? {} : JSON.parse(text);
    } catch {
      setMsg("Invalid JSON");
      return;
    }
    setBusy(true);
    try {
      await onSave({ data: { website_id: websiteId, block_key: blockKey, content: parsed, is_active: true } });
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs font-semibold">{blockKey}</code>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
      <textarea
        className={`${inputCls} font-mono text-xs min-h-28`}
        placeholder={BLOCK_HINTS[blockKey] ?? "{}"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
