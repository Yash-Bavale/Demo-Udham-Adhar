/**
 * Browser call engine: SIP over WSS to CallerDesk's Asterisk using SIP.js (loaded lazily, browser only).
 * Holds no CRM/DB logic. Final call status/duration/recording come from CallerDesk webhooks.
 */
import { canDial, nextState, registrationError, type PhoneEvent, type PhoneState } from "./callerdesk-webrtc.config";

export type SessionConfig = { wssUrl: string; sipDomain: string; extension: string; password: string; displayName: string };
export type EngineSnapshot = { state: PhoneState; error: string | null; remoteNumber: string | null; muted: boolean; connectedAt: number | null; direction: "inbound" | "outbound" | null; held: boolean; ringMuted: boolean; ringingSince: number | null; notice?: string | null };
type Listener = (s: EngineSnapshot) => void;
export type DiagEvent = { event: string; state?: string; sipCode?: number | null; reason?: string | null; number?: string | null; detail?: string | null };

/** User-facing message for a failed/dropped ICE (media) path. */
export function iceError(state: string): string | null {
  if (state === "failed") return "Call audio path failed (no media). Check FortiClient VPN and retry.";
  if (state === "disconnected") return "Call audio path interrupted. Check FortiClient VPN.";
  return null;
}

/** Safe SDP summary: audio direction + codec names only (no IPs, ICE creds or fingerprints). */
export function summarizeSdp(sdp: string | undefined | null): string {
  if (!sdp) return "none";
  const audio = sdp.split(/\r?\n(?=m=)/).find((b) => b.startsWith("m=audio"));
  if (!audio) return "no audio m-line";
  const dir = audio.match(/^a=(sendrecv|sendonly|recvonly|inactive)/m)?.[1] ?? "sendrecv(default)";
  const port = audio.match(/^m=audio (\d+)/)?.[1];
  const codecs = [...audio.matchAll(/^a=rtpmap:\d+ ([\w-]+)\//gm)].map((m) => m[1]).filter((c) => !/telephone-event/i.test(c)).slice(0, 4);
  return `dir=${dir} port0=${port === "0"} codecs=${codecs.join(",")}`;
}

/** Safe getStats summary: RTP audio counters and selected pair candidate types (no addresses). */
export function summarizeStats(reports: Iterable<any>): string {
  const all = [...reports]; const byId = new Map(all.map((r) => [r.id, r]));
  const inb = all.find((r) => r.type === "inbound-rtp" && (r.kind ?? r.mediaType) === "audio");
  const out = all.find((r) => r.type === "outbound-rtp" && (r.kind ?? r.mediaType) === "audio");
  const tr = all.find((r) => r.type === "transport");
  const pair = byId.get(tr?.selectedCandidatePairId) ?? all.find((r) => r.type === "candidate-pair" && (r.selected || r.nominated) && r.state === "succeeded");
  const lc = pair && byId.get(pair.localCandidateId); const rc = pair && byId.get(pair.remoteCandidateId);
  return [
    `in: pkts=${inb?.packetsReceived ?? "-"} bytes=${inb?.bytesReceived ?? "-"} lost=${inb?.packetsLost ?? "-"} jitter=${inb?.jitter ?? "-"} level=${inb?.audioLevel ?? "-"}`,
    `out: pkts=${out?.packetsSent ?? "-"} bytes=${out?.bytesSent ?? "-"}`,
    `pair: ${pair ? `${lc?.candidateType ?? "?"}/${lc?.protocol ?? "?"}->${rc?.candidateType ?? "?"} rtt=${pair.currentRoundTripTime ?? "-"}` : "none"}`,
  ].join(" | ");
}

/** Caller number from an incoming INVITE: P-Asserted-Identity, Remote-Party-ID, From user, then display name. */
export function callerFromInvite(inv: any): string | null {
  const digits = (v: unknown) => { const d = String(v ?? "").replace(/[^\d+]/g, ""); return /\d{5,}/.test(d) ? d : null; };
  const hdr = (n: string) => { try { return inv?.request?.getHeader?.(n) ?? null; } catch { return null; } };
  const fromHdr = (h: string | null) => { const m = h?.match(/sip:([^@;>]+)/i); return m ? digits(m[1]) : null; };
  return fromHdr(hdr("P-Asserted-Identity")) ?? fromHdr(hdr("Remote-Party-ID"))
    ?? digits(inv?.remoteIdentity?.uri?.user) ?? digits(inv?.remoteIdentity?.displayName) ?? null;
}

/** True when the registrar's 200 OK lists more than one distinct device (Contact) for the extension. */
export function hasDuplicateRegistration(contacts: string[]): boolean {
  const uris = new Set((contacts ?? []).flatMap((h) => String(h).split(/,(?=\s*<)/)).map((c) => c.match(/<([^>]+)>/)?.[1] ?? c.trim()).filter(Boolean));
  return uris.size > 1;
}

/**
 * TEMPORARY inbound diagnostics: sanitized one-line summary of a raw SIP frame.
 * Only method / status code / CSeq method are kept — no URIs, numbers, tags, SDP or auth headers.
 */
export function summarizeSipFrame(raw: string): { kind: "request" | "response"; method: string; code: number | null; cseq: string | null } | null {
  if (typeof raw !== "string") return null;
  const first = raw.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!first) return null;
  const cseq = raw.match(/^CSeq:\s*\d+\s+([A-Z]+)/im)?.[1] ?? null;
  const resp = first.match(/^SIP\/2\.0\s+(\d{3})/);
  if (resp) return { kind: "response", method: cseq ?? "?", code: Number(resp[1]), cseq };
  const req = first.match(/^([A-Z]+)\s+\S+\s+SIP\/2\.0$/);
  if (req) return { kind: "request", method: req[1], code: null, cseq };
  return null;
}


export class CallerDeskWebRtcEngine {
  private snap: EngineSnapshot = { state: "DISCONNECTED", error: null, remoteNumber: null, muted: false, connectedAt: null, direction: null, held: false, ringMuted: false, ringingSince: null };
  private listeners = new Set<Listener>();
  private ua: any = null;
  private registerer: any = null;
  private session: any = null;
  private inFlight = false;
  private audio: HTMLAudioElement | null = null;
  private sip: any = null;
  private domain = "";
  private starting = false;
  onLog: ((e: DiagEvent) => void) | null = null;
  private log(e: DiagEvent) { try { this.onLog?.({ state: this.snap.state, ...e }); } catch { /* ignore */ } }

  get snapshot() { return this.snap; }
  subscribe(l: Listener) { this.listeners.add(l); l(this.snap); return () => { this.listeners.delete(l); }; }

  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private emit(e: PhoneEvent, patch: Partial<EngineSnapshot> = {}) {
    const prev = this.snap.state;
    this.snap = { ...this.snap, ...patch, state: nextState(this.snap.state, e) };
    if (this.snap.state !== "RINGING") { this.stopRing(); if (this.snap.ringingSince) this.snap = { ...this.snap, ringingSince: null }; }
    if (this.snap.state !== "CONNECTED" && this.snap.held) this.snap = { ...this.snap, held: false };
    if (prev !== this.snap.state) this.log({ event: "STATE_CHANGED", detail: `${prev}->${this.snap.state}` });
    if (this.endTimer) { clearTimeout(this.endTimer); this.endTimer = null; }
    // Return to Ready after a call ends so a stale "Call ended" never blocks the next incoming call view.
    if (this.snap.state === "ENDED") this.endTimer = setTimeout(() => { this.endTimer = null; if (this.snap.state === "ENDED" && !this.session) this.emit("reset"); }, 4000);
    this.listeners.forEach((l) => l(this.snap));
  }

  async start(loadConfig: () => Promise<SessionConfig>) {
    if (this.starting || this.session || this.snap.state === "REGISTERED") return;
    this.starting = true;
    try {
    await this.stop();
    this.emit("check", { error: null });
    this.log({ event: "REGISTER_ATTEMPT" });
    let cfg: SessionConfig;
    try { cfg = await loadConfig(); } catch (err: any) {
      const msg = String(err?.message ?? "Configuration unavailable");
      return this.emit(/incomplete/i.test(msg) ? "config_missing" : "register_failed", { error: msg });
    }
    this.emit("config_ok");
    this.domain = cfg.sipDomain;
    try {
      // @ts-ignore optional browser-only module
      this.sip = await import("sip.js");
      const { UserAgent, Registerer, RegistererState } = this.sip;
      const uri = UserAgent.makeURI(`sip:${cfg.extension}@${cfg.sipDomain}`);
      if (!uri) throw new Error("Invalid SIP extension or domain.");
      this.ua = new UserAgent({
        uri, displayName: cfg.displayName, authorizationUsername: cfg.extension, authorizationPassword: cfg.password,
        // Register the Contact under the extension (SIP.js otherwise uses a random user part), and
        // deliver INVITEs to onInvite immediately; we send 180 Ringing ourselves.
        contactName: cfg.extension, sendInitialProvisionalResponse: false,
        transportOptions: { server: cfg.wssUrl, connectionTimeout: 8 }, logLevel: "error",
        delegate: {
          onInvite: (inv: any) => this.onInvite(inv),
          onDisconnect: (e?: Error) => {
            this.log({ event: "TRANSPORT_LOST", reason: e?.message ?? null });
            const wasReady = this.snap.state === "REGISTERED";
            this.emit("transport_lost", { error: "Connection to CallerDesk lost. Check that FortiClient VPN is connected." });
            if (wasReady && e) this.scheduleReconnect();
          },
          onConnect: () => { this.retries = 0; },
        },
      });
      await this.ua.start().catch(() => { throw new Error("Cannot reach CallerDesk phone server. Connect FortiClient VPN and retry."); });
      this.tapTransport();
      this.claimTab(cfg.extension);
      this.registerer = new Registerer(this.ua);
      this.registerer.stateChange.addListener((s: any) => {
        if (s === RegistererState.Registered) { this.emit("registered", { error: null }); this.log({ event: "REGISTER_SUCCESS" }); }
        else if (s === RegistererState.Unregistered && this.snap.state === "CONNECTING") this.emit("register_failed", { error: "CallerDesk rejected the agent registration." });
      });
      await this.registerer.register({ requestDelegate: {
        onAccept: (r: any) => this.enforceSingleDevice(r),
        onReject: (r: any) => { const c = r?.message?.statusCode; this.log({ event: "REGISTER_FAILED", sipCode: c, reason: r?.message?.reasonPhrase }); this.emit("register_failed", { error: registrationError(c) }); },
      } });
    } catch (err: any) {
      const m = String(err?.message ?? "Registration failed");
      await this.stop();
      this.emit("check"); this.emit("config_ok");
      this.log({ event: "REGISTER_FAILED", reason: m });
      this.emit("register_failed", { error: m });
    }
    } finally { this.starting = false; }
  }

  /**
   * Single-device rule: when CallerDesk reports more than one device signed in to this extension,
   * remove every sign-in (Contact: *) and sign this browser back in, so calls ring only here.
   * Limited to once per minute so two fighting devices cannot loop forever.
   */
  private lastPurge = 0;
  private async enforceSingleDevice(resp: any) {
    try {
      const contacts: string[] = resp?.message?.getHeaders?.("contact") ?? [];
      if (!hasDuplicateRegistration(contacts)) return;
      if (Date.now() - this.lastPurge < 60_000) { this.log({ event: "DUPLICATE_REGISTRATION", detail: `${contacts.length} devices, purge skipped (cooldown)` }); return; }
      this.lastPurge = Date.now();
      this.log({ event: "DUPLICATE_REGISTRATION", detail: `${contacts.length} devices on extension, removing others` });
      await new Promise<void>((resolve) => {
        this.registerer?.unregister({ all: true, requestDelegate: { onAccept: () => resolve(), onReject: () => resolve() } }).catch(() => resolve());
        setTimeout(resolve, 5000);
      });
      await this.registerer?.register({ requestDelegate: {
        onAccept: (r: any) => { const n = (r?.message?.getHeaders?.("contact") ?? []).length; this.log({ event: "DUPLICATE_CLEARED", detail: `${n} device(s) now signed in` }); },
      } });
      this.snap = { ...this.snap, error: null, notice: "Another device was signed in to your phone line and has been disconnected." } as EngineSnapshot;
      this.listeners.forEach((l) => l(this.snap));
    } catch (e: any) { this.log({ event: "DUPLICATE_PURGE_FAILED", reason: String(e?.message ?? e).slice(0, 200) }); }
  }

  /** Only one CRM tab per extension: a newly connecting tab tells older tabs to sign out. */
  private tabChannel: BroadcastChannel | null = null;
  private tabId = Math.random().toString(36).slice(2);
  private claimTab(extension: string) {
    try {
      if (typeof BroadcastChannel === "undefined") return;
      this.tabChannel?.close();
      const ch = new BroadcastChannel(`bhs-phone-${extension}`);
      ch.onmessage = (ev) => {
        if (ev.data?.type !== "takeover" || ev.data.tab === this.tabId) return;
        if (this.session) return; // never drop a live call
        this.log({ event: "TAB_TAKEOVER", detail: "phone moved to another CRM tab" });
        void this.stop().then(() => this.emit("register_failed", { error: "Your phone is now active in another CRM tab." }));
      };
      ch.postMessage({ type: "takeover", tab: this.tabId });
      this.tabChannel = ch;
    } catch { /* optional */ }
  }

  /** TEMPORARY inbound diagnostics: logs SIP frames as method + status only (OPTIONS keep-alives sampled). */
  private optionsSeen = 0;
  private tapTransport() {
    const t: any = this.ua?.transport;
    if (!t || t.__bhsTapped) return;
    t.__bhsTapped = true;
    const describe = (f: NonNullable<ReturnType<typeof summarizeSipFrame>>) => f.kind === "request" ? `request ${f.method}` : `response ${f.code} to ${f.method}`;
    const origOnMessage = t.onMessage;
    t.onMessage = (raw: string) => {
      try {
        const f = summarizeSipFrame(raw);
        if (f) {
          if (f.method === "OPTIONS" && f.kind === "request") { this.optionsSeen++; if (this.optionsSeen % 20 === 1) this.log({ event: "SIP_IN", detail: `OPTIONS keep-alive (seen ${this.optionsSeen})` }); }
          else this.log({ event: "SIP_IN", sipCode: f.code, detail: describe(f) });
        }
      } catch { /* diagnostics must never break signalling */ }
      return origOnMessage?.call(t, raw);
    };
    const origSend = t.send.bind(t);
    t.send = (raw: string) => {
      try { const f = summarizeSipFrame(raw); if (f && f.method !== "OPTIONS") this.log({ event: "SIP_OUT", sipCode: f.code, detail: describe(f) }); } catch { /* ignore */ }
      return origSend(raw);
    };
    this.log({ event: "SIP_TAP_ACTIVE" });
  }

  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Controlled reconnect: at most 3 attempts (5s, 15s, 45s), then the employee must press Connect. */
  private scheduleReconnect() {
    if (this.retryTimer || this.retries >= 3 || !this.ua) return;
    const delay = 5000 * 3 ** this.retries; this.retries++;
    this.log({ event: "RECONNECT_SCHEDULED", detail: `attempt ${this.retries} in ${delay / 1000}s` });
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (!this.ua || this.snap.state !== "RECONNECTING") return;
      try { await this.ua.reconnect(); await this.registerer?.register(); }
      catch { if (this.retries < 3) this.scheduleReconnect(); else this.emit("register_failed", { error: "Could not reconnect to CallerDesk. Check FortiClient VPN, then press Connect." }); }
    }, delay);
  }
  /** Re-registers after the browser regains network, only if we were waiting to reconnect. */
  onNetworkOnline() { if (this.snap.state === "RECONNECTING") { this.retries = 0; if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; } this.scheduleReconnect(); } }

  // Ringtone generated with Web Audio (no audio file). Stops whenever the phone leaves RINGING.
  private ringCtx: AudioContext | null = null;
  private ringTimer: ReturnType<typeof setInterval> | null = null;
  private startRing() {
    if (this.ringTimer || this.snap.ringMuted) return;
    try {
      const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext; if (!Ctx) return;
      this.ringCtx ??= new Ctx();
      const ctx = this.ringCtx!; void ctx.resume?.();
      const burst = () => {
        const t = ctx.currentTime;
        for (const off of [0, 0.4]) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = 440; const o2 = ctx.createOscillator(); o2.frequency.value = 480;
          g.gain.setValueAtTime(0.0001, t + off); g.gain.exponentialRampToValueAtTime(0.15, t + off + 0.02); g.gain.setValueAtTime(0.15, t + off + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.38);
          o.connect(g); o2.connect(g); g.connect(ctx.destination);
          o.start(t + off); o2.start(t + off); o.stop(t + off + 0.4); o2.stop(t + off + 0.4);
        }
      };
      burst(); this.ringTimer = setInterval(burst, 3000);
    } catch { /* ringtone is optional */ }
  }
  private stopRing() { if (this.ringTimer) { clearInterval(this.ringTimer); this.ringTimer = null; } }
  setRingMuted(m: boolean) { this.snap = { ...this.snap, ringMuted: m }; if (m) this.stopRing(); else if (this.snap.state === "RINGING") this.startRing(); this.listeners.forEach((l) => l(this.snap)); }

  /** Hold/resume via SIP re-INVITE (sendonly). Works only if CallerDesk's Asterisk accepts re-INVITE; failure is reported, never faked. */
  async setHeld(held: boolean) {
    const s = this.session; if (!s || this.snap.state !== "CONNECTED" || held === this.snap.held) return;
    try {
      s.sessionDescriptionHandlerOptionsReInvite = { hold: held };
      await new Promise<void>((resolve, reject) => {
        s.invite({ requestDelegate: { onAccept: () => resolve(), onReject: (r: any) => reject(new Error(String(r?.message?.statusCode ?? "rejected"))) } }).catch(reject);
      });
      this.log({ event: held ? "CALL_HOLD" : "CALL_RESUME" });
      this.snap = { ...this.snap, held, error: null };
    } catch (e: any) {
      this.log({ event: "HOLD_FAILED", reason: String(e?.message ?? e) });
      this.snap = { ...this.snap, error: held ? "CallerDesk did not accept hold for this call." : "Could not resume the call." };
    }
    this.listeners.forEach((l) => l(this.snap));
  }

  /** Speaker/headset output. Supported only where the browser implements setSinkId (Chrome/Edge). */
  static outputSelectionSupported() { return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype; }
  private sinkId = "";
  async setOutputDevice(id: string) {
    this.sinkId = id;
    this.audio ??= new Audio();
    try { await (this.audio as any).setSinkId?.(id); this.log({ event: "OUTPUT_DEVICE_SET" }); }
    catch { this.snap = { ...this.snap, error: "Could not switch to that speaker." }; this.listeners.forEach((l) => l(this.snap)); }
  }

  private async mic(): Promise<boolean> {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); return true; }
    catch (e: any) {
      this.snap = { ...this.snap, error: e?.name === "NotAllowedError" ? "Microphone permission denied. Allow microphone access in the browser." : "No microphone or headset found." };
      this.listeners.forEach((l) => l(this.snap));
      return false;
    }
  }

  private wire(session: any) {
    const { SessionState } = this.sip;
    this.session = session;
    // Hook the peer connection as soon as SIP.js creates it, so early remote tracks are caught.
    session.delegate = { ...(session.delegate ?? {}), onSessionDescriptionHandler: () => this.watchPeer(session) };
    session.stateChange.addListener((s: any) => {
      if (s === SessionState.Established) { this.log({ event: "CALL_CONNECTED", number: this.snap.remoteNumber }); this.attachAudio(session); this.emit("accepted", { connectedAt: Date.now() }); this.startMediaProbe(session); }
      if (s === SessionState.Establishing) this.watchPeer(session);
      if (s === SessionState.Terminated) {
        void this.stopMediaProbe(session);
        this.releaseMedia(session);
        this.session = null; this.inFlight = false;
        const wasConnected = this.snap.state === "CONNECTED";
        this.log({ event: wasConnected ? "CALL_ENDED" : "CALL_NOT_CONNECTED", number: this.snap.remoteNumber, detail: wasConnected && this.snap.connectedAt ? `talk ${Math.round((Date.now() - this.snap.connectedAt) / 1000)}s` : null });
        this.emit(this.snap.state === "CONNECTED" ? "hangup" : "rejected", { muted: false });
      }
    });
  }

  /** Stops microphone and remote tracks so no device stays in use after a call. */
  private releaseMedia(session: any) {
    const pc: RTCPeerConnection | undefined = session?.sessionDescriptionHandler?.peerConnection;
    try {
      pc?.getSenders().forEach((s) => s.track?.stop());
      pc?.getReceivers().forEach((r) => r.track?.stop());
    } catch { /* already closed */ }
    this.remote?.getTracks().forEach((t) => t.stop());
    this.remote = null;
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
  }

  private probe: ReturnType<typeof setInterval> | null = null;

  /** Logs SDP direction, PC states, track and audio element state, then RTP stats every 4s (first 20s). */
  private startMediaProbe(session: any) {
    const pc: RTCPeerConnection | undefined = session?.sessionDescriptionHandler?.peerConnection;
    if (!pc) return;
    this.log({ event: "MEDIA_SDP", detail: `local ${summarizeSdp(pc.localDescription?.sdp)} ; remote ${summarizeSdp(pc.remoteDescription?.sdp)}`.slice(0, 1000) });
    let n = 0;
    const tick = async () => {
      n++;
      const recv = pc.getReceivers().filter((r) => r.track?.kind === "audio").map((r) => `${r.track.readyState}/muted=${r.track.muted}/enabled=${r.track.enabled}`).join(",") || "none";
      const a = this.audio;
      const el = a ? `src=${!!a.srcObject} tracks=${(a.srcObject as MediaStream | null)?.getAudioTracks().length ?? 0} paused=${a.paused} muted=${a.muted} vol=${a.volume}` : "no element";
      let st = "stats n/a"; try { st = summarizeStats((await pc.getStats()).values()); } catch { /* closed */ }
      this.log({ event: "MEDIA_PROBE", detail: `#${n} conn=${pc.connectionState} ice=${pc.iceConnectionState} track=${recv} audio[${el}] ${st}`.slice(0, 1000) });
      if (n >= 5 && this.probe) { clearInterval(this.probe); this.probe = null; }
    };
    if (this.probe) clearInterval(this.probe);
    void tick(); this.probe = setInterval(() => void tick(), 4000);
  }

  private async stopMediaProbe(session: any) {
    if (this.probe) { clearInterval(this.probe); this.probe = null; }
    const pc: RTCPeerConnection | undefined = session?.sessionDescriptionHandler?.peerConnection;
    if (!pc || this.snap.state !== "CONNECTED") return;
    try { this.log({ event: "MEDIA_FINAL", detail: summarizeStats((await pc.getStats()).values()).slice(0, 1000) }); } catch { /* closed */ }
  }

  private remote: MediaStream | null = null;
  private watched = new WeakSet<object>();

  /** Hooks ontrack + ICE state on the call's peer connection (idempotent). */
  private watchPeer(session: any) {
    const pc: RTCPeerConnection | undefined = session?.sessionDescriptionHandler?.peerConnection;
    if (!pc || this.watched.has(pc)) return;
    this.watched.add(pc);
    pc.addEventListener("track", (ev: RTCTrackEvent) => {
      this.log({ event: "REMOTE_TRACK", detail: `kind=${ev.track.kind} state=${ev.track.readyState} muted=${ev.track.muted} streams=${ev.streams?.length ?? 0}` });
      if (ev.track.kind === "audio") this.addRemoteTrack(ev.track);
    });
    pc.addEventListener("connectionstatechange", () => this.log({ event: "PC_STATE", detail: pc.connectionState }));
    pc.addEventListener("iceconnectionstatechange", () => {
      const st = pc.iceConnectionState;
      this.log({ event: "ICE_STATE", detail: st, number: this.snap.remoteNumber });
      if (st === "failed" || st === "disconnected") {
        this.snap = { ...this.snap, error: iceError(st) };
        this.listeners.forEach((l) => l(this.snap));
      } else if ((st === "connected" || st === "completed") && this.snap.error && /audio path/i.test(this.snap.error)) {
        this.snap = { ...this.snap, error: null };
        this.listeners.forEach((l) => l(this.snap));
      }
    });
  }

  private addRemoteTrack(track: MediaStreamTrack) {
    this.remote ??= new MediaStream();
    if (!this.remote.getTracks().some((t) => t.id === track.id)) this.remote.addTrack(track);
    if (!this.audio) { this.audio = new Audio(); if (this.sinkId) void (this.audio as any).setSinkId?.(this.sinkId).catch(() => {}); }
    if (this.audio.srcObject !== this.remote) this.audio.srcObject = this.remote;
    void this.playAudio();
  }

  private async playAudio() {
    if (!this.audio) return;
    try {
      await this.audio.play(); this.log({ event: "AUDIO_PLAYING", detail: `muted=${this.audio.muted} vol=${this.audio.volume}` });
      if (this.snap.error?.startsWith("Browser blocked call audio")) { this.snap = { ...this.snap, error: null }; this.listeners.forEach((l) => l(this.snap)); }
    }
    catch (e: any) {
      if (e?.name === "AbortError") return; // superseded by a newer play()
      this.log({ event: "AUDIO_PLAYBACK_FAILED", reason: e?.name ?? "unknown" });
      this.snap = { ...this.snap, error: "Browser blocked call audio. Press Enable call audio, then check your headset/speaker." };
      this.listeners.forEach((l) => l(this.snap));
    }
  }

  /** Must be called from a user click to recover blocked browser playback. */
  async resumeAudio() { await this.playAudio(); }

  private attachAudio(session: any) {
    this.watchPeer(session);
    const pc: RTCPeerConnection | undefined = session.sessionDescriptionHandler?.peerConnection;
    if (!pc) { this.log({ event: "MEDIA_MISSING", reason: "no peer connection" }); return; }
    pc.getReceivers().forEach((r) => r.track?.kind === "audio" && this.addRemoteTrack(r.track));
    if (!this.remote?.getAudioTracks().length) this.log({ event: "MEDIA_PENDING", reason: "no remote audio track yet" });
  }

  private onInvite(inv: any) {
    this.log({ event: "INBOUND_INVITE_RECEIVED" });
    if (this.session) {
      if (this.session === inv) return; // duplicate delivery of the same INVITE
      this.log({ event: "INBOUND_BUSY", sipCode: 486 }); void inv.reject({ statusCode: 486 }).catch(() => {}); return;
    }
    const from = callerFromInvite(inv);
    this.log({ event: "INBOUND_CALLER", detail: from ? "number extracted" : "no number" });
    this.wire(inv);
    inv.delegate = { ...(inv.delegate ?? {}), onCancel: () => this.log({ event: "INBOUND_CANCELLED" }) };
    this.emit("incoming", { remoteNumber: from, direction: "inbound", error: null, connectedAt: null, ringingSince: Date.now() });
    if (this.snap.state !== "RINGING") { this.log({ event: "INBOUND_STATE_MISMATCH", detail: this.snap.state }); return; }
    this.startRing();
    this.log({ event: "INBOUND_RINGING" });
    Promise.resolve().then(() => inv.progress?.()).then(() => this.log({ event: "INBOUND_PROGRESS_SENT" }))
      .catch((e: any) => this.log({ event: "INBOUND_PROGRESS_FAILED", reason: String(e?.message ?? e) }));
  }

  async dial(number: string) {
    const digits = number.replace(/\D/g, "");
    if (!/^\d{10,13}$/.test(digits)) { this.snap = { ...this.snap, error: "Enter a valid phone number." }; this.listeners.forEach((l) => l(this.snap)); return; }
    if (!canDial(this.snap.state, this.inFlight) || !this.ua) return;
    this.inFlight = true;
    if (!(await this.mic())) { this.inFlight = false; this.log({ event: "CALL_FAILED", reason: this.snap.error, number: digits }); return; }
    const { Inviter, UserAgent } = this.sip;
    const target = UserAgent.makeURI(`sip:${digits}@${this.domain}`);
    const inviter = new Inviter(this.ua, target, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
    this.wire(inviter);
    this.emit("dial", { remoteNumber: digits, direction: "outbound", error: null, connectedAt: null });
    this.log({ event: "CALL_DIALED", number: digits, detail: `sip:${digits}@${this.domain}` });
    await inviter.invite({
      requestDelegate: {
        onReject: (r: any) => {
          const c = r?.message?.statusCode; const why = r?.message?.reasonPhrase ?? "";
          this.log({ event: "CALL_REJECTED", sipCode: c, reason: why, number: digits });
          this.snap = { ...this.snap, error: `CallerDesk ended the call: ${c ?? "?"} ${why}`.trim() };
          this.listeners.forEach((l) => l(this.snap));
        },
      },
    }).catch((e: any) => { this.inFlight = false; this.log({ event: "CALL_FAILED", reason: String(e?.message ?? e), number: digits }); this.emit("rejected", { error: "Call could not be placed." }); });
  }

  async answer() {
    if (this.snap.state !== "RINGING" || !this.session || this.answering) return;
    this.answering = true; this.stopRing();
    try { this.log({ event: "INBOUND_ANSWER" }); await this.session.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } }); this.log({ event: "INBOUND_ACCEPTED" }); }
    catch (e: any) {
      const denied = e?.name === "NotAllowedError" || /permission/i.test(String(e?.message));
      this.snap = { ...this.snap, error: denied ? "Microphone permission denied. Allow microphone access in the browser." : "Could not answer the call. Retry or reject the incoming call." };
      this.listeners.forEach((l) => l(this.snap)); this.log({ event: "ANSWER_FAILED", reason: e?.name ?? null });
    } finally { this.answering = false; }
  }
  private answering = false;
  async reject() {
    if (this.snap.state !== "RINGING" || !this.session) return;
    this.stopRing(); this.log({ event: "INBOUND_REJECT" });
    try { await this.session.reject(); } catch { /* caller already cancelled; Terminated cleans up */ }
  }
  async hangup() {
    const s = this.session; if (!s) return;
    const { SessionState } = this.sip;
    if (s.state === SessionState.Established) await s.bye();
    else if (typeof s.cancel === "function") await s.cancel();
  }
  setMuted(muted: boolean) {
    const pc: RTCPeerConnection | undefined = this.session?.sessionDescriptionHandler?.peerConnection;
    if (!pc || this.snap.state !== "CONNECTED") return;
    pc.getSenders().forEach((s) => { if (s.track) s.track.enabled = !muted; });
    this.snap = { ...this.snap, muted }; this.listeners.forEach((l) => l(this.snap));
  }
  sendDtmf(tone: string) { if (this.snap.state === "CONNECTED") this.session?.sessionDescriptionHandler?.sendDtmf?.(tone); }
  async stop() {
    this.stopRing();
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; } this.retries = 0;
    if (this.probe) { clearInterval(this.probe); this.probe = null; }
    try { if (this.session) await this.hangup(); } catch { /* ignore */ }
    this.releaseMedia(this.session);
    try { await this.registerer?.unregister(); } catch { /* ignore */ }
    try { await this.ua?.stop(); } catch { /* ignore */ }
    this.ua = null; this.registerer = null; this.session = null; this.inFlight = false;
    this.emit("disconnect", { error: null, remoteNumber: null, connectedAt: null, muted: false, direction: null, held: false, ringingSince: null });
  }
}
