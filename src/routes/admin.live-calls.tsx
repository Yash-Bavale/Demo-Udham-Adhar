import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listLiveCalls } from "@/lib/telephony/calls.functions";
import { fmtDuration } from "@/components/admin/telephony/TelephonyPanel";
import { IvrSettings } from "@/components/admin/telephony/IvrSettings";
import { TelephonyAccounts } from "@/components/admin/telephony/TelephonyAccounts";
import { CallHistory } from "@/components/admin/telephony/CallHistory";

export const Route = createFileRoute("/admin/live-calls")({
  head: () => ({ meta: [{ title: "Live Calls & IVR — BHS CRM" }, { name: "description", content: "CallerDesk live calls and administrator IVR planning for Business Help Services." }, { property: "og:title", content: "Live Calls & IVR — BHS CRM" }, { property: "og:description", content: "CallerDesk call monitoring and securely saved IVR drafts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: LiveCallsPage,
});

const ACTIONS = ["Monitor", "Whisper", "Barge", "Transfer", "Hangup"];

function LiveCallsPage() {
  const fetchCalls = useServerFn(listLiveCalls);
  const { data, error, isLoading } = useQuery({ queryKey: ["live-calls"], queryFn: () => fetchCalls(), refetchInterval: 20_000, refetchIntervalInBackground: false });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Live Calls</h1>
        <p className="text-sm text-muted-foreground">Current CallerDesk calls. Supervisor actions will be enabled once CallerDesk call control is connected.</p>
      </div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>{["Employee", "Customer", "Order", "Direction", "Status", "Duration", "Call ID", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr> :
              !data?.length ? <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No live calls right now.</td></tr> :
              data.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">{c.employeeName ?? "Unassigned"}</td>
                  <td className="px-3 py-2">{c.customerId ? <Link className="underline" to="/admin/customers/$customerId" params={{ customerId: c.customerId }}>{c.contactName ?? "Customer"}</Link> : c.contactName ?? c.callerNumber ?? "Unknown"}</td>
                  <td className="px-3 py-2">{c.applicationId ? <Link className="underline" to="/admin/applications/$applicationId" params={{ applicationId: c.applicationId }}>{c.orderCode ?? "Order"}</Link> : "—"}</td>
                  <td className="px-3 py-2 capitalize">{c.direction}</td>
                  <td className="px-3 py-2 capitalize">{c.status}</td>
                  <td className="px-3 py-2 font-mono">{c.status === "answered" && c.answeredAt ? fmtDuration((now - new Date(c.answeredAt).getTime()) / 1000) : "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.callId}</td>
                  <td className="px-3 py-2"><div className="flex gap-1">{ACTIONS.map((a) => <Button key={a} size="sm" variant="outline" disabled title="Not connected to CallerDesk yet">{a}</Button>)}</div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <CallHistory />
      <TelephonyAccounts />
      <IvrSettings />
    </div>
  );
}
