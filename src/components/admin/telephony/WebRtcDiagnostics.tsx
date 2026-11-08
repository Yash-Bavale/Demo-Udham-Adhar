import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWebRtcEvents, troubleshootWebRtc } from "@/lib/telephony/webrtc-diag.functions";

/** Super-admin test log of browser-phone attempts plus AI troubleshooting. */
export function WebRtcDiagnostics({ currentStatus, currentError }: { currentStatus: string; currentError: string | null }) {
  const fetchLog = useServerFn(listWebRtcEvents);
  const ask = useServerFn(troubleshootWebRtc);
  const log = useQuery({ queryKey: ["webrtc-diag"], queryFn: () => fetchLog(), refetchInterval: 10_000 });
  const [status, setStatus] = useState(currentStatus);
  const [details, setDetails] = useState(currentError ?? "");
  const [advice, setAdvice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyse() {
    setBusy(true); setErr(null); setAdvice(null);
    try { const r = await ask({ data: { status: status || currentStatus, details } }); setAdvice(r.advice); }
    catch (e: any) { setErr(String(e?.message ?? "Could not get advice.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 border-t pt-2">
      <div className="space-y-1">
        <input className="w-full rounded-md border bg-background px-2 py-1 text-xs" placeholder="Status (e.g. Ready, Failed)" value={status} onChange={(e) => setStatus(e.target.value)} />
        <textarea className="h-16 w-full rounded-md border bg-background px-2 py-1 text-xs" placeholder="What happened? Paste the error…" value={details} onChange={(e) => setDetails(e.target.value)} />
        <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={analyse}>
          <Sparkles className="h-3.5 w-3.5" />{busy ? "Thinking…" : "Suggest next steps"}
        </Button>
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
        {advice ? <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{advice}</div> : null}
      </div>
      <div className="flex items-center justify-between text-xs font-semibold">
        Test log
        <button aria-label="Refresh log" onClick={() => log.refetch()}><RefreshCw className="h-3 w-3" /></button>
      </div>
      <ul className="max-h-40 space-y-1 overflow-auto text-[11px]">
        {(log.data ?? []).map((r: any) => (
          <li key={r.id} className="rounded bg-muted/50 px-1.5 py-1">
            <span className="text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</span> {r.activity_description}
            {r.metadata?.number ? <span className="font-mono"> · {r.metadata.number}</span> : null}
            {r.metadata?.detail ? <div className="break-words text-muted-foreground">{r.metadata.detail}</div> : null}
          </li>
        ))}
        {log.data && !log.data.length ? <li className="text-muted-foreground">No attempts logged yet.</li> : null}
        {log.error ? <li className="text-destructive">{String((log.error as Error).message)}</li> : null}
      </ul>
    </div>
  );
}
