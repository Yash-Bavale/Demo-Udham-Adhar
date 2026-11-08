import { describe, it, expect } from "vitest";
import { callerFromInvite } from "@/lib/telephony/callerdesk-webrtc.engine";
import { nextState } from "@/lib/telephony/callerdesk-webrtc.config";
const inv = (h: Record<string, string>, user?: string) => ({ request: { getHeader: (n: string) => h[n] ?? null }, remoteIdentity: { uri: { user }, displayName: "" } });
describe("incoming INVITE", () => {
  it("prefers P-Asserted-Identity", () => expect(callerFromInvite(inv({ "P-Asserted-Identity": "<sip:9876543210@x>" }, "asterisk"))).toBe("9876543210"));
  it("falls back to From user", () => expect(callerFromInvite(inv({}, "09561396866"))).toBe("09561396866"));
  it("returns null without a number", () => expect(callerFromInvite(inv({}, "asterisk"))).toBeNull());
  it("ringing → connected on accept, ended on cancel/reject", () => {
    expect(nextState("REGISTERED", "incoming")).toBe("RINGING");
    expect(nextState("RINGING", "accepted")).toBe("CONNECTED");
    expect(nextState("RINGING", "rejected")).toBe("ENDED");
    expect(nextState("ENDED", "reset")).toBe("REGISTERED");
  });
  it("outbound still dials from Ready", () => expect(nextState("REGISTERED", "dial")).toBe("CALLING"));
});

import { summarizeSipFrame } from "@/lib/telephony/callerdesk-webrtc.engine";
describe("summarizeSipFrame (sanitized SIP diagnostics)", () => {
  it("summarizes an INVITE without URI or numbers", () => {
    const f = summarizeSipFrame("INVITE sip:09561396866@app.callerdesk.io SIP/2.0\r\nCSeq: 1 INVITE\r\nAuthorization: Digest secret\r\n");
    expect(f).toEqual({ kind: "request", method: "INVITE", code: null, cseq: "INVITE" });
    expect(JSON.stringify(f)).not.toContain("0956");
  });
  it("summarizes a REGISTER response", () => {
    expect(summarizeSipFrame("SIP/2.0 401 Unauthorized\r\nCSeq: 2 REGISTER\r\n")).toEqual({ kind: "response", method: "REGISTER", code: 401, cseq: "REGISTER" });
  });
  it("ignores keep-alive CRLF", () => { expect(summarizeSipFrame("\r\n\r\n")).toBeNull(); });
});
