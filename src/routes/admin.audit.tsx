import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listAuditLogs } from "@/lib/crm/audit.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/audit")({ component: AuditPage });

function AuditPage() {
  const fetchFn = useServerFn(listAuditLogs);
  const [entityType, setEntityType] = useState("");
  const [actorEmail, setActorEmail] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin.audit", entityType, actorEmail],
    queryFn: () => fetchFn({ data: { entityType: entityType || undefined, actorEmail: actorEmail || undefined, limit: 200 } }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6" /> Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Every privileged action across the admin panel. Super admin only.</p>
      </div>

      <Card>
        <CardHeader className="py-3 border-b bg-slate-50/50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-sm font-semibold">Filter</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-8 rounded-md border px-2 text-xs">
                <option value="">All entity types</option>
                <option value="lead">Lead</option><option value="application">Application</option>
                <option value="complaint">Complaint</option><option value="payment">Payment</option>
                <option value="onboarding">Onboarding</option><option value="document">Document</option>
                <option value="certificate">Certificate</option><option value="payment_gateway">Payment Gateway</option>
              </select>
              <Input value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} placeholder="Filter by actor email…" className="h-8 w-56 text-xs" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> :
          data?.rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400 italic">No audit entries match these filters.</div> :
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-2 px-4">Time</th>
                <th className="text-left">Actor</th>
                <th className="text-left">Entity</th>
                <th className="text-left">Action</th>
                <th className="text-left py-2 px-4">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.rows.map((a: any) => (
                <tr key={a.id} className="hover:bg-slate-50 align-top">
                  <td className="py-2 px-4 text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString("en-IN")}</td>
                  <td className="text-xs">{a.actor_email || <span className="text-slate-400 italic">system</span>}</td>
                  <td><Badge variant="outline" className="uppercase text-[10px]">{a.entity_type}</Badge><div className="text-[10px] text-slate-400 font-mono mt-1">{(a.entity_id || "").slice(0, 8)}</div></td>
                  <td className="text-xs">{a.action.replace(/_/g, " ")}</td>
                  <td className="py-2 px-4">
                    {(a.old_value || a.new_value) ? (
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-slate-500">View diff</summary>
                        <pre className="mt-1 p-2 bg-slate-50 rounded text-[10px] overflow-auto max-w-md">{JSON.stringify({ before: a.old_value, after: a.new_value }, null, 2)}</pre>
                      </details>
                    ) : <span className="text-[11px] text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
        </CardContent>
      </Card>
    </div>
  );
}
