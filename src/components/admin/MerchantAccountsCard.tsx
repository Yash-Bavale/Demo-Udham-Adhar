import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCashfreeAccounts, saveCashfreeAccount, setCashfreeAccountActive } from "@/lib/payments/gateways.functions";

type Form = { accountId?: string; label: string; accountKey: string; clientId: string; clientSecret: string; mode: "production" | "sandbox" };
const EMPTY: Form = { label: "", accountKey: "", clientId: "", clientSecret: "", mode: "production" };

/** Cashfree merchant accounts (MIDs): add keys once, then pick an account per website below. */
export function MerchantAccountsCard() {
  const listFn = useServerFn(listCashfreeAccounts);
  const saveFn = useServerFn(saveCashfreeAccount);
  const activeFn = useServerFn(setCashfreeAccountActive);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin.cashfree-accounts"], queryFn: () => listFn() });
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin.cashfree-accounts"] });
    await qc.invalidateQueries({ queryKey: ["admin.website-gateways"] });
  };

  async function submit() {
    if (!form) return;
    setSaving(true); setMsg(null);
    try {
      const res = await saveFn({ data: { ...form, accountKey: form.accountId ? undefined : form.accountKey } });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) { setForm(null); await refresh(); }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      // Never keep secrets in memory longer than needed.
      setForm((f) => (f ? { ...f, clientSecret: "" } : f));
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cashfree merchant accounts (MIDs)</h2>
          <p className="text-sm text-muted-foreground">Add each Cashfree account's keys once. Keys are checked with Cashfree, stored encrypted, and never shown again.</p>
        </div>
        <button onClick={() => { setForm({ ...EMPTY }); setMsg(null); }} className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          + Add merchant account
        </button>
      </div>

      {msg ? <p className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p> : null}

      {form ? (
        <div className="grid gap-3 rounded-md border bg-card p-4 sm:grid-cols-2">
          <label className="text-xs space-y-1">Account name
            <input className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={form.label} placeholder="e.g. GST website MID"
              onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          {!form.accountId ? (
            <label className="text-xs space-y-1">Short code
              <input className="w-full rounded border bg-background px-2 py-1.5 font-mono text-sm uppercase" value={form.accountKey} placeholder="e.g. GST_MID"
                onChange={(e) => setForm({ ...form, accountKey: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} />
            </label>
          ) : <div />}
          <label className="text-xs space-y-1">App ID (Client ID)
            <input className="w-full rounded border bg-background px-2 py-1.5 font-mono text-sm" autoComplete="off" value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
          </label>
          <label className="text-xs space-y-1">Secret Key
            <input type="password" className="w-full rounded border bg-background px-2 py-1.5 font-mono text-sm" autoComplete="new-password" value={form.clientSecret}
              onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} />
          </label>
          <label className="text-xs space-y-1">Mode
            <select className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as Form["mode"] })}>
              <option value="production">Live</option>
              <option value="sandbox">Test (sandbox)</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button disabled={saving || !form.label || !form.clientId || !form.clientSecret || (!form.accountId && !form.accountKey)} onClick={submit}
              className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
              {saving ? "Checking with Cashfree…" : "Test & save"}
            </button>
            <button onClick={() => setForm(null)} className="rounded border px-3 py-1.5 text-xs">Cancel</button>
          </div>
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">Loading accounts…</p> : null}
      {error ? <p className="text-sm text-destructive">Could not load merchant accounts.</p> : null}
      {data ? (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Account</th><th className="p-3">Keys</th><th className="p-3">Mode</th><th className="p-3">Websites</th><th className="p-3">Status</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {data.accounts.map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3"><div className="font-medium">{a.label}</div><div className="font-mono text-xs text-muted-foreground">{a.key}</div></td>
                  <td className="p-3 text-xs">
                    {a.credentials === "global" ? "Main project keys" : a.credentials === "saved" ? <span className="font-mono">{a.clientIdHint}</span> : <span className="text-destructive">Missing</span>}
                  </td>
                  <td className="p-3 text-xs">{a.mode === "production" ? "Live" : a.mode === "sandbox" ? "Test" : a.isLegacy ? "Live" : "—"}</td>
                  <td className="p-3 text-xs">{a.websites}</td>
                  <td className="p-3 text-xs">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={a.isActive} disabled={a.isLegacy}
                        onChange={async (e) => {
                          try { await activeFn({ data: { accountId: a.id, isActive: e.target.checked } }); await refresh(); }
                          catch (er) { setMsg({ ok: false, text: (er as Error).message }); }
                        }} />
                      {a.isActive ? "Active" : "Off"}
                    </label>
                  </td>
                  <td className="p-3 text-right">
                    {!a.isLegacy ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => { setForm({ accountId: a.id, label: a.label, accountKey: a.key, clientId: "", clientSecret: "", mode: a.mode ?? "production" }); setMsg(null); }}>
                        {a.credentials === "saved" ? "Replace keys" : "Add keys"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
