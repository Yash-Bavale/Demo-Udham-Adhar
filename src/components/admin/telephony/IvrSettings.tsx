import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Save, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { checkCallerDeskApi, getIvrDraft, saveIvrDraft } from "@/lib/telephony/ivr.functions";
import { IvrDraftSchema, type IvrDraft } from "@/lib/telephony/ivr.config";

type Destination = IvrDraft["fallback"];
function DestinationField({ value, onChange, name }: { value: Destination; onChange: (v: Destination) => void; name: string }) {
  return <div className="flex flex-wrap gap-2">
    <Select value={value.kind} onValueChange={(kind: Destination["kind"]) => onChange({ kind, value: "" })}><SelectTrigger aria-label={`${name} type`} className="w-40"><SelectValue /></SelectTrigger><SelectContent>{["member", "queue", "department", "number", "terminate"].map((k) => <SelectItem key={k} value={k}>{k === "terminate" ? "End call" : k}</SelectItem>)}</SelectContent></Select>
    {value.kind !== "terminate" && <Input aria-label={`${name} destination`} className="min-w-40 flex-1" placeholder="CallerDesk destination ID / number" value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} />}
  </div>;
}

export function IvrSettings() {
  const load = useServerFn(getIvrDraft);
  const query = useQuery({ queryKey: ["callerdesk-ivr"], queryFn: () => load(), retry: false });
  if (query.error) return <p role="alert" className="text-destructive">{query.error.message}</p>;
  if (!query.data) return <p className="text-muted-foreground">Loading IVR settings…</p>;
  return <IvrEditor key={`${query.data.revision}`} initial={query.data.config} revision={query.data.revision} onSaved={() => query.refetch()} />;
}

function IvrEditor({ initial, revision, onSaved }: { initial: IvrDraft; revision: number; onSaved: () => unknown }) {
  const [config, setConfig] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const save = useServerFn(saveIvrDraft);
  const check = useServerFn(checkCallerDeskApi);
  const update = <K extends keyof IvrDraft>(k: K, value: IvrDraft[K]) => setConfig((c) => ({ ...c, [k]: value }));
  async function submit() {
    const parsed = IvrDraftSchema.safeParse(config);
    if (!parsed.success) { setMessage(parsed.error.issues.map((i) => i.message).join(" ")); return; }
    setBusy(true); setMessage(null);
    try { await save({ data: { config: parsed.data, revision } }); setMessage("Saved in CRM only. Not applied to CallerDesk."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Save failed."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6 border-t pt-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">CallerDesk IVR</h2><p className="text-sm text-muted-foreground">CRM draft · Not applied to CallerDesk</p></div><div className="flex gap-2"><Button variant="outline" disabled={checking} onClick={async () => { setChecking(true); try { const r = await check(); setApiMessage(r.message); } catch (e) { setApiMessage(e instanceof Error ? e.message : "Check failed."); } finally { setChecking(false); } }}><RefreshCw className="h-4 w-4" />{checking ? "Checking…" : "Check API"}</Button><Button disabled={busy} onClick={submit}><Save className="h-4 w-4" />{busy ? "Saving…" : "Save CRM draft"}</Button></div></div>
    <p className="text-sm text-muted-foreground">Provider synchronization unavailable: a verified IVR configuration API is required. Saving does not change the live number or routing.</p>
    {apiMessage && <p role="status" className="text-sm">{apiMessage}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2"><label className="space-y-1 text-sm">Requested IVR state<Select value={config.enabled ? "on" : "off"} onValueChange={(v) => update("enabled", v === "on")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Disabled draft</SelectItem><SelectItem value="on">Enabled draft (not live)</SelectItem></SelectContent></Select></label><label className="space-y-1 text-sm">Business number / DID<Input value={config.businessNumber} onChange={(e) => update("businessNumber", e.target.value)} /></label></div>
    <section className="space-y-3"><h3 className="font-semibold">Greeting & prompts</h3><div className="grid gap-3 md:grid-cols-2">{([['greetingAudio','Welcome audio'],['menuAudio','Menu prompt audio'],['afterHoursAudio','After-hours audio'],['invalidInputAudio','Invalid input audio'],['noInputAudio','No-input audio'],['unavailableAudio','Unavailable / no-answer audio']] as const).map(([k, label]) => <label className="space-y-1 text-sm" key={k}>{label}<Input placeholder="HTTPS audio URL" value={config[k]} onChange={(e) => update(k, e.target.value)} /></label>)}</div></section>
    <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">DTMF menu choices</h3><Button size="sm" variant="outline" disabled={config.menu.length >= 12} onClick={() => update("menu", [...config.menu, { key: "", label: "", destination: { kind: "terminate", value: "" } }])}><Plus className="h-4 w-4" />Add choice</Button></div>{config.menu.map((m, i) => <div key={i} className="grid items-end gap-2 border-b pb-3 md:grid-cols-[64px_1fr_2fr_36px]"><label className="text-xs">Key<Input maxLength={1} aria-label={`Menu key ${i + 1}`} value={m.key} onChange={(e) => update("menu", config.menu.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} /></label><label className="text-xs">Department / label<Input value={m.label} onChange={(e) => update("menu", config.menu.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></label><DestinationField name={`Choice ${i + 1}`} value={m.destination} onChange={(destination) => update("menu", config.menu.map((x, j) => j === i ? { ...x, destination } : x))} /><Button size="icon" variant="ghost" aria-label={`Remove choice ${i + 1}`} onClick={() => update("menu", config.menu.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>)}</section>
    <section className="space-y-3"><h3 className="font-semibold">Business hours · India time</h3>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => { const hours = config.businessHours.find((h) => h.day === index); return <div className="flex flex-wrap items-center gap-3" key={day}><span className="w-24 text-sm">{day}</span><Select value={hours ? "open" : "closed"} onValueChange={(v) => update("businessHours", v === "closed" ? config.businessHours.filter((h) => h.day !== index) : [...config.businessHours, { day: index, open: "09:00", close: "18:00" }])}><SelectTrigger className="w-28" aria-label={`${day} availability`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="closed">Closed</SelectItem><SelectItem value="open">Open</SelectItem></SelectContent></Select>{hours && <>{(["open", "close"] as const).map((k) => <Input className="w-32" key={k} type="time" aria-label={`${day} ${k}`} value={hours[k]} onChange={(e) => update("businessHours", config.businessHours.map((h) => h.day === index ? { ...h, [k]: e.target.value } : h))} />)}</>}</div>; })}</section>
    <div className="grid gap-3 md:grid-cols-3">{([['retries','Invalid / no-input retries'],['timeoutSeconds','Input timeout (seconds)'],['noAnswerSeconds','No-answer timeout (seconds)']] as const).map(([k, label]) => <label className="space-y-1 text-sm" key={k}>{label}<Input type="number" value={config[k]} onChange={(e) => update(k, Number(e.target.value))} /></label>)}</div>
    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><h3 className="text-sm font-semibold">After-hours destination</h3><DestinationField name="After-hours" value={config.afterHours} onChange={(v) => update("afterHours", v)} /></div><div className="space-y-2"><h3 className="text-sm font-semibold">Invalid / no-input / unavailable fallback</h3><DestinationField name="Fallback" value={config.fallback} onChange={(v) => update("fallback", v)} /></div></div>
    <div className="flex gap-3"><Button variant="outline" onClick={() => onSaved()}><RefreshCw className="h-4 w-4" />Reload saved settings</Button><a className="self-center text-sm underline" href="https://docs.callerdesk.io/setup-ivr-journey/" target="_blank" rel="noreferrer">CallerDesk IVR setup guide</a></div>
  </div>;
}