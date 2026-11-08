import { describe, it, expect, vi } from "vitest";
import { reportEnrichment } from "@/lib/telephony/callerdesk.server";
import { isDiagAdmin } from "@/lib/telephony/webrtc-diag.functions";
import { CallerDeskWebRtcEngine, iceError } from "@/lib/telephony/callerdesk-webrtc.engine";

const REPORT = { Status: "ANSWER", CallRecordingUrl: "https://rec.example/a.mp3", TalkDuration: "42", EndTime: "2026-10-13 11:00:00", LegB_Picked_time: "2026-10-13 10:59:18" };

describe("webhook Call Report enrichment", () => {
  it("fills recording, duration, end time on an already-ended call", () => {
    const e = reportEnrichment({ status: "ended", recording_url: null, duration_seconds: null, ended_at: null, answered_at: null }, REPORT);
    expect(e.recording_url).toBe("https://rec.example/a.mp3");
    expect(e.duration_seconds).toBe(42);
    expect(e.ended_at).toBe("2026-10-13T05:30:00.000Z");
    expect(e).not.toHaveProperty("status");
  });
  it("repeat delivery of the same report is a duplicate (no fields)", () => {
    const row = { status: "ended", recording_url: "https://rec.example/a.mp3", duration_seconds: 42, ended_at: "2026-10-13T05:30:00.000Z", answered_at: "x", hangup_cause: "ANSWER" };
    expect(reportEnrichment(row, REPORT)).toEqual({});
  });
  it("preserves recording but replaces total call duration with actual talk duration", () => {
    const e = reportEnrichment({ recording_url: "https://old", duration_seconds: 10, ended_at: null }, REPORT);
    expect(e.recording_url).toBeUndefined();
    expect(e.duration_seconds).toBe(42);
  });
  it("ignores non-http recording urls", () => {
    expect(reportEnrichment({}, { CallRecordingUrl: "javascript:x" }).recording_url).toBeUndefined();
  });
});

describe("diagnostics authorization", () => {
  const ctx = (roles: string[]) => ({ userId: "u", supabase: { rpc: vi.fn(async (_: string, a: any) => ({ data: roles.includes(a._role) })) } });
  it("allows admin", async () => { expect(await isDiagAdmin(ctx(["admin"]))).toBe(true); });
  it("allows super_admin", async () => { expect(await isDiagAdmin(ctx(["super_admin"]))).toBe(true); });
  it("denies ordinary employees", async () => { expect(await isDiagAdmin(ctx(["support", "operations"]))).toBe(false); });
});

