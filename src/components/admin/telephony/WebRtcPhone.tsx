import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Delete, Grid3x3, Headset, Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneOff, Play, Volume2, X } from "lucide-react";
import { browserPhone, type DialRequest } from "@/lib/telephony/browser-phone-bus";
import { cleanDialInput, dialTarget } from "@/lib/telephony/wrapup";
import { Button } from "@/components/ui/button";
import { endWebRtcCall, getWebRtcSession, getWebRtcStatus, initiateWebRtcCall, lookupIncomingCaller, recordInboundWebRtcCall } from "@/lib/telephony/callerdesk-webrtc.functions";
import type { CallerDeskWebRtcEngine, EngineSnapshot } from "@/lib/telephony/callerdesk-webrtc.engine";
import { fmtDuration } from "./TelephonyPanel";
import { logWebRtcEvent } from "@/lib/telephony/webrtc-diag.functions";
import { WebRtcDiagnostics } from "./WebRtcDiagnostics";

type CallerLookup = Awaited<ReturnType<typeof lookupIncomingCaller>>;

function CallerCard({ loading, error, data, selected, onSelect }: { loading: boolean; error: boolean; data: CallerLookup | null; selected: string | null; onSelect: (id: string) => void }) {
  if (loading) return <p className="animate-pulse rounded-md border px-2 py-1.5 text-xs text-muted-foreground">Looking up caller…</p>;
  if (error) return <p className="rounded-md border px-2 py-1.5 text-xs text-muted-foreground">Caller lookup failed — the call is unaffected.</p>;
  if (!data) return null;
  if (data.kind === "invalid" || data.kind === "unknown") return (
    <div className="rounded-md border px-2 py-1.5 text-xs">
      <p>Unknown caller{data.number ? ` · ${data.number}` : ""}</p>
      <Link to="/admin/leads" target="_blank" className="text-primary underline">Create a lead in Leads</Link>
    </div>
  );
  const order = data.orders.find((o) => o.id === selected) ?? null;
  const active = data.orders.filter((o) => o.active), closed = data.orders.filter((o) => !o.active);
  const pill = (o: CallerLookup["orders"][number]) => (
    <button key={o.id} onClick={() => onSelect(o.id)} className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${o.id === selected ? "border-primary bg-primary text-primary-foreground" : o.active ? "" : "text-muted-foreground"}`}>{o.code ?? "Order"}</button>
  );
  return (
    <div className="space-y-1.5 rounded-md border p-2 text-xs">
      <div className="flex justify-between"><span className="font-semibold">{data.customerName ?? "Customer"}</span><span className="font-mono">{data.number}</span></div>
      {data.orders.length > 1 ? (
        <div className="space-y-1">
          {active.length ? <div className="flex flex-wrap gap-1">{active.map(pill)}</div> : null}
          {closed.length ? <div className="flex flex-wrap items-center gap-1"><span className="text-[10px] text-muted-foreground">Closed:</span>{closed.map(pill)}</div> : null}
          {!order ? <p className="text-[11px] text-muted-foreground">{data.orders.length} orders found — pick the one this call is about.</p> : null}
        </div>
      ) : null}
      {order ? (
        <div className="space-y-0.5">
          <div><span className="font-mono">{order.code}</span>{!order.active ? <span className="ml-1 text-muted-foreground">(closed)</span> : null}</div>
          <div>{order.service ?? "—"} · {order.status.replace(/_/g, " ").toLowerCase()}</div>
          <div className="text-muted-foreground">Assigned: {order.assignee ?? "Unassigned"}</div>
          <Link to="/admin/orders/$orderId" params={{ orderId: order.id }} target="_blank" className="text-primary underline">Open order</Link>
        </div>
      ) : !data.orders.length && data.lead ? (
        <div className="space-y-0.5">
          <div>Lead <span className="font-mono">{data.lead.code ?? ""}</span> · {data.lead.name}</div>
          <div>{data.lead.service ?? "—"} · {data.lead.status.replace(/_/g, " ")}</div>
          <div className="text-muted-foreground">Assigned: {data.lead.assignee ?? "Unassigned"}</div>
        </div>
      ) : null}
    </div>
  );
}

const LABEL: Record<string, string> = {
  DISCONNECTED: "Disconnected", CHECKING_CONFIGURATION: "Checking setup…", SETUP_INCOMPLETE: "Setup incomplete",
  CONNECTING: "Connecting…", REGISTERED: "Ready", RECONNECTING: "Reconnecting…", CALLING: "Calling…",
  RINGING: "Incoming call", CONNECTED: "Connected", ENDED: "Call ended", FAILED: "Not connected",
};
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/** Browser phone (CallerDesk WebRTC). Mounted once in the admin layout so it survives navigation. */
export function WebRtcPhone() {
  const fetchStatus = useServerFn(getWebRtcStatus);
  const fetchSession = useServerFn(getWebRtcSession);
  const logEvent = useServerFn(logWebRtcEvent);
  const startCall = useServerFn(initiateWebRtcCall);
  const finishCall = useServerFn(endWebRtcCall);
  const lookup = useServerFn(lookupIncomingCaller);
  const recordInbound = useServerFn(recordInboundWebRtcCall);
  const callRow = useRef<{ id: string; answeredAt: number | null } | null>(null);
  const [diag, setDiag] = useState(false);
  const { data: status } = useQuery({ queryKey: ["webrtc-status"], queryFn: () => fetchStatus(), staleTime: 300_000 });
  const engine = useRef<CallerDeskWebRtcEngine | null>(null);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState("");
  const [link, setLink] = useState<Omit<DialRequest, "number"> | null>(null);
  const [keypad, setKeypad] = useState(false);
  const [dtmf, setDtmf] = useState("");
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [output, setOutput] = useState("");
  const [now, setNow] = useState(Date.now());
  const dialing = useRef(false);

  const state = snap?.state ?? (status?.canRegister ? "DISCONNECTED" : "SETUP_INCOMPLETE");
  const ready = state === "REGISTERED" || state === "ENDED";

  useEffect(() => { if (state !== "CONNECTED" && state !== "RINGING") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [state]);
  useEffect(() => () => { browserPhone.setReady(false); browserPhone.register(null); void engine.current?.stop(); }, []);
  useEffect(() => { if (state === "RINGING" || state === "CALLING") setOpen(true); if (state !== "CONNECTED") { setKeypad(false); setDtmf(""); } }, [state]);
  useEffect(() => { browserPhone.setReady(ready); }, [ready]);
  useEffect(() => { if (snap?.notice) toast.info(snap.notice); }, [snap?.notice]);
  useEffect(() => {
    const on = () => engine.current?.onNetworkOnline();
    window.addEventListener("online", on); return () => window.removeEventListener("online", on);
  }, []);
  // Warn before a refresh/close drops a live call.
  useEffect(() => {
    if (state !== "CONNECTED" && state !== "CALLING" && state !== "RINGING") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [state]);
  // Close the pre-recorded browser call row when the SIP session ends (the provider report may enrich it later).
  useEffect(() => {
    const c = callRow.current; if (!c) return;
    if (snap?.state === "CONNECTED" && snap.connectedAt) c.answeredAt = snap.connectedAt;
    if (snap?.state === "ENDED" || snap?.state === "FAILED" || snap?.state === "DISCONNECTED" || snap?.state === "REGISTERED") {
      callRow.current = null;
      void finishCall({ data: { callRowId: c.id, answeredAt: c.answeredAt } }).catch(() => {});
    }
  }, [snap?.state, snap?.connectedAt]);

  // Incoming caller identification + inbound call record. Runs in the background: never delays ringing or Answer/Reject.
  const inboundKey = useRef<string | null>(null);
  const [caller, setCaller] = useState<{ loading: boolean; error: boolean; data: CallerLookup | null }>({ loading: false, error: false, data: null });
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  useEffect(() => {
    if (snap?.state !== "RINGING" || snap.direction !== "inbound" || inboundKey.current) return;
    const key = crypto.randomUUID(); inboundKey.current = key;
    const number = snap.remoteNumber ?? "";
    setSelectedOrder(null); setCaller({ loading: true, error: false, data: null });
    lookup({ data: { number } })
      .then((d) => { if (inboundKey.current !== key) return; setCaller({ loading: false, error: false, data: d }); if (d.orders.length === 1) setSelectedOrder(d.orders[0].id); })
      .catch(() => { if (inboundKey.current === key) setCaller({ loading: false, error: true, data: null }); });
    recordInbound({ data: { key, number, applicationId: null } })
      .then((r) => { if (inboundKey.current === key && !callRow.current) callRow.current = { id: r.callRowId, answeredAt: null }; })
      .catch(() => { /* the call still works; the provider report creates the record */ });
  }, [snap?.state, snap?.direction, snap?.remoteNumber]);
  useEffect(() => {
    if (snap?.state === "ENDED" || snap?.state === "FAILED" || snap?.state === "DISCONNECTED" || snap?.state === "REGISTERED") inboundKey.current = null;
  }, [snap?.state]);
  function selectOrder(id: string) {
    setSelectedOrder(id);
    const key = inboundKey.current;
    if (key) void recordInbound({ data: { key, number: snap?.remoteNumber ?? "", applicationId: id } }).catch(() => {});
  }

  async function dial(raw = num, ctx = link) {
    if (dialing.current) return; // duplicate-click guard
    const target = dialTarget(raw);
    if (!target) { toast.error("Enter a valid phone number (10-digit mobile, STD landline or +country number)."); return; }
    dialing.current = true;
    try {
      try { const r = await startCall({ data: { number: target, customerId: ctx?.customerId ?? null, leadId: ctx?.leadId ?? null, applicationId: ctx?.applicationId ?? null } }); callRow.current = { id: r.callRowId, answeredAt: null }; }
      catch (e: any) { if (/not available/i.test(String(e?.message))) { toast.error(e.message); return; } /* recording failed; the provider report will create the record */ }
      await engine.current?.dial(target);
    } finally { dialing.current = false; }
  }

  // Click-to-call from CRM records routes through this single phone.
  useEffect(() => {
    browserPhone.register((r) => {
      setOpen(true); setNum(cleanDialInput(r.number)); setLink({ customerId: r.customerId, leadId: r.leadId, applicationId: r.applicationId });
      void dial(r.number, { customerId: r.customerId, leadId: r.leadId, applicationId: r.applicationId });
    });
    return () => browserPhone.register(null);
  });

  // Let the incoming-call popup pick up / reject / end the call through this same phone.
  const stateRef = useRef(state); stateRef.current = state;
  useEffect(() => {
    browserPhone.setControls({
      answer: () => { void engine.current?.answer(); },
      reject: () => { void engine.current?.reject(); },
      hangup: () => { void engine.current?.hangup(); },
      state: () => stateRef.current,
    });
    return () => browserPhone.setControls(null);
  }, []);

  async function loadOutputs() {
    try { const all = await navigator.mediaDevices.enumerateDevices(); setOutputs(all.filter((d) => d.kind === "audiooutput")); } catch { setOutputs([]); }
  }
  useEffect(() => { if (state === "CONNECTED") void loadOutputs(); }, [state]);

  if (!status?.authorized) return null;

  async function connect() {
    if (!engine.current) {
      const { CallerDeskWebRtcEngine } = await import("@/lib/telephony/callerdesk-webrtc.engine");
      engine.current = new CallerDeskWebRtcEngine();
      engine.current.subscribe(setSnap);
      engine.current.onLog = (e) => { void logEvent({ data: e }).catch(() => {}); };
    }
    await engine.current.start(() => fetchSession());
  }

  const dot = state === "REGISTERED" || state === "CONNECTED" ? "bg-primary" : state === "FAILED" ? "bg-destructive" : "bg-muted-foreground";
  const canPickOutput = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype && outputs.length > 1;
  const inCall = state === "CALLING" || state === "CONNECTED";
  const talk = snap?.connectedAt ? fmtDuration((now - snap.connectedAt) / 1000) : "00:00";
  const ringFor = snap?.ringingSince ? fmtDuration((now - snap.ringingSince) / 1000) : "00:00";

  return (
    <>
      {state === "RINGING" ? (
        <div role="alertdialog" aria-label="Incoming call" className="fixed inset-x-0 top-4 z-[60] mx-auto w-[min(420px,calc(100vw-2rem))] space-y-3 rounded-2xl border-2 border-primary bg-card p-5 text-card-foreground shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold"><PhoneIncoming className="h-5 w-5 text-primary" />Incoming call</div>
            <span className="font-mono text-xs text-muted-foreground">Ringing {ringFor}</span>
          </div>
          <p className="font-mono text-2xl">{snap?.remoteNumber ?? "Unknown number"}</p>
          <CallerCard loading={caller.loading} error={caller.error} data={caller.data} selected={selectedOrder} onSelect={selectOrder} />
          {snap?.error ? <p className="text-xs text-destructive">{snap.error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button autoFocus onClick={() => engine.current?.answer()}><Phone className="h-4 w-4" />Accept</Button>
            <Button variant="destructive" onClick={() => engine.current?.reject()}><PhoneOff className="h-4 w-4" />Reject</Button>
          </div>
          <button className="flex items-center gap-1 text-xs text-muted-foreground underline" onClick={() => engine.current?.setRingMuted(!snap?.ringMuted)}>
            {snap?.ringMuted ? <><Bell className="h-3.5 w-3.5" />Turn ringtone on</> : <><BellOff className="h-3.5 w-3.5" />Silence ringtone</>}
          </button>
        </div>
      ) : null}

      <div className="fixed bottom-14 right-4 z-40">
        {!open ? (
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs shadow">
            <Headset className="h-3.5 w-3.5" /><span className={`h-2 w-2 rounded-full ${dot}`} />Browser phone: {snap?.held ? "On hold" : LABEL[state]}{state === "CONNECTED" ? ` · ${talk}` : ""}
          </button>
        ) : (
          <div className="w-[320px] max-h-[85vh] overflow-auto space-y-3 rounded-xl border bg-card p-4 text-card-foreground shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><Headset className="h-4 w-4" />Browser phone</div>
              <button aria-label="Hide phone" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center gap-2 text-xs" aria-live="polite"><span className={`h-2 w-2 rounded-full ${dot}`} />{snap?.held ? "On hold" : LABEL[state]}{snap?.muted ? " · muted" : ""}</div>

            {!status.canRegister && !snap ? (
              <p className="text-xs text-muted-foreground">
                {status.message}
                {status.missing.length ? ` Missing: ${status.missing.join(", ")}.` : ""}{!status.enabled ? " Browser calling is switched off." : ""}
              </p>
            ) : null}
            {snap?.error ? <p className="text-xs text-destructive">{snap.error}</p> : null}

            {status.canRegister && (state === "DISCONNECTED" || state === "FAILED" || state === "RECONNECTING") ? (
              <Button size="sm" className="w-full" onClick={connect}>{state === "RECONNECTING" ? "Reconnect now" : "Connect"} (FortiClient VPN must be on)</Button>
            ) : null}
            {snap?.error?.startsWith("Browser blocked call audio") ? <Button size="sm" variant="outline" className="w-full" onClick={() => engine.current?.resumeAudio()}>Enable call audio</Button> : null}

            {snap?.direction === "inbound" && state === "CONNECTED" ? (
              <CallerCard loading={caller.loading} error={caller.error} data={caller.data} selected={selectedOrder} onSelect={selectOrder} />
            ) : null}

            {inCall ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="font-mono">{snap?.remoteNumber}</span><span className="font-mono">{state === "CONNECTED" ? talk : "Ringing…"}</span></div>
                {state === "CONNECTED" ? (
                  <div className="grid grid-cols-3 gap-1">
                    <Button size="sm" variant={snap?.muted ? "default" : "outline"} aria-pressed={!!snap?.muted} onClick={() => engine.current?.setMuted(!snap?.muted)}>
                      {snap?.muted ? <><MicOff className="h-4 w-4" />Unmute</> : <><Mic className="h-4 w-4" />Mute</>}
                    </Button>
                    <Button size="sm" variant={snap?.held ? "default" : "outline"} aria-pressed={!!snap?.held} onClick={() => engine.current?.setHeld(!snap?.held)}>
                      {snap?.held ? <><Play className="h-4 w-4" />Resume</> : <><Pause className="h-4 w-4" />Hold</>}
                    </Button>
                    <Button size="sm" variant={keypad ? "default" : "outline"} aria-pressed={keypad} onClick={() => setKeypad((k) => !k)}><Grid3x3 className="h-4 w-4" />Keypad</Button>
                  </div>
                ) : null}
                {state === "CONNECTED" && keypad ? (
                  <div className="space-y-1">
                    <p className="min-h-5 text-center font-mono text-sm">{dtmf}</p>
                    <div className="grid grid-cols-3 gap-1">{KEYS.map((k) => <Button key={k} size="sm" variant="outline" onClick={() => { engine.current?.sendDtmf(k); setDtmf((d) => (d + k).slice(-20)); }}>{k}</Button>)}</div>
                  </div>
                ) : null}
                {state === "CONNECTED" && canPickOutput ? (
                  <label className="flex items-center gap-2 text-xs"><Volume2 className="h-3.5 w-3.5" />
                    <select className="h-8 flex-1 rounded-md border bg-background px-1 text-xs" value={output} onChange={(e) => { setOutput(e.target.value); void engine.current?.setOutputDevice(e.target.value); }}>
                      {outputs.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>)}
                    </select></label>
                ) : null}
                <Button size="sm" variant="destructive" className="w-full" onClick={() => engine.current?.hangup()}><PhoneOff className="h-4 w-4" />{state === "CALLING" ? "Cancel call" : "End call"}</Button>
              </div>
            ) : null}

            {ready ? (
              <div className="space-y-2">
                <div className="flex gap-1">
                  <input aria-label="Number to call" className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm" inputMode="tel" placeholder="Number to call" value={num}
                    onChange={(e) => { setNum(cleanDialInput(e.target.value)); setLink(null); }}
                    onPaste={(e) => { e.preventDefault(); setNum(cleanDialInput(e.clipboardData.getData("text"))); setLink(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") void dial(); }} />
                  <Button size="sm" variant="ghost" aria-label="Delete last digit" onClick={() => setNum((n) => n.slice(0, -1))}><Delete className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-3 gap-1">{KEYS.map((k) => <Button key={k} size="sm" variant="outline" onClick={() => setNum((n) => cleanDialInput(n + k))}>{k}</Button>)}</div>
                <Button size="sm" className="w-full" disabled={!num} onClick={() => void dial()}><Phone className="h-4 w-4" />Call</Button>
                <div className="flex justify-between text-[11px]">
                  <Link to="/admin/live-calls" className="underline">Recent calls</Link>
                  <button className="text-muted-foreground underline" onClick={() => engine.current?.stop()}>Disconnect</button>
                </div>
              </div>
            ) : null}
            <button className="w-full text-[11px] underline" onClick={() => setDiag((d) => !d)}>{diag ? "Hide diagnostics" : "Diagnostics & test log"}</button>
            {diag ? <WebRtcDiagnostics currentStatus={LABEL[state]} currentError={snap?.error ?? null} /> : null}
          </div>
        )}
      </div>
    </>
  );
}
