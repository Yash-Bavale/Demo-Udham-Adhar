import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listSettlements, importSettlementCsv, getUnreconciledPayments } from "@/lib/finance/settlements.functions";

export const Route = createFileRoute("/admin/finance/settlements")({ component: SettlementsPage });

function SettlementsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSettlements);
  const importFn = useServerFn(importSettlementCsv);
  const unrecFn = useServerFn(getUnreconciledPayments);

  const [gateway, setGateway] = useState<"payu" | "razorpay">("payu");
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["settlements"], queryFn: () => listFn({ data: { limit: 100 } }) });
  const { data: unrec } = useQuery({ queryKey: ["settlements.unrec"], queryFn: () => unrecFn() });

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Settlements</h1>

      <div className="rounded-lg border bg-white p-4 space-y-2">
        <div className="text-sm font-semibold">Import settlement CSV</div>
        <div className="flex gap-2 items-center">
          <select value={gateway} onChange={(e) => setGateway(e.target.value as any)}
            className="rounded border px-3 py-1.5 text-sm">
            <option value="payu">PayU</option>
            <option value="razorpay">Razorpay</option>
          </select>
          <input type="file" accept=".csv" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setCsvText(await f.text());
          }} className="text-sm" />
          <button
            disabled={busy || !csvText}
            onClick={async () => {
              setBusy(true); setMsg(null);
              try {
                const r = await importFn({ data: { gateway, csvText } });
                setMsg(`Imported ${r.settlementsCreated} settlements, ${r.linksCreated} links, ${r.unmatched} unmatched.`);
                await qc.invalidateQueries({ queryKey: ["settlements"] });
                await qc.invalidateQueries({ queryKey: ["settlements.unrec"] });
              } catch (err: any) { setMsg(err.message); }
              setBusy(false);
            }}
            className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-40">Import</button>
        </div>
        {msg && <div className="text-xs text-slate-600">{msg}</div>}
      </div>

      <div className="rounded-lg border bg-white">
        <div className="px-4 py-2 border-b text-sm font-semibold">Recent settlements</div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 uppercase"><tr>
            <th className="text-left p-2">Date</th><th className="text-left">Gateway</th>
            <th className="text-left">Settlement ID</th><th className="text-right">Gross</th>
            <th className="text-right">Fees</th><th className="text-right">Net</th><th className="text-right">#</th>
          </tr></thead>
          <tbody>
            {(data?.rows ?? []).map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-2">{new Date(s.settled_at).toLocaleDateString("en-IN")}</td>
                <td className="uppercase">{s.gateway}</td>
                <td className="font-mono text-xs">{s.settlement_id}</td>
                <td className="text-right">{fmt(s.gross)}</td>
                <td className="text-right">{fmt(s.fees + s.tax_on_fees)}</td>
                <td className="text-right font-medium">{fmt(s.net)}</td>
                <td className="text-right">{s.payment_count}</td>
              </tr>
            ))}
            {(!data || data.rows.length === 0) && (
              <tr><td colSpan={7} className="p-3 text-center text-slate-500">No settlements imported yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-amber-50 border-amber-200">
        <div className="px-4 py-2 border-b border-amber-200 text-sm font-semibold">
          Unreconciled payments ({unrec?.rows.length ?? 0})
        </div>
        <table className="w-full text-sm">
          <tbody>
            {(unrec?.rows ?? []).map((p) => (
              <tr key={p.id} className="border-t border-amber-200">
                <td className="p-2 font-mono text-xs">{p.transaction_id}</td>
                <td className="uppercase">{p.gateway_name}</td>
                <td className="text-right p-2">{fmt(Number(p.amount))}</td>
                <td className="text-right p-2 text-xs text-slate-500">
                  {p.payment_date ? new Date(p.payment_date).toLocaleDateString("en-IN") : "—"}
                </td>
              </tr>
            ))}
            {(!unrec || unrec.rows.length === 0) && (
              <tr><td className="p-3 text-center text-slate-500">All paid payments older than 7 days are reconciled.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
