import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getEmailDashboard,
  getSmtpSettings,
  saveSmtpSettings,
  sendTestEmail,
  processEmailQueueNow,
  retryFailedEmailsNow,
  listEmailTemplates,
  saveEmailTemplate,
  duplicateEmailTemplate,
  deleteEmailTemplate,
  listEmailLogs,
  sendTestTemplateEmail,
  getMailProviderSetting,
  setMailProviderSetting,
} from "@/lib/emails/emails.functions";

// ───────────────── Sending service switcher ─────────────────
function ProviderSwitcher() {
  const getFn = useServerFn(getMailProviderSetting);
  const setFn = useServerFn(setMailProviderSetting);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin.emails.provider"], queryFn: () => getFn() });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const choose = async (choice: "auto" | "zoho" | "zeptomail") => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await setFn({ data: { choice } });
      setMsg(`Saved. Emails now send through ${r.active === "zeptomail" ? "ZeptoMail" : "Zoho Mail API"}.`);
      await qc.invalidateQueries({ queryKey: ["admin.emails.provider"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const options: { key: "auto" | "zoho" | "zeptomail"; label: string; hint: string }[] = [
    { key: "zeptomail", label: "ZeptoMail", hint: "Zoho ZeptoMail transactional API" },
    { key: "zoho", label: "Zoho Mail API", hint: "Regular Zoho mailbox sending" },
    { key: "auto", label: "Automatic", hint: "ZeptoMail when available, else Zoho" },
  ];

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-medium">Sending service</div>
          <div className="text-sm text-slate-500">
            {isLoading
              ? "Loading…"
              : `Currently sending via ${data?.active === "zeptomail" ? "ZeptoMail" : "Zoho Mail API"}${
                  data?.senderEmail ? ` from ${data.senderEmail}` : ""
                }`}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {options.map((o) => {
            const selected = data?.choice === o.key;
            const disabled = busy || (o.key === "zeptomail" && data?.zeptoConfigured === false);
            return (
              <button
                key={o.key}
                title={disabled && o.key === "zeptomail" ? "ZeptoMail token not configured" : o.hint}
                disabled={disabled}
                onClick={() => choose(o.key)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {msg && <div className="mt-2 text-sm text-slate-600">{msg}</div>}
    </div>
  );
}

export const Route = createFileRoute("/admin/emails")({ component: EmailsPage });

type Tab = "dashboard" | "smtp" | "templates" | "logs";

function EmailsPage() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Email System</h1>
      </div>

      <div className="flex gap-2 border-b">
        {(["dashboard", "smtp", "templates", "logs"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "dashboard" ? "Dashboard" : t === "smtp" ? "SMTP Settings" : t === "templates" ? "Templates" : "Logs"}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "smtp" && <SmtpTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

// ───────────────── Dashboard ─────────────────
function DashboardTab() {
  const fn = useServerFn(getEmailDashboard);
  const process = useServerFn(processEmailQueueNow);
  const retryFailed = useServerFn(retryFailedEmailsNow);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin.emails.dash"], queryFn: () => fn({ data: {} as never }) });
  const [busy, setBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  if (isLoading) return <div className="text-sm text-slate-500">Loading…</div>;
  const c = data?.counts;
  const failedRows = data?.failedRows ?? [];

  return (
    <div className="space-y-4">
      <ProviderSwitcher />
      <div className="grid md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Stat label="Queued" value={c?.queued ?? 0} tone="default" />
        <Stat label="Sending" value={c?.sending ?? 0} tone="info" />
        <Stat label="Failed (retrying)" value={c?.failed ?? 0} tone="danger" />
        <Stat label="Sent (24h)" value={c?.sent24h ?? 0} tone="success" />
        <Stat label="Sent (7d)" value={c?.sent7d ?? 0} tone="success" />
        <Stat label="Dead-letter" value={c?.dlq ?? 0} tone="danger" />
        <Stat label="Queue Unmatched" value={c?.queueUnmatched ?? 0} tone="danger" />
        <Stat label="Sent Unmatched" value={c?.sentLogsUnmatched ?? 0} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await process({ data: {} as never }); await qc.invalidateQueries({ queryKey: ["admin.emails.dash"] }); }
            finally { setBusy(false); }
          }}
          className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {busy ? "Processing…" : "Process queue now"}
        </button>
        <button
          disabled={retryBusy}
          onClick={async () => {
            setRetryBusy(true);
            setRetryMsg(null);
            try {
              const r = await retryFailed({ data: { limit: 50 } });
              setRetryMsg(`Tried ${r.processed} held email(s) — ${r.sent} sent, ${r.failed} still failing.`);
              await qc.invalidateQueries({ queryKey: ["admin.emails.dash"] });
            } catch (e) {
              setRetryMsg(e instanceof Error ? e.message : "Retry failed");
            } finally { setRetryBusy(false); }
          }}
          className="rounded border border-red-300 bg-red-50 text-red-700 px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {retryBusy ? "Retrying…" : `Retry failed emails (${c?.failed ?? 0})`}
        </button>
        {retryMsg && <span className="text-xs text-slate-600">{retryMsg}</span>}
      </div>

      <Section title={`Failed queue (${c?.failed ?? 0}) — held, will be retried`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Created</th><th className="p-2">To</th><th className="p-2">Subject</th>
                <th className="p-2">Attempts</th><th className="p-2">Next try</th><th className="p-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {failedRows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2">{r.to_email}</td>
                  <td className="p-2">{r.subject}</td>
                  <td className="p-2 text-xs">{r.attempts}/{r.max_attempts}</td>
                  <td className="p-2 text-xs whitespace-nowrap">{new Date(r.next_attempt_at).toLocaleString()}</td>
                  <td className="p-2 text-xs text-red-600 max-w-md break-words">{r.last_error ?? ""}</td>
                </tr>
              ))}
              {failedRows.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400 text-sm">No failed emails.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>


      <Section title="Recent send attempts">
        <div className="mb-2 text-xs text-slate-500">
          Provider: <span className="font-medium text-emerald-700">Zoho Mail API</span> · every send is logged in <code className="font-mono">email_send_log</code>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="p-2">When</th><th className="p-2">To</th><th className="p-2">Subject</th><th className="p-2">Status</th><th className="p-2">Error</th></tr>
            </thead>
            <tbody>
              {(data?.recentLogs ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 text-xs">{new Date(r.sent_at).toLocaleString()}</td>
                  <td className="p-2">{r.to_email}</td>
                  <td className="p-2">{r.subject}</td>
                  <td className="p-2"><StatusBadge status={r.status} /></td>
                  <td className="p-2 text-xs text-red-600 truncate max-w-xs">{r.error_message ?? ""}</td>
                </tr>
              ))}
              {(data?.recentLogs ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400 text-sm">No emails sent yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>


    </div>
  );
}

// ───────────────── SMTP Settings ─────────────────
function SmtpTab() {
  const getFn = useServerFn(getSmtpSettings);
  const saveFn = useServerFn(saveSmtpSettings);
  const testFn = useServerFn(sendTestEmail);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin.emails.smtp"], queryFn: () => getFn() });

  const [form, setForm] = useState<null | {
    from_email: string; from_name: string; reply_to: string;
    daily_quota: number; is_enabled: boolean; notes: string;
  }>(null);
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const s = data?.settings;
  const eff = form ?? {
    from_email: s?.from_email ?? "",
    from_name: s?.from_name ?? "Business Help Services",
    reply_to: s?.reply_to ?? "",
    daily_quota: s?.daily_quota ?? 2000,
    is_enabled: s?.is_enabled ?? false,
    notes: s?.notes ?? "",
  };

  if (isLoading) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <Section title="Provider">
        <p className="text-sm text-slate-700">
          Emails are now sent via <b>Zoho Mail API</b> from <code className="mx-1 font-mono">help@busiesshelpservices.com</code>
          using the connected Zoho OAuth mailbox. Update Zoho OAuth secrets only if the mailbox authorization changes.
          The fields below only control the visible <i>From name</i> and <i>Reply-To</i> on outgoing mail.
        </p>
      </Section>


      <Section title="Sender Settings">
        <div className="grid md:grid-cols-2 gap-3">
          <Input label="From Email" value={eff.from_email} onChange={(v) => setForm({ ...eff, from_email: v })} />
          <Input label="From Name" value={eff.from_name} onChange={(v) => setForm({ ...eff, from_name: v })} />
          <div>
            <Input label="Reply-To" value={eff.reply_to} onChange={(v) => setForm({ ...eff, reply_to: v })} />
            <p className="mt-1 text-[11px] text-slate-500">Must be the mailbox connected to the Zoho poller (e.g. <code>help@businesshelpservices.com</code>) — replies here become support tickets automatically.</p>
          </div>
          <Input label="Daily Quota" type="number" value={String(eff.daily_quota)} onChange={(v) => setForm({ ...eff, daily_quota: Number(v) })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={eff.is_enabled} onChange={(e) => setForm({ ...eff, is_enabled: e.target.checked })} />
            Enable email sending
          </label>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              rows={2}
              value={eff.notes}
              onChange={(e) => setForm({ ...eff, notes: e.target.value })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={async () => {
              setMsg(null);
              try {
                await saveFn({
                  data: {
                    from_email: eff.from_email.trim(),
                    from_name: eff.from_name.trim(),
                    reply_to: eff.reply_to ? eff.reply_to.trim() : null,
                    daily_quota: eff.daily_quota,
                    is_enabled: eff.is_enabled,
                    notes: eff.notes || null,
                  },
                });
                await qc.invalidateQueries({ queryKey: ["admin.emails.smtp"] });
                setForm(null);
                setMsg("Saved.");
              } catch (e) { setMsg((e as Error).message); }
            }}
            className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm"
          >
            Save settings
          </button>
        </div>
      </Section>

      <Section title="Send a Test Email">
        <div className="flex gap-2 items-end">
          <Input label="To" value={testTo} onChange={setTestTo} />
          <button
            onClick={async () => {
              setMsg(null);
              try {
                const r = await testFn({ data: { toEmail: testTo } });
                setMsg(`Queued — sent ${r.sent}, failed ${r.failed}.`);
                await qc.invalidateQueries({ queryKey: ["admin.emails.dash"] });
              } catch (e) { setMsg((e as Error).message); }
            }}
            className="rounded bg-emerald-600 text-white px-3 py-1.5 text-sm h-9"
          >
            Send test
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
      </Section>
    </div>
  );
}

// ───────────────── Templates ─────────────────
type TplForm = {
  id?: string; code: string; name: string; subject: string;
  body_html: string; body_text: string; description: string;
  variables: string; is_enabled: boolean;
};
const emptyTpl = (): TplForm => ({ code: "", name: "", subject: "", body_html: "", body_text: "", description: "", variables: "", is_enabled: true });

function TemplatesTab() {
  const listFn = useServerFn(listEmailTemplates);
  const saveFn = useServerFn(saveEmailTemplate);
  const dupFn = useServerFn(duplicateEmailTemplate);
  const delFn = useServerFn(deleteEmailTemplate);
  const testTplFn = useServerFn(sendTestTemplateEmail);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin.emails.templates"], queryFn: () => listFn() });
  const [form, setForm] = useState<TplForm | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Test-by-template console state
  const [testCode, setTestCode] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testVars, setTestVars] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);

  const runTest = async (code: string, to: string, varsJson?: string) => {
    setTestMsg(null);
    const r = await testTplFn({ data: { code, toEmail: to, variablesJson: varsJson } });
    return `Template "${r.template}" — sent ${r.sent}, failed ${r.failed}.`;
  };

  if (isLoading) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <Section title="Send test by template (end-to-end verify)">
        <p className="text-xs text-slate-500 mb-2">
          Sends a sample of the selected template via Zoho Mail API using auto-generated sample variables
          (override any with JSON). Disabled templates are still sent for testing and prefixed with [TEST].
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
            <select
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Select template —</option>
              {(data?.rows ?? []).map((t) => (
                <option key={t.id} value={t.code}>
                  {t.name} ({t.code}){t.is_enabled ? "" : " — disabled"}
                </option>
              ))}
            </select>
          </div>
          <Input label="Recipient" value={testTo} onChange={setTestTo} />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Variables override (JSON, optional)</label>
            <input
              value={testVars}
              onChange={(e) => setTestVars(e.target.value)}
              placeholder='{"customer_name":"Asha"}'
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            disabled={testBusy || !testCode || !testTo}
            onClick={async () => {
              setTestBusy(true);
              try {
                const m = await runTest(testCode, testTo, testVars || undefined);
                setTestMsg(m);
                await qc.invalidateQueries({ queryKey: ["admin.emails.logs"] });
                await qc.invalidateQueries({ queryKey: ["admin.emails.dash"] });
              } catch (e) { setTestMsg((e as Error).message); }
              finally { setTestBusy(false); }
            }}
            className="rounded bg-emerald-600 text-white px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {testBusy ? "Sending…" : "Send test"}
          </button>
          {testMsg && <span className="text-xs text-slate-600">{testMsg}</span>}
        </div>
      </Section>

      <div className="flex justify-end">
        <button onClick={() => { setForm(emptyTpl()); setErr(null); }} className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm">+ New Template</button>
      </div>


      {form && (
        <Section title={form.id ? "Edit template" : "New template"}>
          <div className="grid md:grid-cols-2 gap-3">
            <Input label="Code (lowercase, _)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
            <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <div className="md:col-span-2">
              <Input label="Subject (use {{var}})" value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">HTML body</label>
              <textarea rows={8} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Plain-text body (optional)</label>
              <textarea rows={3} value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono" />
            </div>
            <Input label="Variables (comma-separated)" value={form.variables} onChange={(v) => setForm({ ...form, variables: v })} />
            <Input label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} />
              Enabled
            </label>
          </div>
          {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                setErr(null);
                try {
                  await saveFn({
                    data: {
                      id: form.id,
                      code: form.code.trim(),
                      name: form.name.trim(),
                      subject: form.subject,
                      body_html: form.body_html,
                      body_text: form.body_text || null,
                      description: form.description || null,
                      variables: form.variables.split(",").map((s) => s.trim()).filter(Boolean),
                      is_enabled: form.is_enabled,
                    },
                  });
                  await qc.invalidateQueries({ queryKey: ["admin.emails.templates"] });
                  setForm(null);
                } catch (e) { setErr((e as Error).message); }
              }}
              className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm"
            >Save</button>
            <button onClick={() => setForm(null)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
          </div>
        </Section>
      )}

      <Section title="Templates">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="p-2">Name</th><th className="p-2">Code</th><th className="p-2">Subject</th><th className="p-2">Status</th><th className="p-2 w-44">Actions</th></tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2 font-medium">{t.name} {t.is_system && <span className="ml-1 text-[10px] text-slate-400">SYSTEM</span>}</td>
                  <td className="p-2 text-xs font-mono">{t.code}</td>
                  <td className="p-2 text-xs">{t.subject}</td>
                  <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded ${t.is_enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{t.is_enabled ? "Enabled" : "Disabled"}</span></td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <button onClick={() => setForm({
                        id: t.id, code: t.code, name: t.name, subject: t.subject,
                        body_html: t.body_html, body_text: t.body_text ?? "",
                        description: t.description ?? "", variables: (t.variables ?? []).join(", "),
                        is_enabled: t.is_enabled,
                      })} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={async () => {
                        await dupFn({ data: { id: t.id } });
                        await qc.invalidateQueries({ queryKey: ["admin.emails.templates"] });
                      }} className="text-xs text-slate-600 hover:underline">Duplicate</button>
                      <button
                        disabled={rowBusy === t.code}
                        onClick={async () => {
                          const to = window.prompt(`Send a test of "${t.name}" to which email?`, testTo || "");
                          if (!to) return;
                          setRowBusy(t.code);
                          setRowMsg(null);
                          try {
                            const m = await runTest(t.code, to);
                            setRowMsg(`✓ ${m}`);
                            setTestTo(to);
                            await qc.invalidateQueries({ queryKey: ["admin.emails.logs"] });
                            await qc.invalidateQueries({ queryKey: ["admin.emails.dash"] });
                          } catch (e) { setRowMsg(`✗ ${t.code}: ${(e as Error).message}`); }
                          finally { setRowBusy(null); }
                        }}
                        className="text-xs text-emerald-700 hover:underline disabled:opacity-40"
                      >{rowBusy === t.code ? "Sending…" : "Send test"}</button>
                      {!t.is_system && (
                        <button onClick={async () => {
                          if (!confirm(`Delete template "${t.name}"?`)) return;
                          await delFn({ data: { id: t.id } });
                          await qc.invalidateQueries({ queryKey: ["admin.emails.templates"] });
                        }} className="text-xs text-red-600 hover:underline">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rowMsg && <p className="mt-2 text-xs text-slate-600">{rowMsg}</p>}
      </Section>
    </div>
  );
}

// ───────────────── Logs ─────────────────
function LogsTab() {
  const fn = useServerFn(listEmailLogs);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "sent" | "failed" | "bounced">("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["admin.emails.logs", search, status, page],
    queryFn: () => fn({ data: { search: search || undefined, status: status || undefined, page, pageSize: 50 } as never }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by email or subject"
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={status} onChange={(e) => { setStatus(e.target.value as never); setPage(1); }}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <Section title={`Logs (${data?.total ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="p-2">When</th><th className="p-2">To</th><th className="p-2">Template</th><th className="p-2">Subject</th><th className="p-2">Status</th><th className="p-2">Attempt</th><th className="p-2">Error</th></tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 text-xs">{new Date(r.sent_at).toLocaleString()}</td>
                    <td className="p-2">{r.to_email}</td>
                    <td className="p-2 text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{r.template_code ?? "NO_TEMPLATE"}</span>
                        {r.template_exists === false && (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 border border-rose-200">
                            unmatched
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-xs">{r.subject}</td>
                    <td className="p-2"><StatusBadge status={r.status} /></td>
                    <td className="p-2 text-xs">{r.attempt}</td>
                    <td className="p-2 text-xs text-red-600 truncate max-w-xs">{r.error_message ?? ""}</td>
                  </tr>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-center text-slate-400 text-sm">No log entries.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-between items-center text-xs text-slate-500">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Prev</button>
              <button disabled={(data?.rows ?? []).length < 50} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ───────────────── UI bits ─────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: number; tone: "default" | "info" | "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-emerald-700 bg-emerald-50"
    : tone === "danger" ? "text-red-700 bg-red-50"
    : tone === "info" ? "text-blue-700 bg-blue-50"
    : "text-slate-700 bg-slate-50";
  return (
    <div className={`rounded-lg p-4 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const cls = status === "sent" ? "bg-emerald-100 text-emerald-700"
    : status === "failed" || status === "bounced" ? "bg-red-100 text-red-700"
    : "bg-slate-100 text-slate-600";
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{status}</span>;
}
function Cred({ label, set }: { label: string; set: boolean | undefined }) {
  return (
    <div className="rounded border p-2 flex items-center justify-between">
      <span className="font-mono text-xs">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded ${set ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
        {set ? "Configured" : "Missing"}
      </span>
    </div>
  );
}
