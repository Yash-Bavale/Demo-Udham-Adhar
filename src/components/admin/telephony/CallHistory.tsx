import { Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCallHistory } from "@/lib/telephony/calls.functions";
import { fmtDuration } from "@/components/admin/telephony/TelephonyPanel";

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const istDaysAgo = (n: number) => new Date(Date.now() + 330 * 60_000 - n * 86_400_000).toISOString().slice(0, 10);
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const STATUS_LABEL: Record<string, string> = { ended: "Answered", answered: "In progress", missed: "Missed", no_response: "No answer", ringing: "Ringing" };

export function CallHistory() {
  const fetchHistory = useServerFn(listCallHistory);
  const [from, setFrom] = useState(istDaysAgo(6));
  const [to, setTo] = useState(istToday());
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [status, setStatus] = useState<"all" | "answered" | "ended" | "missed" | "no_response" | "ringing">("all");
  const [page, setPage] = useState(0);
  const [number, setNumber] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [disposition, setDisposition] = useState<string>("");
  const input = { from, to, direction, status, page, number: number.replace(/\D/g, "").length >= 4 ? number : undefined, employeeId: employeeId || null, disposition: disposition || undefined };
  const { data, error, isFetching } = useQuery({
    queryKey: ["call-history", input], queryFn: () => fetchHistory({ data: input }),
    placeholderData: keepPreviousData, refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Recent calls</h2>
        <p className="text-sm text-muted-foreground">All calls with outcomes and notes, newest first. Dates are India time.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">From<Input type="date" value={from} max={to} onChange={(e) => reset(setFrom)(e.target.value)} className="h-9 w-40" /></label>
        <label className="text-xs">To<Input type="date" value={to} min={from} onChange={(e) => reset(setTo)(e.target.value)} className="h-9 w-40" /></label>
        <label className="text-xs flex flex-col">Direction
          <select className={sel} value={direction} onChange={(e) => reset(setDirection)(e.target.value as any)}>
            <option value="all">All</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option>
          </select></label>
        <label className="text-xs flex flex-col">Status
          <select className={sel} value={status} onChange={(e) => reset(setStatus)(e.target.value as any)}>
            <option value="all">All</option><option value="ended">Answered</option><option value="missed">Missed / rejected</option>
            <option value="no_response">No answer</option><option value="answered">In progress</option><option value="ringing">Ringing</option>
          </select></label>
        <label className="text-xs">Number<Input inputMode="tel" placeholder="Last 4+ digits" value={number} onChange={(e) => reset(setNumber)(e.target.value.replace(/[^\d+]/g, ""))} className="h-9 w-36" /></label>
        <label className="text-xs flex flex-col">Employee
          <select className={sel} value={employeeId} onChange={(e) => reset(setEmployeeId)(e.target.value)}>
            <option value="">All</option>{(data?.employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></label>
        <label className="text-xs flex flex-col">Outcome
          <select className={sel} value={disposition} onChange={(e) => reset(setDisposition)(e.target.value)}>
            <option value="">All</option><option value="none">Not logged</option>{(data?.outcomes ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
        {isFetching ? <span className="text-xs text-muted-foreground pb-2">Loading…</span> : null}
      </div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>{["Date / time", "Direction", "From", "To", "Status", "Employee", "Customer", "Order", "Outcome", "Talk time", "Total", "Recording"].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {!data ? <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr> :
              !data.items.length ? <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">No calls in this period.</td></tr> :
              data.items.map((c) => {
                const total = c.endedAt ? (new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 1000 : null;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtTime(c.startedAt)}{c.provider !== "callerdesk" ? <span className="ml-1 text-xs text-muted-foreground">({c.provider})</span> : null}</td>
                    <td className="px-3 py-2 capitalize">{c.direction}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.callerNumber ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.calledNumber ?? "—"}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[c.status] ?? c.status}{c.hangupCause ? <span className="block text-xs text-muted-foreground">{c.hangupCause}</span> : null}</td>
                    <td className="px-3 py-2">{c.employeeName ?? "—"}</td>
                    <td className="px-3 py-2">{c.customerId ? <Link className="underline" to="/admin/customers/$customerId" params={{ customerId: c.customerId }}>{c.contactName ?? "Customer"}</Link> : c.contactName ?? "—"}</td>
                    <td className="px-3 py-2">{c.applicationId ? <Link className="underline" to="/admin/applications/$applicationId" params={{ applicationId: c.applicationId }}>{c.orderCode ?? "Order"}</Link> : "—"}</td>
                    <td className="px-3 py-2 max-w-[220px]">{c.disposition ?? <span className="text-muted-foreground">—</span>}
                      {c.notes ? <span className="block truncate text-xs text-muted-foreground" title={c.notes}>{c.notes}</span> : null}
                      {c.followUpAt ? <span className="block text-xs text-muted-foreground">Follow-up {fmtTime(c.followUpAt)}</span> : null}</td>
                    <td className="px-3 py-2 font-mono">{c.durationSeconds != null ? fmtDuration(c.durationSeconds) : "—"}</td>
                    <td className="px-3 py-2 font-mono">{total != null && total >= 0 ? fmtDuration(total) : "—"}</td>
                    <td className="px-3 py-2">{c.recordingUrl ? <span className="flex gap-2"><a className="underline" href={c.recordingUrl} target="_blank" rel="noopener noreferrer">Play</a><a className="underline" href={c.recordingUrl} download rel="noopener noreferrer">Download</a></span> : "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{data ? `${data.total} call${data.total === 1 ? "" : "s"}` : ""}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {page + 1} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </section>
  );
}
