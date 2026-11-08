import { describe, expect, it } from "vitest";
import { buildWssUrl, canDial, missingConfig, nextState, redact, webRtcAccess, WEBRTC_CONFIG_NAMES } from "@/lib/telephony/callerdesk-webrtc.config";

const full = Object.fromEntries(WEBRTC_CONFIG_NAMES.map((n) => [n, n === "CALLERDESK_WS_PORT" ? "4443" : n === "CALLERDESK_WS_PATH" ? "/ws" : "x-value"]));
const SID = "58ae8526-a228-4085-8978-308ec9eee4d6";

describe("CallerDesk WebRTC (mocked, no network)", () => {
  it("reports every missing setting when nothing is configured", () => {
    expect(missingConfig({})).toHaveLength(7);
  });
  it("blocks registration while config is missing even for Sid", () => {
    expect(webRtcAccess({ userId: SID, account: null, enabledFlag: "true", env: {} }).canRegister).toBe(false);
  });
  it("blocks registration when the feature flag is off", () => {
    expect(webRtcAccess({ userId: SID, account: null, enabledFlag: undefined, env: full }).canRegister).toBe(false);
  });
  it("denies other employees even with full config", () => {
    const a = webRtcAccess({ userId: "00000000-0000-0000-0000-000000000000", account: null, enabledFlag: "true", env: full });
    expect(a.authorized).toBe(false);
    expect(a.canRegister).toBe(false);
  });
  it("does not release Sid's SIP credentials to another user sharing his member mapping", () => {
    expect(webRtcAccess({ userId: "other", account: null, enabledFlag: "true", env: full }).canRegister).toBe(false);
    expect(webRtcAccess({ userId: SID, account: null, enabledFlag: "true", env: full }).canRegister).toBe(true);
  });
  it("rejects invalid endpoints", () => {
    expect(buildWssUrl("bad host", "4443", "/ws")).toBeNull();
    expect(buildWssUrl("10.0.0.5", "99999", "/ws")).toBeNull();
    expect(buildWssUrl("10.0.0.5", "4443", "ws")).toBe("wss://10.0.0.5:4443/ws");
  });
  it("only reaches REGISTERED after a real registered event", () => {
    let s = nextState("DISCONNECTED", "check");
    s = nextState(s, "config_ok");
    expect(s).toBe("CONNECTING");
    expect(nextState(s, "accepted")).toBe("CONNECTING");
    expect(nextState(s, "register_failed")).toBe("FAILED");
    expect(nextState(s, "registered")).toBe("REGISTERED");
  });
  it("missing config goes to SETUP_INCOMPLETE", () => {
    expect(nextState("CHECKING_CONFIGURATION", "config_missing")).toBe("SETUP_INCOMPLETE");
  });
  it("outbound transitions", () => {
    expect(nextState("REGISTERED", "dial")).toBe("CALLING");
    expect(nextState("CALLING", "accepted")).toBe("CONNECTED");
    expect(nextState("CALLING", "rejected")).toBe("ENDED");
    expect(nextState("CONNECTED", "hangup")).toBe("ENDED");
  });
  it("inbound transitions", () => {
    expect(nextState("REGISTERED", "incoming")).toBe("RINGING");
    expect(nextState("RINGING", "accepted")).toBe("CONNECTED");
    expect(nextState("RINGING", "rejected")).toBe("ENDED");
  });
  it("prevents duplicate dialing while a call is in flight", () => {
    expect(canDial("REGISTERED", true)).toBe(false);
    expect(canDial("CALLING", false)).toBe(false);
    expect(canDial("REGISTERED", false)).toBe(true);
  });
  it("redacts secrets and full phone numbers", () => {
    const out = redact("pw=hunter2 to 919767100075", ["hunter2"]);
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("9767100075");
  });
});

import { registrationError } from "@/lib/telephony/callerdesk-webrtc.config";
describe("CallerDesk registration errors", () => {
  it("bad credentials are reported as a login problem", () => {
    expect(registrationError(401)).toMatch(/SIP login/);
    expect(registrationError(403)).toMatch(/SIP login/);
  });
  it("unreachable server points to the VPN", () => {
    expect(registrationError(408)).toMatch(/VPN/);
    expect(registrationError(503)).toMatch(/VPN/);
  });
  it("transport loss while connecting fails instead of showing Ready", () => {
    expect(nextState("CONNECTING", "transport_lost")).toBe("FAILED");
  });
  it("disconnect always returns to Disconnected", () => {
    expect(nextState("CONNECTED", "disconnect")).toBe("DISCONNECTED");
  });
});