describe("engine media handling", () => {
  it("ICE failure / disconnect produce visible errors; connected does not", () => {
    expect(iceError("failed")).toMatch(/audio path failed/);
    expect(iceError("disconnected")).toMatch(/interrupted/);
    expect(iceError("connected")).toBeNull();
  });
  it("attaches remote tracks from ontrack and stops them on release", async () => {
    const stop = vi.fn();
    const track = { id: "t1", kind: "audio", stop } as any;
    class MS { t: any[] = []; addTrack(x: any) { this.t.push(x); } getTracks() { return this.t; } getAudioTracks() { return this.t; } }
    const audio = { srcObject: null as any, play: vi.fn(async () => {}), pause: vi.fn() };
    vi.stubGlobal("MediaStream", MS);
    const handlers: Record<string, Function> = {};
    const pc = { addEventListener: (n: string, f: Function) => { handlers[n] = f; }, getReceivers: () => [], getSenders: () => [], iceConnectionState: "new" };
    const eng: any = new CallerDeskWebRtcEngine(); eng.audio = audio;
    const session = { sessionDescriptionHandler: { peerConnection: pc } };
    eng.watchPeer(session); eng.watchPeer(session); // idempotent
    handlers.track({ track });
    expect(audio.srcObject.getTracks()).toEqual([track]);
    expect(audio.play).toHaveBeenCalled();
    pc.iceConnectionState = "failed"; handlers.iceconnectionstatechange();
    expect(eng.snapshot.error).toMatch(/audio path failed/);
    eng.releaseMedia(session);
    expect(stop).toHaveBeenCalled();
    expect(audio.srcObject).toBeNull();
    vi.unstubAllGlobals();
  });
  it("blocked autoplay is reported, not swallowed", async () => {
    const audio = { srcObject: null, play: vi.fn(async () => { throw Object.assign(new Error("x"), { name: "NotAllowedError" }); }), pause: vi.fn() };
    const eng: any = new CallerDeskWebRtcEngine(); eng.audio = audio;
    const logs: any[] = []; eng.onLog = (e: any) => logs.push(e);
    await eng.playAudio();
    expect(eng.snapshot.error).toMatch(/blocked call audio/);
    expect(logs[0].event).toBe("AUDIO_PLAYBACK_FAILED");
  });
  it("retries playback through a user action and clears only the playback error", async () => {
    const eng: any = new CallerDeskWebRtcEngine();
    eng.audio = { play: vi.fn().mockRejectedValueOnce(Object.assign(new Error("blocked"), { name: "NotAllowedError" })).mockResolvedValueOnce(undefined), muted: false, volume: 1 };
    await eng.resumeAudio();
    expect(eng.snapshot.error).toMatch(/blocked call audio/);
    await eng.resumeAudio();
    expect(eng.snapshot.error).toBeNull();
    expect(eng.audio.play).toHaveBeenCalledTimes(2);
  });
  it("answers, rejects, hangs up, mutes and sends DTMF through the existing session", async () => {
    const eng: any = new CallerDeskWebRtcEngine(); eng.mic = vi.fn(async () => true);
    const track = { enabled: true };
    const sendDtmf = vi.fn();
    eng.sip = { SessionState: { Established: "established" } };
    const session = { state: "established", accept: vi.fn(async () => {}), reject: vi.fn(async () => {}), bye: vi.fn(async () => {}), sessionDescriptionHandler: { sendDtmf, peerConnection: { getSenders: () => [{ track }] } } };
    eng.session = session; eng.snap.state = "RINGING";
    await eng.answer(); expect(session.accept).toHaveBeenCalledTimes(1);
    await eng.reject(); expect(session.reject).toHaveBeenCalledTimes(1);
    eng.snap.state = "CONNECTED";
    eng.setMuted(true); expect(track.enabled).toBe(false);
    eng.setMuted(false); expect(track.enabled).toBe(true);
    eng.sendDtmf("1"); expect(sendDtmf).toHaveBeenCalledWith("1");
    await eng.hangup(); expect(session.bye).toHaveBeenCalledTimes(1);
  });
  it("cleans up an earlier transport before a failed reconnect", async () => {
    const eng: any = new CallerDeskWebRtcEngine();
    const stop = vi.fn(async () => {}); eng.ua = { stop };
    await eng.start(async () => { throw new Error("configuration unavailable"); });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(eng.snapshot.state).toBe("FAILED");
    expect(eng.starting).toBe(false);
  });
});

import { summarizeSdp, summarizeStats } from "@/lib/telephony/callerdesk-webrtc.engine";
describe("safe media diagnostics", () => {
  const SDP = "v=0\r\nc=IN IP4 10.1.2.3\r\nm=audio 4000 UDP/TLS/RTP/SAVPF 0 101\r\na=rtpmap:0 PCMU/8000\r\na=rtpmap:101 telephone-event/8000\r\na=ice-pwd:SECRET\r\na=recvonly\r\n";
  it("reports audio direction and codecs without IPs or ICE secrets", () => {
    const out = summarizeSdp(SDP);
    expect(out).toContain("dir=recvonly");
    expect(out).toContain("codecs=PCMU");
    expect(out).not.toMatch(/10\.1\.2\.3|SECRET/);
  });
  it("summarises inbound/outbound RTP and selected pair without addresses", () => {
    const out = summarizeStats([
      { id: "i", type: "inbound-rtp", kind: "audio", packetsReceived: 0, bytesReceived: 0, packetsLost: 0, jitter: 0 },
      { id: "o", type: "outbound-rtp", kind: "audio", packetsSent: 250, bytesSent: 40000 },
      { id: "t", type: "transport", selectedCandidatePairId: "p" },
      { id: "p", type: "candidate-pair", localCandidateId: "l", remoteCandidateId: "r", currentRoundTripTime: 0.05 },
      { id: "l", type: "local-candidate", candidateType: "host", protocol: "udp", address: "10.0.0.9" },
      { id: "r", type: "remote-candidate", candidateType: "host", address: "1.2.3.4" },
    ]);
    expect(out).toContain("in: pkts=0");
    expect(out).toContain("out: pkts=250");
    expect(out).toContain("host/udp->host");
    expect(out).not.toMatch(/10\.0\.0\.9|1\.2\.3\.4/);
  });
});
