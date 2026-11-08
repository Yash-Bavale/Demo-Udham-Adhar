import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listTelephonyAccounts, migrateLegacyTelephonyAccount, saveTelephonyAccount } from "@/lib/telephony/telephony-accounts.functions";

type Form = { employeeId: string; memberId: string; sipUsername: string; displayName: string; password: string; status: "unprovisioned" | "active" | "disabled" };
const EMPTY: Form = { employeeId: "", memberId: "", sipUsername: "", displayName: "", password: "", status: "active" };

/** Admin-only management of per-employee CallerDesk browser phone logins. Passwords are write-only. */
export function TelephonyAccounts() {
  const qc = useQueryClient();
  const list = useServerFn(listTelephonyAccounts);
  const save = useServerFn(saveTelephonyAccount);
  const migrate = useServerFn(migrateLegacyTelephonyAccount);
  const { data, error } = useQuery({ queryKey: ["telephony-accounts"], queryFn: () => list(), retry: false });
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  if (error) return null;
  const names = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));
  const legacyPending = data && data.legacyEmployeeIds.some((id) => !data.accounts.some((a) => a.employeeId === id));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); setF(EMPTY); await qc.invalidateQueries({ queryKey: ["telephony-accounts"] }); await qc.invalidateQueries({ queryKey: ["webrtc-status"] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const input = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-semibold">Browser phone accounts</h2>
        <p className="text-xs text-muted-foreground">Each employee signs in to CallerDesk with their own SIP login. Passwords are encrypted and never shown again.</p>
      </div>
      {legacyPending ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs">
          <span>Sid still uses the original shared login.</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => migrate(), "Sid's login moved to his own encrypted account.")}>Move to encrypted account</Button>
        </div>
      ) : null}
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Employee</th><th>SIP username</th><th>Member ID</th><th>Status</th><th>Password</th><th /></tr></thead>
        <tbody>
          {(data?.accounts ?? []).map((a) => (
            <tr key={a.employeeId} className="border-t">
              <td className="py-1.5">{names.get(a.employeeId) ?? "Employee"}</td>
              <td className="font-mono text-xs">{a.sipUsername ?? "—"}</td>
              <td className="font-mono text-xs">{a.memberId ?? "—"}</td>
              <td className="capitalize">{a.status}</td>
              <td className="text-xs">{a.hasPassword ? "Saved" : "Missing"}</td>
              <td><Button size="sm" variant="ghost" onClick={() => setF({ employeeId: a.employeeId, memberId: a.memberId ?? "", sipUsername: a.sipUsername ?? "", displayName: a.displayName ?? "", password: "", status: a.status })}>Edit</Button></td>
            </tr>
          ))}
          {data && !data.accounts.length ? <tr><td colSpan={6} className="py-2 text-xs text-muted-foreground">No browser phone accounts yet.</td></tr> : null}
        </tbody>
      </table>
      <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void run(() => save({ data: f }), "Browser phone account saved."); }}>
        <select className={input} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} required>
          <option value="">Choose employee…</option>
          {(data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className={input} placeholder="SIP username (agent mobile)" value={f.sipUsername} onChange={(e) => setF({ ...f, sipUsername: e.target.value })} required />
        <input className={input} type="password" autoComplete="new-password" placeholder={f.employeeId && data?.accounts.some((a) => a.employeeId === f.employeeId && a.hasPassword) ? "SIP password (leave blank to keep)" : "SIP password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <input className={input} placeholder="Display name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        <input className={input} placeholder="CallerDesk Member ID" value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value.replace(/\D/g, "") })} />
        <select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Form["status"] })}>
          <option value="active">Active</option><option value="unprovisioned">Not set up</option><option value="disabled">Switched off</option>
        </select>
        <Button type="submit" size="sm" disabled={busy} className="sm:col-span-3">Save account</Button>
      </form>
    </section>
  );
}
